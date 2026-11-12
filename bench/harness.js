// h5bench harness: checks (pass / fail / missing) and timings for HTML5 game engines and browsers.
// Every result is one console.log line, so any engine with a console works:
//   H5B-INFO  <page> <key>=<value>                       environment (user agent, GL renderer, screen)
//   H5B-CHECK <page> <name> pass|fail|missing [detail]    a feature: missing = the API is not there
//   H5B <page> <name> <metric>=<value> ...                 a timing (higher or lower is better: see metric)
//   H5B-ERROR <page> <name> <message>                      a test threw: counts as a gap
//   H5B-SKIP  <page> <name> <why>                          not run: its API is missing (see the check)
//   H5B-DONE  <page> <seconds>
// Metrics: ops_s (higher better), ms / frame_ms / p95_ms / cpu_ms (lower better), fps, max60 (higher better).
// Pages pick their tests with H5B.page(name, [tests]); run.html?only=a,b runs a subset in browsers.
"use strict";
(function () {
  const g = typeof globalThis !== "undefined" ? globalThis : window;
  const now = () => (g.performance && performance.now ? performance.now() : Date.now());
  const raf = (f) => (g.requestAnimationFrame ? requestAnimationFrame(f) : setTimeout(() => f(now()), 16));
  const query = (() => {
    const q = {};
    try { for (const kv of String(g.location && g.location.search || "").replace(/^\?/, "").split("&")) { if (!kv) continue; const [k, v = "1"] = kv.split("="); q[decodeURIComponent(k)] = decodeURIComponent(v); } } catch (_) {}
    return q;
  })();
  const fmt = (v) => (typeof v === "number" ? (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(3)) : String(v).replace(/\s+/g, "_"));
  const lines = [];
  const out = (s) => { lines.push(s); try { console.log(s); } catch (_) {} if (H5B.onLine) H5B.onLine(s); };

  // Deterministic numbers (mulberry32), so every engine does the same work.
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  // One on-screen canvas per kind ("webgl", "2d"), at a fixed size (the window scales it, as games do). The 2D
  // one is called GameCanvas, the id MV games give theirs: some engines only show a 2D canvas by that name.
  const canvases = {};
  const getCanvas = (w = 640, h = 480, kind = "webgl") => {
    let c = canvases[kind];
    if (!c) {
      c = canvases[kind] = document.createElement("canvas");
      c.id = kind === "2d" ? "GameCanvas" : "h5b-" + kind;
      document.body.appendChild(c);
    }
    c.width = w; c.height = h;
    return c;
  };

  const H5B = {
    query, now, rng, out, lines, getCanvas,
    pageName: "bench",
    results: [],
    sink: null, // anything taking the raw lines (a browser table, a POST)
    info(k, v) { out(`H5B-INFO ${H5B.pageName} ${k}=${fmt(v)}`); },
    // A check: fn returns true / false / a string (fail detail), or throws. Missing APIs: return H5B.MISSING.
    MISSING: { missing: true },
    async check(name, fn) {
      let r;
      try { r = await fn(); } catch (e) { r = "threw " + (e && e.message || e); }
      const status = r === H5B.MISSING ? "missing" : r === true ? "pass" : "fail";
      const detail = typeof r === "string" ? " " + r.replace(/\s+/g, "_").slice(0, 120) : "";
      H5B.results.push({ kind: "check", name, status });
      out(`H5B-CHECK ${H5B.pageName} ${name} ${status}${detail}`);
    },
    // Throughput: fn(n) does n units of work; it runs for `ms` after a warm-up, the result is units per second.
    async measure(name, fn, { ms = 800, warm = 200, unit = "ops_s", setup, teardown } = {}) {
      try {
        const ctx = setup ? await setup() : undefined;
        let n = 1, t0 = now();
        while (now() - t0 < warm) { fn(n, ctx); n = Math.min(n * 2, 1 << 20); }
        // Batch size so one call takes ~5 ms.
        let batch = 1, tb = now();
        for (;;) { fn(batch, ctx); const dt = now() - tb; if (dt > 5 || batch >= 1 << 24) break; batch *= 2; tb = now(); }
        // Five windows, the median reported: one GC pause or a busy CI neighbor moves one window, not the result.
        // spread = (max - min) / median of the windows, in percent: the run's own noise.
        const rates = [];
        for (let w = 0; w < 5; w++) {
          let done = 0; const start = now(); let el = 0;
          while ((el = now() - start) < ms / 5) { fn(batch, ctx); done += batch; }
          rates.push(done / ((now() - start) / 1000));
        }
        if (teardown) await teardown(ctx);
        rates.sort((a, b) => a - b);
        const ops = rates[2], spread = (rates[4] - rates[0]) / ops * 100;
        H5B.results.push({ kind: "time", name, ops_s: ops, ms_op: 1000 / ops, spread });
        out(`H5B ${H5B.pageName} ${name} ${unit}=${fmt(ops)} ms_op=${fmt(1000 / ops)} spread=${fmt(spread)}`);
      } catch (e) { H5B.error(name, e); }
    },
    // One-shot timing (decode a file, parse a big JSON): the median of `runs`.
    async once(name, fn, { runs = 5, setup } = {}) {
      try {
        const ctx = setup ? await setup() : undefined;
        const ts = [];
        for (let i = 0; i < runs; i++) { const t0 = now(); await fn(ctx, i); ts.push(now() - t0); }
        ts.sort((a, b) => a - b);
        const med = ts[ts.length >> 1];
        H5B.results.push({ kind: "time", name, ms: med });
        out(`H5B ${H5B.pageName} ${name} ms=${fmt(med)} min_ms=${fmt(ts[0])} max_ms=${fmt(ts[ts.length - 1])}`);
      } catch (e) { H5B.error(name, e); }
    },
    // Frames: frame(t, i) runs in requestAnimationFrame for `seconds`; reports fps, frame times and the time
    // spent inside the callback (cpu_ms). GPU work shows in fps and frame_ms, not in cpu_ms.
    frames(name, { setup, frame, teardown, seconds = 3 } = {}) {
      return new Promise((resolve) => {
        let ctx;
        Promise.resolve(setup ? setup() : undefined).then((c) => {
          ctx = c;
          const dts = [], cpus = [];
          let last = 0, i = 0; const t0 = now();
          const step = () => {
            const t = now();
            if (last) dts.push(t - last);
            last = t;
            try { frame(ctx, i++, t); } catch (e) { H5B.error(name, e); finish(true); return; }
            cpus.push(now() - t);
            if (t - t0 < seconds * 1000) raf(step); else finish(false);
          };
          const finish = (failed) => {
            Promise.resolve(teardown ? teardown(ctx) : undefined).then(() => {
              if (!failed && dts.length > 2) {
                const s = dts.slice(2).sort((a, b) => a - b);
                const avg = s.reduce((a, b) => a + b, 0) / s.length;
                const cpu = cpus.slice(2).reduce((a, b) => a + b, 0) / Math.max(1, cpus.length - 2);
                H5B.results.push({ kind: "time", name, fps: 1000 / avg, frame_ms: avg, p95_ms: s[Math.floor(s.length * 0.95)], cpu_ms: cpu });
                out(`H5B ${H5B.pageName} ${name} fps=${fmt(1000 / avg)} frame_ms=${fmt(avg)} p95_ms=${fmt(s[Math.floor(s.length * 0.95)])} cpu_ms=${fmt(cpu)}`);
              }
              resolve();
            });
          };
          raf(step);
        }).catch((e) => { H5B.error(name, e); resolve(); });
      });
    },
    // Capacity: frame(ctx, n) draws n items; n is raised and lowered in 0.6 s windows until the largest n that
    // still averages under 1000/55 ms a frame. max60 is engine-independent of the display's vsync cap.
    ramp(name, { setup, frame, teardown, start = 64, limit = 1 << 17, windowMs = 600 } = {}) {
      return new Promise((resolve) => {
        Promise.resolve(setup ? setup() : undefined).then((ctx) => {
          let n = start, lo = 0, hi = 0, last = 0, wstart = 0, count = 0, sum = 0, phase = "up", steps = 0;
          const budget = 1000 / 55;
          const step = () => {
            const t = now();
            if (last) { sum += t - last; count++; }
            last = t;
            try { frame(ctx, n); } catch (e) { H5B.error(name, e); done(); return; }
            if (!wstart) wstart = t;
            if (t - wstart >= windowMs && count > 3) {
              const avg = sum / count; const ok = avg <= budget;
              steps++;
              if (phase === "up") { if (ok && n < limit) { lo = n; n *= 2; } else { hi = n; phase = "search"; n = Math.max(1, Math.round((lo + hi) / 2)); } }
              else { if (ok) lo = n; else hi = n; n = Math.max(1, Math.round((lo + hi) / 2)); }
              wstart = 0; count = 0; sum = 0; last = 0;
              if ((phase === "search" && (hi - lo <= Math.max(1, lo * 0.06))) || steps > 24 || (phase === "up" && lo >= limit)) { done(); return; }
            }
            raf(step);
          };
          const done = () => {
            Promise.resolve(teardown ? teardown(ctx) : undefined).then(() => {
              H5B.results.push({ kind: "time", name, max60: lo });
              out(`H5B ${H5B.pageName} ${name} max60=${lo}`);
              resolve();
            });
          };
          raf(step);
        }).catch((e) => { H5B.error(name, e); resolve(); });
      });
    },
    // A timing whose API is missing (its check already says so): not run, not a second gap.
    skip(name, why) { H5B.results.push({ kind: "skip", name }); out(`H5B-SKIP ${H5B.pageName} ${name} ${String(why).replace(/\s+/g, "_")}`); },
    error(name, e) {
      H5B.results.push({ kind: "error", name });
      out(`H5B-ERROR ${H5B.pageName} ${name} ${String(e && e.message || e).replace(/\s+/g, "_").slice(0, 160)}`);
    },
    tests: {},
    // A page: its tests are registered by the suite files (H5B.suite) and run in order; ?only=a,b picks some.
    suite(page, list) { H5B.tests[page] = list; },
    async run(pages) {
      const t0 = now();
      for (const page of pages) {
        H5B.pageName = page;
        const list = H5B.tests[page] || [];
        const only = query.only ? query.only.split(",") : null;
        if (page === pages[0]) env();
        for (const [name, fn] of list) {
          if (only && !only.some((o) => name.startsWith(o))) continue;
          try { await fn(); } catch (e) { H5B.error(name, e); }
          await new Promise((r) => setTimeout(r, 30)); // let the engine settle between tests
        }
        out(`H5B-DONE ${page} ${fmt((now() - t0) / 1000)}`);
      }
      out("H5B-ALLDONE");
      if (H5B.sink) H5B.sink(lines);
      await save(pages);
      // Engines without a browser chrome close here; browsers ignore it (pages they did not open).
      const nodeLike = typeof process === "object" && process && process.versions;
      if (query.close === "1" || (nodeLike && query.close !== "0")) setTimeout(() => { try { g.close(); } catch (_) {} }, 300);
    },
  };

  // The run as JSON, in tools/h5bench.py's format (parse), so compare and table read it directly.
  function toJson(label) {
    const run = { label, info: {}, checks: {}, times: {}, errors: {}, skipped: {}, pages_done: [] };
    for (const l of lines) {
      const p = l.split(" "), tag = p[0], key = p[1] + "/" + p[2];
      if (tag === "H5B-INFO" && p[2] && p[2].includes("=")) { const i = p[2].indexOf("="); run.info[p[2].slice(0, i)] = p[2].slice(i + 1); }
      else if (tag === "H5B-CHECK") run.checks[key] = { status: p[3], detail: p.slice(4).join(" ").replace(/_/g, " ") };
      else if (tag === "H5B-ERROR") run.errors[key] = p.slice(3).join(" ").replace(/_/g, " ");
      else if (tag === "H5B-SKIP") run.skipped[key] = p.slice(3).join(" ").replace(/_/g, " ");
      else if (tag === "H5B-DONE") run.pages_done.push(p[1]);
      else if (tag === "H5B") { const m = {}; for (const kv of p.slice(3)) { const i = kv.indexOf("="); if (i > 0) m[kv.slice(0, i)] = Number(kv.slice(i + 1)); } run.times[key] = m; }
    }
    return run;
  }
  // Results to disk: Node fs (NW.js, browser-free runtimes) into results/ next to the pages; ?post=<url> sends them
  // (tools/h5bench.py serve saves them on the PC); browsers get a download link (?download=1 clicks it).
  async function save(pages) {
    const d = new Date(), pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const label = (query.label || "run").replace(/[^\w.-]/g, "_");
    const name = `${label}-${pages.length > 1 ? "all" : pages[0]}-${stamp}`;
    const json = JSON.stringify(toJson(label), null, 1), log = lines.join("\n") + "\n";
    let saved = false;
    try {
      if (typeof require === "function" && query.file !== "0") {
        const fs = require("fs"), path = require("path");
        const base = typeof __dirname === "string" && __dirname ? __dirname : typeof process === "object" && process.mainModule ? path.dirname(process.mainModule.filename) : process.cwd();
        const dir = path.join(base, "results");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, name + ".json"), json);
        fs.writeFileSync(path.join(dir, name + ".log"), log);
        out(`H5B-FILE ${path.join(dir, name + ".json")}`);
        saved = true;
      }
    } catch (e) { out("H5B-FILE-ERROR " + String(e && e.message || e).replace(/\s+/g, "_")); }
    if (query.post) {
      try {
        await new Promise((res) => { const x = new XMLHttpRequest(); x.open("POST", query.post); x.setRequestHeader("Content-Type", "application/json"); x.onload = x.onerror = () => res(); x.send(JSON.stringify({ name, json: JSON.parse(json), log })); });
        out(`H5B-POSTED ${query.post}`);
        saved = true;
      } catch (_) {}
    }
    if (!saved && typeof Blob === "function" && (typeof URL === "object" || typeof URL === "function")) {
      try {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        a.download = name + ".json";
        a.textContent = "Download results (" + name + ".json)";
        a.setAttribute("style", "display:block;margin:8px;color:#8cf;font:14px sans-serif;");
        document.body.insertBefore ? document.body.insertBefore(a, document.body.firstChild) : document.body.appendChild(a);
        if (query.download === "1" && a.click) a.click();
      } catch (_) {}
    }
  }

  function env() {
    const nav = g.navigator || {};
    H5B.info("user_agent", nav.userAgent || "none");
    H5B.info("platform", nav.platform || "none");
    try { if (typeof process === "object" && process.versions) H5B.info("versions", Object.entries(process.versions).filter(([k]) => /^(node|nw|v8|chrome|electron)$/.test(k)).map(([k, v]) => k + ":" + v).join(",") || "none"); } catch (_) {}
    H5B.info("window", `${g.innerWidth}x${g.innerHeight}`);
    H5B.info("device_pixel_ratio", g.devicePixelRatio || 1);
    H5B.info("cores", nav.hardwareConcurrency || 0);
    try {
      const c = document.createElement("canvas"); const gl = c.getContext("webgl");
      if (gl) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        H5B.info("gl_renderer", dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        H5B.info("gl_version", gl.getParameter(gl.VERSION));
      } else H5B.info("gl_renderer", "none");
    } catch (_) { H5B.info("gl_renderer", "error"); }
  }

  g.H5B = H5B;
})();
