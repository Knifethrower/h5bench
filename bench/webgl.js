// h5bench page "webgl": WebGL 1 features and the draw patterns 2D game engines use (PIXI, Construct, Phaser).
"use strict";
(function () {
  let gl = null;
  const ctx = () => {
    if (!gl) {
      const c = H5B.getCanvas(640, 480);
      gl = c.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false });
    }
    return gl;
  };
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s)); return s; };
  const prog = (vs, fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, "p"); gl.bindAttribLocation(p, 1, "uv"); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p)); return p; };
  const SPRITE_VS = "attribute vec2 p; attribute vec2 uv; varying vec2 v; uniform vec2 res; void main(){ v = uv; gl_Position = vec4(p / res * 2.0 - 1.0, 0.0, 1.0); gl_Position.y = -gl_Position.y; }";
  const SPRITE_FS = "precision mediump float; varying vec2 v; uniform sampler2D t; uniform vec4 tint; void main(){ gl_FragColor = texture2D(t, v) * tint; }";
  // A 256x256 atlas of 16 colored cells, made in code (no file needed).
  const atlas = () => {
    const px = new Uint8Array(256 * 256 * 4);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const i = (y * 256 + x) * 4, c = ((x >> 6) + (y >> 6) * 4); px[i] = c * 16; px[i + 1] = 255 - c * 12; px[i + 2] = (x ^ y) & 255; px[i + 3] = (x & 63) < 4 || (y & 63) < 4 ? 0 : 255; }
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  // Sprite batcher: up to `max` quads, positions rewritten every frame (as PIXI/Construct do).
  const batcher = (max) => {
    const p = prog(SPRITE_VS, SPRITE_FS);
    const verts = new Float32Array(max * 16), idx = new Uint16Array(Math.min(max, 16383) * 6);
    for (let i = 0, v = 0; i < idx.length; i += 6, v += 4) idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i);
    const vb = gl.createBuffer(), ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, verts.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    const tex = atlas();
    const use = () => {
      gl.useProgram(p); gl.uniform2f(gl.getUniformLocation(p, "res"), 640, 480); gl.uniform4f(gl.getUniformLocation(p, "tint"), 1, 1, 1, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    };
    // n sprites of 32x32 moving over the screen; drawn in chunks of 16383 (16-bit indices).
    const draw = (n, t) => {
      for (let base = 0; base < n; base += 16383) {
        const m = Math.min(16383, n - base);
        for (let i = 0; i < m; i++) {
          const k = base + i, x = (k * 37 + t * 0.05 * ((k & 7) + 1)) % 640, y = (k * 53) % 480, u = (k & 3) * 0.25, w = ((k >> 2) & 3) * 0.25, o = i * 16;
          verts[o] = x; verts[o + 1] = y; verts[o + 2] = u; verts[o + 3] = w;
          verts[o + 4] = x + 32; verts[o + 5] = y; verts[o + 6] = u + 0.25; verts[o + 7] = w;
          verts[o + 8] = x; verts[o + 9] = y + 32; verts[o + 10] = u; verts[o + 11] = w + 0.25;
          verts[o + 12] = x + 32; verts[o + 13] = y + 32; verts[o + 14] = u + 0.25; verts[o + 15] = w + 0.25;
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts.subarray(0, m * 16));
        gl.drawElements(gl.TRIANGLES, m * 6, gl.UNSIGNED_SHORT, 0);
      }
    };
    return { p, use, draw, tex };
  };
  // Each frame ends with a 1x1 readback: the frame then waits for the GPU everywhere (see H5B.frames).
  const px1 = new Uint8Array(4);
  const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px1);
  const clear = () => { gl.clearColor(0.1, 0.1, 0.15, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
  const ext = (name) => H5B.check("ext." + name, () => (ctx() && gl.getSupportedExtensions().includes(name) ? !!gl.getExtension(name) : H5B.MISSING));

  H5B.suite("webgl", [
    ["check.context", () => H5B.check("context_webgl", () => (ctx() ? true : H5B.MISSING))],
    ["check.webgl2", () => H5B.check("context_webgl2", () => (document.createElement("canvas").getContext("webgl2") ? true : H5B.MISSING))],
    ["check.ext", async () => { for (const e of ["OES_vertex_array_object", "ANGLE_instanced_arrays", "OES_element_index_uint", "OES_texture_float", "OES_texture_half_float", "OES_standard_derivatives", "WEBGL_depth_texture", "EXT_blend_minmax", "WEBGL_lose_context", "WEBGL_compressed_texture_etc1"]) await ext(e); }],
    ["check.maxtex", () => H5B.check("max_texture_size_2048", () => { const m = ctx().getParameter(gl.MAX_TEXTURE_SIZE); H5B.info("max_texture_size", m); return m >= 2048 || "only " + m; })],
    ["check.clear_readback", () => H5B.check("clear_readpixels", () => { const c = H5B.getCanvas(640, 480); ctx(); gl.viewport(0, 0, c.width, c.height); gl.clearColor(1, 0.5, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); const px = new Uint8Array(4); gl.readPixels(10, 10, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return (px[0] === 255 && Math.abs(px[1] - 128) <= 1 && px[2] === 0) || "got " + Array.from(px).join(","); })],
    ["check.tex_null_zero", () => H5B.check("teximage_null_is_zero", () => {
      ctx();
      const fb = gl.createFramebuffer(), bad = [];
      for (const [w, h] of [[64, 64], [300, 40], [512, 512]]) {
        const junk = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, junk);
        const r = new Uint8Array(w * h * 4); for (let i = 0; i < r.length; i++) r[i] = (i * 2654435761) >>> 24;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, r); gl.deleteTexture(junk);
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        let nz = 0; for (const v of px) if (v) nz++;
        if (nz) bad.push(`${w}x${h}:${nz}`);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteTexture(t);
      }
      gl.deleteFramebuffer(fb);
      return bad.length ? "nonzero " + bad.join(",") : true;
    })],
    ["check.fbo", () => H5B.check("framebuffer_complete", () => { ctx(); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 128, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; gl.bindFramebuffer(gl.FRAMEBUFFER, null); return ok; })],
    ["check.errors", () => H5B.check("no_gl_errors_so_far", () => { const e = ctx().getError(); return e === 0 || "error 0x" + e.toString(16); })],

    ["clear", () => H5B.frames("frame.clear_only", { sync, setup: ctx, frame: () => clear(), seconds: 2 })],
    ["draws", () => { let b; return H5B.ramp("draws.one_quad_each", { sync, setup: () => { ctx(); b = batcher(1); b.use(); }, frame: (_, n) => { clear(); const loc = gl.getUniformLocation(b.p, "tint"); for (let i = 0; i < n; i++) { gl.uniform4f(loc, (i & 7) / 7, 1, 1, 1); b.draw(1, i * 100); } } }); }],
    ["sprites", () => { let b; return H5B.ramp("sprites.batched_32px", { sync, setup: () => { ctx(); b = batcher(1 << 17); b.use(); }, frame: (_, n) => { clear(); b.draw(n, H5B.now()); } }); }],
    ["sprites.fixed", () => { let b; return H5B.frames("sprites.batched_2000_32px", { sync, setup: () => { ctx(); b = batcher(2000); b.use(); }, frame: (_, i, t) => { clear(); b.draw(2000, t); }, seconds: 3 }); }],
    ["fill", () => { let b; const full = new Float32Array([0, 0, 0, 0, 640, 0, 1, 0, 0, 480, 0, 1, 640, 480, 1, 1]); return H5B.ramp("fill.fullscreen_blended_quads", { sync, start: 1, limit: 1024, setup: () => { ctx(); b = batcher(1); b.use(); gl.uniform4f(gl.getUniformLocation(b.p, "tint"), 1, 1, 1, 0.1); }, frame: (_, n) => { clear(); gl.bufferSubData(gl.ARRAY_BUFFER, 0, full); for (let i = 0; i < n; i++) gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0); } }); }],
    ["upload.array", () => { let t, px; return H5B.frames("upload.texsubimage_512_rgba", { sync, setup: () => { ctx(); t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); px = new Uint8Array(512 * 512 * 4); }, frame: (_, i) => { px[i & 0xffff] = i; gl.bindTexture(gl.TEXTURE_2D, t); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 512, 512, gl.RGBA, gl.UNSIGNED_BYTE, px); clear(); }, seconds: 3 }); }],
    ["upload.canvas", () => { let t, c2, x2; return H5B.frames("upload.teximage_from_2d_canvas_640x480", { sync, setup: () => { ctx(); c2 = document.createElement("canvas"); c2.width = 640; c2.height = 480; x2 = c2.getContext("2d"); t = gl.createTexture(); }, frame: (_, i) => { x2.fillStyle = i & 1 ? "#468" : "#864"; x2.fillRect(i % 600, 10, 40, 40); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c2); clear(); }, seconds: 3 }); }],
    ["upload.big", () => { let px; return H5B.once("upload.teximage_2048_rgba", () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2048, 2048, 0, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); gl.deleteTexture(t); }, { setup: () => { ctx(); px = new Uint8Array(2048 * 2048 * 4); } }); }],
    ["programs", () => { let a, b; return H5B.ramp("state.program_switches", { sync, setup: () => { ctx(); a = batcher(1); b = batcher(1); }, frame: (_, n) => { clear(); for (let i = 0; i < n; i++) { (i & 1 ? b : a).use(); (i & 1 ? b : a).draw(1, i); } } }); }],
    ["fbos", () => { let b, f, t; return H5B.ramp("state.render_target_switches", { sync, start: 4, setup: () => { ctx(); b = batcher(4); b.use(); t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }, frame: (_, n) => { for (let i = 0; i < n; i++) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.viewport(0, 0, 256, 256); gl.bindTexture(gl.TEXTURE_2D, b.tex); b.draw(4, i); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, 640, 480); gl.bindTexture(gl.TEXTURE_2D, t); b.draw(1, i); } }, teardown: () => { gl.bindTexture(gl.TEXTURE_2D, b.tex); } }); }],
    ["readpixels.small", () => H5B.once("readpixels.1x1_sync", () => { clear(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); }, { runs: 21, setup: ctx })],
    ["readpixels.full", () => H5B.once("readpixels.640x480", () => { clear(); gl.readPixels(0, 0, 640, 480, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(640 * 480 * 4)); }, { runs: 9, setup: ctx })],
    ["shader.compile", () => H5B.once("shader.compile_link_sprite", (_, i) => { const p = prog(SPRITE_VS + "\n// " + i + Math.random(), SPRITE_FS + "\n// " + i + Math.random()); gl.deleteProgram(p); }, { runs: 9, setup: ctx })],
  ]);
})();
