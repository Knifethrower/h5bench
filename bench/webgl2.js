// h5bench module "webgl2": WebGL 2 features and the draw patterns of modern engines (instancing, uniform buffers,
// vertex array objects, multiple render targets, texture arrays, transform feedback, MSAA). Checks are named by
// the areas of the Khronos WebGL conformance suite (conformance2/: buffers, glsl, rendering, state, textures, ...)
// and render and read back where they can, so a check proves the feature works, not only that it exists.
// Engines without WebGL 2 get every check as missing and every timing skipped.
"use strict";
(function () {
  let gl = null, tried = false;
  const ctx = () => {
    if (!tried) { tried = true; try { gl = H5B.getCanvas(640, 480, "webgl2").getContext("webgl2", { alpha: false, antialias: false }); } catch (_) { gl = null; } }
    return gl;
  };
  const px1 = new Uint8Array(4);
  const sync = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1); };
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s)); return s; };
  const prog = (vs, fs, varyings) => {
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    if (varyings) gl.transformFeedbackVaryings(p, varyings, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p)); return p;
  };
  const V = "#version 300 es\n", F = "#version 300 es\nprecision highp float;\n";
  // A full-screen triangle from gl_VertexID (no buffers needed).
  const FULL_VS = V + "void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }";
  // Instanced 32x32 sprites: corner per vertex (location 0), x/y/u/v per instance (location 1), optional layer.
  const SPRITE_VS = V + "layout(location=0) in vec2 corner; layout(location=1) in vec4 inst; uniform vec2 res; out vec3 uv;\n" +
    "void main(){ uv = vec3(corner * 0.25 + inst.zw, float(gl_InstanceID & 7)); vec2 p = inst.xy + corner * 32.0;\n" +
    "  gl_Position = vec4(p / res * 2.0 - 1.0, 0.0, 1.0); gl_Position.y = -gl_Position.y; }";
  const SPRITE_FS = F + "in vec3 uv; uniform sampler2D t; out vec4 o; void main(){ o = texture(t, uv.xy); }";
  const ARRAY_FS = F + "precision highp sampler2DArray; in vec3 uv; uniform sampler2DArray t; out vec4 o; void main(){ o = texture(t, uv); }";
  const pixels = (w, h, seed) => { const p = new Uint8Array(w * h * 4); for (let i = 0; i < p.length; i += 4) { const x = (i >> 2) % w, y = ((i >> 2) / w) | 0; p[i] = (x * 5 + seed * 40) & 255; p[i + 1] = (y * 3) & 255; p[i + 2] = ((x ^ y) + seed * 70) & 255; p[i + 3] = (x & 31) < 2 || (y & 31) < 2 ? 0 : 255; } return p; };
  const atlas = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 256, 256); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, pixels(256, 256, 1)); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; };
  const target = (w, h, fmt = gl.RGBA8) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, fmt, w, h); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; };
  const fbo = (...texs) => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0)); return f; };
  const read = (x, y) => { const p = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return Array.from(p); };
  const same = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  // Instanced sprite renderer: n sprites, per-instance data rewritten every frame (as WebGL 2 batchers do).
  const sprites = (max, fs = SPRITE_FS) => {
    const p = prog(SPRITE_VS, fs), vao = gl.createVertexArray(), inst = new Float32Array(max * 4);
    gl.bindVertexArray(vao);
    const cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferData(gl.ARRAY_BUFFER, inst.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    const use = (w = 640, h = 480) => { gl.useProgram(p); gl.uniform2f(gl.getUniformLocation(p, "res"), w, h); gl.bindVertexArray(vao); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); };
    const draw = (n, t) => {
      for (let i = 0; i < n; i++) { const o = i * 4; inst[o] = (i * 37 + t * 0.05 * ((i & 7) + 1)) % 640; inst[o + 1] = (i * 53) % 480; inst[o + 2] = (i & 3) * 0.25; inst[o + 3] = ((i >> 2) & 3) * 0.25; }
      gl.bindBuffer(gl.ARRAY_BUFFER, ib); gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, n * 4);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    };
    return { p, vao, use, draw };
  };
  const clear = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, 640, 480); gl.clearColor(0.1, 0.1, 0.15, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
  // A check that needs WebGL 2: missing without it; fn may also return H5B.MISSING for an absent extension.
  const check = (name, fn) => H5B.check(name, () => (ctx() ? fn() : H5B.MISSING));
  // A timing that needs WebGL 2 (and maybe an extension): skipped without it.
  const timed = (name, kind, opts, needExt) => {
    if (!ctx()) return H5B.skip(name, "no WebGL 2");
    if (needExt && !gl.getExtension(needExt)) return H5B.skip(name, "no " + needExt);
    return H5B[kind](name, Object.assign({ sync }, opts));
  };

  H5B.suite("webgl2", [
    ["check.context", () => H5B.check("context.webgl2", () => (ctx() ? true : H5B.MISSING))],
    ["check.limits", () => check("state.limits_minimums", () => {
      const L = { MAX_DRAW_BUFFERS: 4, MAX_COLOR_ATTACHMENTS: 4, MAX_3D_TEXTURE_SIZE: 256, MAX_ARRAY_TEXTURE_LAYERS: 256, MAX_UNIFORM_BUFFER_BINDINGS: 24, MAX_UNIFORM_BLOCK_SIZE: 16384, MAX_SAMPLES: 4, MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS: 4 };
      const low = []; for (const [k, min] of Object.entries(L)) { const v = gl.getParameter(gl[k]); H5B.info("limit_" + k.toLowerCase(), v); if (!(v >= min)) low.push(k + "=" + v); }
      return low.length ? "below the spec: " + low.join(",") : true;
    })],
    ["check.glsl", () => check("glsl.es300_compile_link", () => { const p = prog(SPRITE_VS, SPRITE_FS); gl.deleteProgram(p); return true; })],
    ["check.vao", () => check("state.vertex_array_object", () => {
      const a = gl.createVertexArray(), b = gl.createVertexArray();
      gl.bindVertexArray(a); gl.enableVertexAttribArray(3); gl.bindVertexArray(b); const offB = gl.getVertexAttrib(3, gl.VERTEX_ATTRIB_ARRAY_ENABLED);
      gl.bindVertexArray(a); const onA = gl.getVertexAttrib(3, gl.VERTEX_ATTRIB_ARRAY_ENABLED); gl.bindVertexArray(null);
      return (onA === true && offB === false) || `a=${onA} b=${offB}`;
    })],
    ["check.instanced", () => check("rendering.instanced_instance_id", () => {
      const t = target(4, 1), f = fbo(t); gl.viewport(0, 0, 4, 1); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const p = prog(V + "void main(){ gl_PointSize = 1.0; gl_Position = vec4((float(gl_InstanceID) + 0.5) / 2.0 - 1.0, 0.0, 0.0, 1.0); }", F + "out vec4 o; void main(){ o = vec4(1.0, 0.5, 0.0, 1.0); }");
      gl.useProgram(p); gl.drawArraysInstanced(gl.POINTS, 0, 1, 4);
      const got = [0, 1, 2, 3].map((x) => read(x, 0)[0]); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return got.every((v) => v === 255) || "instances drawn: " + got.join(",");
    })],
    ["check.mrt", () => check("rendering.multiple_render_targets", () => {
      const ts = [0, 1, 2, 3].map(() => target(8, 8)), f = fbo(...ts);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]); gl.viewport(0, 0, 8, 8);
      const p = prog(FULL_VS, F + "layout(location=0) out vec4 a; layout(location=1) out vec4 b; layout(location=2) out vec4 c; layout(location=3) out vec4 d;\nvoid main(){ a = vec4(1,0,0,1); b = vec4(0,1,0,1); c = vec4(0,0,1,1); d = vec4(1,1,1,1); }");
      gl.useProgram(p); gl.drawArrays(gl.TRIANGLES, 0, 3);
      const want = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255]], bad = [];
      for (let i = 0; i < 4; i++) { gl.readBuffer(gl.COLOR_ATTACHMENT0 + i); const g = read(4, 4); if (!same(g, want[i])) bad.push(i + ":" + g); }
      gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return bad.length ? "targets " + bad.join(" ") : true;
    })],
    ["check.texstorage", () => check("textures.tex_storage_immutable", () => { const t = target(64, 32); return gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_IMMUTABLE_FORMAT) === true || "not immutable"; })],
    ["check.tex3d", () => check("textures.3d_and_2d_array_texel_fetch", () => {
      const a = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, a); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 2, 2, 3);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 2, 2, 2, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255, 10, 20, 30, 255]));
      const d = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, d); gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 2, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(32).fill(200)); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      const t = target(1, 1), f = fbo(t); gl.viewport(0, 0, 1, 1);
      const p = prog(FULL_VS, F + "precision highp sampler2DArray; precision highp sampler3D; uniform sampler2DArray a; uniform sampler3D d; out vec4 o;\nvoid main(){ o = vec4(texelFetch(a, ivec3(1, 1, 2), 0).rgb, texelFetch(d, ivec3(1, 1, 1), 0).r); }");
      gl.useProgram(p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, a); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, d);
      gl.uniform1i(gl.getUniformLocation(p, "a"), 0); gl.uniform1i(gl.getUniformLocation(p, "d"), 1); gl.drawArrays(gl.TRIANGLES, 0, 3);
      const g = read(0, 0); gl.activeTexture(gl.TEXTURE0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return same(g, [10, 20, 30, 200]) || "fetched " + g;
    })],
    ["check.ubo", () => check("buffers.uniform_buffer_object", () => {
      const t = target(1, 1), f = fbo(t); gl.viewport(0, 0, 1, 1);
      const p = prog(FULL_VS, F + "layout(std140) uniform Tint { vec4 color; float scale; }; out vec4 o; void main(){ o = color * scale; }");
      const ub = gl.createBuffer(); gl.bindBuffer(gl.UNIFORM_BUFFER, ub); gl.bufferData(gl.UNIFORM_BUFFER, new Float32Array([0.5, 0.25, 1, 1, 0.8, 0, 0, 0]), gl.DYNAMIC_DRAW);
      gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p, "Tint"), 2); gl.bindBufferBase(gl.UNIFORM_BUFFER, 2, ub);
      gl.useProgram(p); gl.drawArrays(gl.TRIANGLES, 0, 3); const g = read(0, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return same(g, [102, 51, 204, 204]) || "got " + g;
    })],
    ["check.tf", () => check("buffers.transform_feedback", () => {
      const p = prog(V + "layout(location=0) in float x; out float y; void main(){ y = x * 2.0 + 1.0; gl_Position = vec4(0.0); }", F + "out vec4 o; void main(){ o = vec4(1.0); }", ["y"]);
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const src = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, src); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 2, 3, 4]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);
      const dst = gl.createBuffer(); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, dst); gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 16, gl.STREAM_READ); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
      const tf = gl.createTransformFeedback(); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, dst);
      gl.useProgram(p); gl.enable(gl.RASTERIZER_DISCARD); gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, 4); gl.endTransformFeedback(); gl.disable(gl.RASTERIZER_DISCARD);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null); gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, null);
      const out = new Float32Array(4); gl.bindBuffer(gl.COPY_READ_BUFFER, dst); gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, out); gl.bindVertexArray(null);
      return out.join(",") === "3,5,7,9" || "captured " + Array.from(out).join(",");
    })],
    ["check.copybuffer", () => check("buffers.copy_buffer_sub_data", () => {
      const a = gl.createBuffer(), b = gl.createBuffer(); gl.bindBuffer(gl.COPY_READ_BUFFER, a); gl.bufferData(gl.COPY_READ_BUFFER, new Uint8Array([1, 2, 3, 4, 5, 6]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.COPY_WRITE_BUFFER, b); gl.bufferData(gl.COPY_WRITE_BUFFER, 4, gl.STATIC_READ); gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER, 2, 0, 4);
      const o = new Uint8Array(4); gl.getBufferSubData(gl.COPY_WRITE_BUFFER, 0, o); return o.join(",") === "3,4,5,6" || "copied " + o.join(",");
    })],
    ["check.sampler", () => check("textures.sampler_objects", () => {
      const s = gl.createSampler(); gl.samplerParameteri(s, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.bindSampler(0, s);
      const ok = gl.getSamplerParameter(s, gl.TEXTURE_MIN_FILTER) === gl.LINEAR; gl.bindSampler(0, null); return ok;
    })],
    ["check.int_tex", () => check("textures.integer_formats", () => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8UI, 1, 1); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, new Uint8Array([7, 70, 170, 255]));
      const r = target(1, 1), f = fbo(r); gl.viewport(0, 0, 1, 1);
      const p = prog(FULL_VS, F + "precision highp usampler2D; uniform usampler2D u; out vec4 o; void main(){ uvec4 v = texelFetch(u, ivec2(0), 0); o = vec4(v) / 255.0; }");
      gl.useProgram(p); gl.bindTexture(gl.TEXTURE_2D, t); gl.drawArrays(gl.TRIANGLES, 0, 3); const g = read(0, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return same(g, [7, 70, 170, 255]) || "got " + g;
    })],
    ["check.float_rt", () => check("rendering.float_render_target", () => {
      if (!gl.getExtension("EXT_color_buffer_float")) return H5B.MISSING;
      const t = target(4, 4, gl.RGBA16F), f = fbo(t); const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; gl.bindFramebuffer(gl.FRAMEBUFFER, null); return ok || "RGBA16F framebuffer incomplete";
    })],
    ["check.msaa", () => check("rendering.msaa_renderbuffer_blit_resolve", () => {
      const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA8, 16, 16);
      const ms = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, ms); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return "4x MSAA framebuffer incomplete";
      gl.viewport(0, 0, 16, 16); gl.clearColor(0, 1, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      const t = target(16, 16), res = fbo(t); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, res);
      gl.blitFramebuffer(0, 0, 16, 16, 0, 0, 16, 16, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, res); const g = read(8, 8); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return same(g, [0, 255, 0, 255]) || "resolved " + g;
    })],
    ["check.pbo", () => check("buffers.pixel_pack_buffer_readback", () => {
      const t = target(4, 4), f = fbo(t); gl.viewport(0, 0, 4, 4); gl.clearColor(1, 0, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      const pb = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pb); gl.bufferData(gl.PIXEL_PACK_BUFFER, 64, gl.STREAM_READ);
      gl.readPixels(0, 0, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, 0); const o = new Uint8Array(64); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, o); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return same(Array.from(o.subarray(20, 24)), [255, 0, 255, 255]) || "read " + Array.from(o.subarray(20, 24));
    })],
    // WebGL 2 keeps a fence unsignaled until the page returns to the event loop (spec 5.37), so it is polled across
    // tasks, as the conformance suite does; up to 1 s.
    ["check.fence", () => check("state.fence_sync", async () => {
      const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
      const t0 = H5B.now(); let r = gl.TIMEOUT_EXPIRED;
      while (r === gl.TIMEOUT_EXPIRED && H5B.now() - t0 < 1000) { await new Promise((res) => setTimeout(res, 5)); r = gl.clientWaitSync(s, 0, 0); }
      gl.deleteSync(s);
      return r === gl.ALREADY_SIGNALED || r === gl.CONDITION_SATISFIED || "still 0x" + r.toString(16) + " after 1 s";
    })],
    ["check.query", () => check("state.occlusion_query_api", () => { const q = gl.createQuery(); gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, q); gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE); const ok = gl.isQuery(q); gl.deleteQuery(q); return ok; })],
    ["check.npot", () => check("textures.npot_mipmap_repeat", () => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 100, 60, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels(100, 60, 2));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.generateMipmap(gl.TEXTURE_2D); return gl.getError() === 0 || "error after generateMipmap";
    })],
    ["check.errors", () => check("state.no_gl_errors_so_far", () => { const e = gl.getError(); return e === 0 || "error 0x" + e.toString(16); })],

    ["instanced", () => { let s; return timed("instanced.sprites_32px", "ramp", { setup: () => { s = sprites(1 << 17); s.use(); gl.bindTexture(gl.TEXTURE_2D, atlas()); }, frame: (_, n) => { clear(); s.draw(n, H5B.now()); } }); }],
    ["ubo", () => { let p, ub, data; return timed("ubo.update_and_draw_each", "ramp", { start: 16, setup: () => { p = prog(FULL_VS, F + "layout(std140) uniform U { vec4 c; vec4 r; }; out vec4 o; void main(){ if (gl_FragCoord.x < r.x || gl_FragCoord.x > r.y) discard; o = c; }"); ub = gl.createBuffer(); gl.bindBuffer(gl.UNIFORM_BUFFER, ub); gl.bufferData(gl.UNIFORM_BUFFER, 32, gl.DYNAMIC_DRAW); gl.uniformBlockBinding(p, 0, 0); gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ub); data = new Float32Array(8); }, frame: (_, n) => { clear(); gl.useProgram(p); gl.bindVertexArray(null); gl.disable(gl.BLEND); gl.bindBuffer(gl.UNIFORM_BUFFER, ub); for (let i = 0; i < n; i++) { data[0] = (i & 7) / 7; data[1] = 0.5; data[2] = 1; data[3] = 1; data[4] = (i * 7) % 600; data[5] = data[4] + 4; gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data); gl.drawArrays(gl.TRIANGLES, 0, 3); } } }); }],
    ["vao", () => { let a, b; return timed("state.vao_switches", "ramp", { start: 16, setup: () => { a = sprites(4); b = sprites(4); gl.bindTexture(gl.TEXTURE_2D, atlas()); }, frame: (_, n) => { clear(); for (let i = 0; i < n; i++) { const s = i & 1 ? b : a; s.use(); s.draw(4, i); } } }); }],
    ["mrt", () => { let s, f, ts; return timed("mrt.gbuffer_4_targets_2000_sprites", "frames", { seconds: 3, setup: () => { s = sprites(2000, F + "in vec3 uv; uniform sampler2D t; layout(location=0) out vec4 a; layout(location=1) out vec4 b; layout(location=2) out vec4 c; layout(location=3) out vec4 d;\nvoid main(){ vec4 x = texture(t, uv.xy); a = x; b = x.bgra; c = vec4(uv, 1.0); d = vec4(1.0 - x.rgb, 1.0); }"); ts = [0, 1, 2, 3].map(() => target(640, 480)); f = fbo(...ts); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]); gl.bindTexture(gl.TEXTURE_2D, atlas()); }, frame: (_, i, t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.viewport(0, 0, 640, 480); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); s.use(); s.draw(2000, t); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, f); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); gl.blitFramebuffer(0, 0, 640, 480, 0, 0, 640, 480, gl.COLOR_BUFFER_BIT, gl.NEAREST); } }); }],
    ["texarray", () => { let s; return timed("texarray.sprites_8_layers", "ramp", { setup: () => { s = sprites(1 << 17, ARRAY_FS); s.use(); const a = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, a); gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 256, 256, 8); for (let l = 0; l < 8; l++) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, l, 256, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels(256, 256, l)); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }, frame: (_, n) => { clear(); s.draw(n, H5B.now()); } }); }],
    ["tf.particles", () => { let p, draw, vaos, bufs, tfo, k = 0; const N = 100000; return timed("tf.particles_100k_update_and_draw", "frames", { seconds: 3, setup: () => {
      p = prog(V + "layout(location=0) in vec4 s; out vec4 o; void main(){ vec2 v = s.zw; vec2 q = s.xy + v; if (q.x < -1.0 || q.x > 1.0) v.x = -v.x; if (q.y < -1.0 || q.y > 1.0) v.y = -v.y; o = vec4(q, v); }", F + "out vec4 c; void main(){ c = vec4(1.0); }", ["o"]);
      draw = prog(V + "layout(location=0) in vec4 s; void main(){ gl_PointSize = 1.0; gl_Position = vec4(s.xy, 0.0, 1.0); }", F + "out vec4 c; void main(){ c = vec4(1.0, 0.8, 0.3, 1.0); }");
      const init = new Float32Array(N * 4); const r = H5B.rng(5); for (let i = 0; i < init.length; i += 4) { init[i] = r() * 2 - 1; init[i + 1] = r() * 2 - 1; init[i + 2] = (r() - 0.5) * 0.01; init[i + 3] = (r() - 0.5) * 0.01; }
      bufs = [0, 1].map(() => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY); return b; });
      vaos = bufs.map((b) => { const v = gl.createVertexArray(); gl.bindVertexArray(v); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0); return v; }); gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
      tfo = gl.createTransformFeedback(); }, frame: () => {
      clear(); gl.disable(gl.BLEND); gl.bindBuffer(gl.ARRAY_BUFFER, null); const a = k & 1, b = a ^ 1; k++;
      gl.useProgram(p); gl.bindVertexArray(vaos[a]); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tfo); gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, bufs[b]);
      gl.enable(gl.RASTERIZER_DISCARD); gl.beginTransformFeedback(gl.POINTS); gl.drawArrays(gl.POINTS, 0, N); gl.endTransformFeedback(); gl.disable(gl.RASTERIZER_DISCARD);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null); gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      gl.useProgram(draw); gl.bindVertexArray(vaos[b]); gl.drawArrays(gl.POINTS, 0, N); gl.bindVertexArray(null); } }); }],
    ["msaa", () => { let s, ms, rb, res; return timed("msaa.4x_2000_sprites_resolve", "frames", { seconds: 3, setup: () => { s = sprites(2000); res = fbo(target(640, 480)); rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA8, 640, 480); ms = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, ms); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb); gl.bindTexture(gl.TEXTURE_2D, atlas()); }, frame: (_, i, t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, ms); gl.viewport(0, 0, 640, 480); gl.clearColor(0.1, 0.1, 0.15, 1); gl.clear(gl.COLOR_BUFFER_BIT); s.use(); s.draw(2000, t); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, ms); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, res); gl.blitFramebuffer(0, 0, 640, 480, 0, 0, 640, 480, gl.COLOR_BUFFER_BIT, gl.NEAREST); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, res); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null); gl.blitFramebuffer(0, 0, 640, 480, 0, 0, 640, 480, gl.COLOR_BUFFER_BIT, gl.NEAREST); } }); }],
    ["float", () => { let s, f, ft, at, show; return timed("float.rgba16f_target_2000_sprites", "frames", { seconds: 3, setup: () => { s = sprites(2000); ft = target(640, 480, gl.RGBA16F); f = fbo(ft); at = atlas(); show = prog(FULL_VS, F + "uniform sampler2D t; out vec4 o; void main(){ o = texelFetch(t, ivec2(gl_FragCoord.xy), 0); }"); }, frame: (_, i, t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.viewport(0, 0, 640, 480); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); s.use(); gl.bindTexture(gl.TEXTURE_2D, at); s.draw(2000, t); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.BLEND); gl.useProgram(show); gl.bindVertexArray(null); gl.bindTexture(gl.TEXTURE_2D, ft); gl.drawArrays(gl.TRIANGLES, 0, 3); } }, "EXT_color_buffer_float"); }],
    ["pbo", () => { if (!ctx()) return H5B.skip("readback.pbo_fenced_640x480", "no WebGL 2"); let pb; const out = new Uint8Array(640 * 480 * 4); return H5B.once("readback.pbo_fenced_640x480", async () => { clear(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pb); gl.readPixels(0, 0, 640, 480, gl.RGBA, gl.UNSIGNED_BYTE, 0); const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); while (gl.clientWaitSync(s, 0, 0) === gl.TIMEOUT_EXPIRED) await new Promise((r) => setTimeout(r, 1)); gl.deleteSync(s); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); }, { runs: 9, setup: () => { pb = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pb); gl.bufferData(gl.PIXEL_PACK_BUFFER, out.length, gl.STREAM_READ); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); } }); }],
  ]);
})();
