// h5bench page "timing": frame pacing and timers, which decide how smooth a game feels at a given fps.
"use strict";
(function () {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  H5B.suite("timing", [
    ["check.raf", () => H5B.check("raf_timestamp", () => new Promise((res) => { if (typeof requestAnimationFrame !== "function") return res(H5B.MISSING); requestAnimationFrame((t) => res(typeof t === "number" && t > 0 || "argument " + t)); }))],
    ["check.now_resolution", () => H5B.check("performance_now_resolution", () => { let min = Infinity, a = performance.now(); for (let i = 0; i < 200000 && min > 0.001; i++) { const b = performance.now(); if (b > a) { min = Math.min(min, b - a); a = b; } } H5B.info("now_resolution_ms", min); return min <= 0.1 || "resolution " + min + " ms"; })],
    ["check.visibility", () => H5B.check("page_visibility", () => (typeof document.hidden === "boolean" && document.visibilityState ? true : H5B.MISSING))],
    ["check.messagechannel", () => H5B.check("message_channel", () => (typeof MessageChannel === "function" ? new Promise((res) => { const c = new MessageChannel(); c.port1.onmessage = (e) => res(e.data === 7 || "data " + e.data); c.port2.postMessage(7); setTimeout(() => res("no message"), 500); }) : H5B.MISSING))],
    ["check.queue_microtask", () => H5B.check("queue_microtask", () => (typeof queueMicrotask === "function" ? true : H5B.MISSING))],

    ["raf.idle", () => H5B.frames("raf.idle_cadence", { frame: () => {}, seconds: 4 })],
    ["raf.busy", () => H5B.frames("raf.8ms_js_each_frame", { frame: () => { const e = performance.now() + 8; while (performance.now() < e); }, seconds: 3 })],
    ["timeout.zero", () => H5B.once("timer.settimeout_0_latency", async () => { for (let i = 0; i < 20; i++) await wait(0); }, { runs: 5 })],
    ["timeout.16", () => H5B.once("timer.settimeout_16_x10", async () => { for (let i = 0; i < 10; i++) await wait(16); }, { runs: 3 })],
    ["interval", () => H5B.once("timer.setinterval_10ms_x20", () => new Promise((res) => { let n = 0; const id = setInterval(() => { if (++n === 20) { clearInterval(id); res(); } }, 10); }), { runs: 3 })],
  ]);
})();
