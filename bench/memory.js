// h5bench page "memory": the JS heap and the process's memory (RSS), what common objects cost, how long the garbage
// collector stops the game (in a tight loop and in frames, next to the worst frame time), and whether engine objects
// (textures, buffers, canvases, images, decoded sounds) give their memory back.
// Readings come from H5B.memory(): process.memoryUsage() (Node, NW.js, Electron), performance.memory (Chrome, with
// --enable-precise-memory-info) and /proc/self/status (Linux engines with Node fs). gc(), where the engine has a real
// one (V8's --expose-gc), runs before every reading; without it readings include garbage not yet collected.
"use strict";
(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const MB = 1048576;
  let heapOk = false, gcState = "none";
  // Collect if possible, then wait out performance.memory's cache (Chrome refreshes it every 50 ms at most).
  const settle = async () => { if (typeof gc === "function") { try { gc(); gc(); } catch (_) {} } await sleep(70); };
  const bytes = (url) => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open("GET", url); x.responseType = "arraybuffer"; x.onload = () => (x.status < 400 && x.response ? res(x.response) : rej(new Error("status " + x.status))); x.onerror = () => rej(new Error("cannot read " + url)); x.send(); });
  const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("cannot load " + src)); im.src = src; });
  let sink = null; // results stored here stay reachable, so no engine can optimize the allocations away

  // ---- What one object costs: heap growth over n of them, held in an array made beforehand (its slot counts) ----
  const cost = (name, { prep, fill, n = 100000 }) => async () => {
    if (!heapOk) return H5B.skip("bytes." + name, "no precise JS heap reading");
    try {
      const per = [];
      for (let r = 0; r < 3; r++) {
        const box = prep(n);
        await settle(); const a = H5B.memory().heap;
        const kept = fill(box, n);
        await settle(); const b = H5B.memory().heap;
        per.push((b - a) * MB / n);
        sink = kept;
      }
      sink = null;
      per.sort((x, y) => x - y);
      H5B.report("bytes." + name, { bytes: per[1] });
    } catch (e) { H5B.error("bytes." + name, e); }
  };
  const each = (make) => ({ prep: (n) => new Array(n).fill(0), fill: (a, n) => { for (let i = 0; i < n; i++) a[i] = make(i); return a; } });

  // ---- GC pauses in a tight loop: batches of allocation (~0.5 ms each) timed back to back. A batch that takes longer
  // than the median batch was held up by a collection: pause_ms = the longest hold-up, pauses = hold-ups over 1 ms,
  // gc_pct = their share of the run, ops_s = objects made per second.
  const pauses = (name, { setup, batch, ms = 2500 }) => async () => {
    try {
      const ctx = setup ? setup() : {};
      const now = () => performance.now();
      let n = 16;
      for (;;) { const t = now(); batch(ctx, n); if (now() - t > 0.5 || n >= 1 << 20) break; n *= 2; }
      for (let i = 0; i < 50; i++) batch(ctx, n); // warm up the optimizing compiler
      const dts = [], t0 = now(); let last = t0;
      while (last - t0 < ms) { batch(ctx, n); const t = now(); dts.push(t - last); last = t; }
      const s = dts.slice().sort((a, b) => a - b), med = s[s.length >> 1];
      let worst = 0, count = 0, total = 0;
      for (const d of dts) { const p = d - med; if (p > 1) { count++; total += p; } if (p > worst) worst = p; }
      sink = ctx;
      H5B.report(name, { pause_ms: worst, pauses: count, gc_pct: total / (last - t0) * 100, ops_s: dts.length * n / ((last - t0) / 1000) });
      sink = null;
    } catch (e) { H5B.error(name, e); }
  };
  // A long-lived set of game-like records (~30-60 MB), replaced a few at a time: promotion and old-space collections.
  const LIVE = 250000;
  const record = (i) => ({ id: i, name: "item" + i, pos: [i * 0.5, i * 0.25, 0], hp: i & 255 });
  const liveSet = () => { const a = new Array(LIVE); for (let i = 0; i < LIVE; i++) a[i] = record(i); return { a, k: 1 }; };
  const replace = (ctx, n) => { const a = ctx.a; for (let i = 0; i < n; i++) { ctx.k = (Math.imul(ctx.k, 1103515245) + 12345) >>> 0; a[ctx.k % LIVE] = record(i); } };

  // ---- Leaks: one warm-up round of create-use-drop cycles (caches, pools, first allocations), then a measured round.
  // Memory that grows over the measured round was not given back.
  const leak = (name, { setup, cycle, teardown, n }) => async () => {
    const m0 = H5B.memory();
    if (m0.rss === null && !heapOk) return H5B.skip(name, "no RSS or JS heap reading");
    try {
      const ctx = setup ? await setup() : {};
      if (ctx === H5B.MISSING) return H5B.skip(name, "API missing");
      for (let i = 0; i < n; i++) await cycle(ctx, i);
      await settle(); await settle(); const a = H5B.memory();
      for (let i = 0; i < n; i++) await cycle(ctx, i);
      await settle(); await settle(); const b = H5B.memory();
      if (teardown) await teardown(ctx);
      H5B.report(name, { rss_growth_mb: a.rss !== null ? b.rss - a.rss : null, heap_growth_mb: heapOk ? b.heap - a.heap : null, rss_mb: b.rss });
    } catch (e) { H5B.error(name, e); }
  };
  const glCtx = () => { const c = H5B.getCanvas(640, 480, "webgl"); return c.getContext("webgl") || H5B.MISSING; };

  H5B.suite("memory", [
    // A heap reading that follows an allocation, so the numbers below mean something.
    ["check.heap", () => H5B.check("js_heap_readable", async () => {
      const m = H5B.memory();
      if (m.heap === null) return m.stub ? m.stub + " reads zero" : H5B.MISSING;
      H5B.info("js_heap_source", m.heapSrc);
      await settle(); const a = H5B.memory().heap;
      const keep = []; for (let i = 0; i < 200000; i++) keep.push({ i, j: i + 1 });
      await settle(); const b = H5B.memory().heap;
      sink = keep; sink = null;
      if (b - a < 2) return `did not follow an allocation of 200000 objects (${a.toFixed(1)} -> ${b.toFixed(1)} MB)` + (m.heapSrc === "performance.memory" ? ": Chrome needs --enable-precise-memory-info" : "");
      heapOk = true;
      return true;
    })],
    ["check.rss", () => H5B.check("process_rss_readable", () => {
      const m = H5B.memory();
      if (m.rss === null) return m.stub ? m.stub + ".rss reads zero" : H5B.MISSING;
      H5B.info("rss_source", m.rssSrc);
      return true;
    })],
    // Whether gc() collects: info only (it is a V8 flag, not a web API), but it decides how exact the numbers are.
    ["info.gc", async () => {
      if (typeof gc !== "function") gcState = "none";
      else if (!heapOk) gcState = "unverified";
      else {
        let junk = []; for (let i = 0; i < 300000; i++) junk.push({ i, s: "x" + i });
        await sleep(70); const a = H5B.memory().heap;
        junk = null; await settle(); const b = H5B.memory().heap;
        gcState = a - b > 4 ? "works" : "no-op";
      }
      H5B.info("forced_gc", gcState);
    }],

    // The engine's footprint after a collection, as this page starts (alone, that is the engine idling).
    ["footprint", async () => {
      await settle();
      const m = H5B.memory();
      if (m.heap === null && m.rss === null) return H5B.skip("footprint.settled", "no heap or RSS reading");
      H5B.report("footprint.settled", { rss_mb: m.rss, heap_mb: heapOk ? m.heap : null, rss_peak_mb: m.peak });
    }],

    // What objects cost (pointer compression roughly halves most of these).
    ["bytes.object", cost("object_3_ints", each((i) => ({ x: i, y: i + 1, z: i + 2 })))],
    ["bytes.object_doubles", cost("object_3_doubles", each((i) => ({ x: i + 0.5, y: i + 1.5, z: i + 2.5 })))],
    ["bytes.array_doubles", cost("array_8_doubles", each((i) => [i + 0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]))],
    ["bytes.float32array", cost("float32array_16", each(() => new Float32Array(16)))],
    ["bytes.closure", cost("closure", each((i) => () => i))],
    ["bytes.map", cost("map_entry", { prep: () => new Map(), fill: (m, n) => { for (let i = 0; i < n; i++) m.set(i, i); return m; } })],
    // Game data as RPG Maker and most engines load it: JSON records with a short string each.
    ["bytes.json", cost("json_record_4_fields", {
      n: 50000,
      prep: (n) => { const p = []; for (let i = 0; i < n; i++) p.push(`{"id":${i},"name":"Potion ${String(i).padStart(5, "0")}","price":${i % 500},"icon":${i % 64}}`); return "[" + p.join(",") + "]"; },
      fill: (text) => JSON.parse(text),
    })],

    // GC pauses in a tight loop.
    ["gc.young", pauses("gc.short_lived_objects", { setup: () => ({ ring: new Array(1024).fill(null) }), batch: (c, n) => { const r = c.ring; for (let i = 0; i < n; i++) r[i & 1023] = { x: i, y: i * 0.5, vx: 1, vy: -1 }; } })],
    ["gc.old", pauses("gc.long_lived_records_replaced", { setup: liveSet, batch: replace, ms: 3500 })],
    ["gc.typed", pauses("gc.typed_array_16kb_garbage", { setup: () => ({ ring: new Array(64).fill(null) }), batch: (c, n) => { const r = c.ring; for (let i = 0; i < n; i++) r[i & 63] = new Float32Array(4096); } })],
    ["gc.strings", pauses("gc.string_garbage", { setup: () => ({ ring: new Array(1024).fill(null) }), batch: (c, n) => { const r = c.ring; for (let i = 0; i < n; i++) r[i & 1023] = "unit " + i + " hp " + (i & 255) + "/" + (i & 511); } })],

    // The same in frames: max_ms is the worst frame, pause_ms the longest stall inside one.
    ["frames.young", () => H5B.frames("frames.garbage_40k_objects_each", { setup: () => ({ ring: new Array(4096).fill(null) }), frame: (c) => { const r = c.ring; for (let i = 0; i < 40000; i++) r[i & 4095] = { x: i, y: i * 0.5, vx: 1, vy: -1 }; }, gc: true })],
    ["frames.old", () => H5B.frames("frames.records_replaced_2000_each", { setup: liveSet, frame: (c) => replace(c, 2000), seconds: 4, gc: true })],
    ["frames.mat4", () => H5B.frames("frames.mat4_per_sprite_2000", { setup: () => ({ ring: new Array(256).fill(null) }), frame: (c) => { const r = c.ring; for (let i = 0; i < 2000; i++) { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; m[12] = i; r[i & 255] = m; } }, gc: true })],

    // Leaks: create, use and drop engine objects.
    ["leak.texture", leak("leak.webgl_texture_1mb_x100", {
      setup: () => { const gl = glCtx(); return gl === H5B.MISSING ? gl : { gl, data: new Uint8Array(512 * 512 * 4).fill(7), px: new Uint8Array(4) }; },
      cycle: (c, i) => { const gl = c.gl; const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, c.data); gl.bindTexture(gl.TEXTURE_2D, null); gl.deleteTexture(t); if (i % 10 === 9) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, c.px); },
      n: 100,
    })],
    ["leak.buffer", leak("leak.webgl_buffer_1mb_x100", {
      setup: () => { const gl = glCtx(); return gl === H5B.MISSING ? gl : { gl, data: new Float32Array(262144).fill(1), px: new Uint8Array(4) }; },
      cycle: (c, i) => { const gl = c.gl; const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, c.data, gl.STATIC_DRAW); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.deleteBuffer(b); if (i % 10 === 9) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, c.px); },
      n: 100,
    })],
    ["leak.canvas", leak("leak.canvas2d_512px_x100", {
      cycle: () => { const c = document.createElement("canvas"); c.width = c.height = 512; const x = c.getContext("2d"); x.fillStyle = "#4a8"; x.fillRect(0, 0, 512, 512); x.getImageData(0, 0, 1, 1); },
      n: 100,
    })],
    ["leak.image", leak("leak.image_load_upload_1024px_x30", {
      setup: () => { const gl = glCtx(); return gl === H5B.MISSING ? gl : { gl }; },
      cycle: async (c) => { const gl = c.gl; const im = await load("assets/sheet_1024.png"); const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.bindTexture(gl.TEXTURE_2D, null); gl.deleteTexture(t); },
      n: 30,
    })],
    ["leak.audio", leak("leak.audio_decode_ogg_10s_x20", {
      setup: async () => { const A = window.AudioContext || window.webkitAudioContext; if (!A) return H5B.MISSING; return { ac: new A(), ogg: await bytes("assets/tone_10s.ogg") }; },
      cycle: (c) => new Promise((res, rej) => { const p = c.ac.decodeAudioData(c.ogg.slice(0), res, rej); if (p && p.then) p.then(res, rej); }),
      teardown: (c) => { try { c.ac.close(); } catch (_) {} },
      n: 20,
    })],
  ]);
})();
