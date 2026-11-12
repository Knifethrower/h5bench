// h5bench page "canvas2d": Canvas 2D features and the drawing games do with it (MV windows and text, ImpactJS,
// Phaser's canvas renderer, Construct's text objects).
"use strict";
(function () {
  let x = null;
  const ctx = () => { if (!x) x = H5B.getCanvas(640, 480, "2d").getContext("2d"); return x; };
  // A 256x256 sprite atlas drawn with Canvas 2D itself.
  const atlas = () => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256; const a = c.getContext("2d");
    for (let i = 0; i < 64; i++) { a.fillStyle = `hsl(${i * 37 % 360},70%,55%)`; a.fillRect((i & 7) * 32 + 2, (i >> 3) * 32 + 2, 28, 28); a.fillStyle = "#fff"; a.fillRect((i & 7) * 32 + 10, (i >> 3) * 32 + 10, 6, 6); }
    return c;
  };
  const clear = () => { x.fillStyle = "#223"; x.fillRect(0, 0, 640, 480); };
  const words = "The quick brown fox jumps over the lazy dog while the party walks to town".split(" ");
  const painted = (fn) => { ctx(); x.clearRect(0, 0, 64, 64); fn(); const d = x.getImageData(0, 0, 64, 64).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; };

  H5B.suite("canvas2d", [
    ["check.context", () => H5B.check("context_2d", () => (ctx() ? true : H5B.MISSING))],
    ["check.measure", () => H5B.check("measuretext_scales", () => { ctx(); x.font = "10px sans-serif"; const a = x.measureText("Hello world").width; x.font = "20px sans-serif"; const b = x.measureText("Hello world").width; return (a > 20 && Math.abs(b / a - 2) < 0.15) || `10px=${a} 20px=${b}`; })],
    ["check.metrics", () => H5B.check("measuretext_bounding_box", () => { ctx(); x.font = "20px sans-serif"; const m = x.measureText("Hg"); return m.actualBoundingBoxAscent > 5 && m.actualBoundingBoxDescent > 0 ? true : typeof m.actualBoundingBoxAscent !== "number" ? H5B.MISSING : `ascent=${m.actualBoundingBoxAscent} descent=${m.actualBoundingBoxDescent}`; })],
    ["check.filltext", () => H5B.check("filltext_paints", () => { const n = painted(() => { x.font = "24px sans-serif"; x.fillStyle = "#fff"; x.textBaseline = "top"; x.fillText("Ag", 4, 4); }); return n > 40 || "painted " + n + " px"; })],
    ["check.roundtrip", () => H5B.check("put_get_imagedata_exact", () => { ctx(); const im = x.createImageData(8, 8); for (let i = 0; i < im.data.length; i++) im.data[i] = i % 4 === 3 ? 255 : (i * 29) & 255; x.putImageData(im, 0, 0); const d = x.getImageData(0, 0, 8, 8).data; for (let i = 0; i < d.length; i++) if (d[i] !== im.data[i]) return "differs at " + i; return true; })],
    ["check.composite", () => H5B.check("composite_modes", () => { ctx(); const bad = []; for (const m of ["lighter", "multiply", "screen", "destination-out", "source-atop", "difference"]) { x.globalCompositeOperation = m; if (x.globalCompositeOperation !== m) bad.push(m); } x.globalCompositeOperation = "source-over"; return bad.length ? "unsupported " + bad.join(",") : true; })],
    ["check.composite_lighter", () => H5B.check("composite_lighter_adds", () => { ctx(); x.clearRect(0, 0, 4, 4); x.fillStyle = "rgb(100,0,0)"; x.fillRect(0, 0, 4, 4); x.globalCompositeOperation = "lighter"; x.fillRect(0, 0, 4, 4); x.globalCompositeOperation = "source-over"; const r = x.getImageData(1, 1, 1, 1).data[0]; return Math.abs(r - 200) <= 2 || "red " + r; })],
    ["check.filter", () => H5B.check("filter_property", () => { ctx(); if (!("filter" in x)) return H5B.MISSING; x.filter = "blur(2px)"; const ok = x.filter === "blur(2px)"; x.filter = "none"; return ok || "value not kept"; })],
    ["check.gradient", () => H5B.check("gradients_patterns", () => { ctx(); const g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, "#000"); g.addColorStop(1, "#fff"); x.fillStyle = g; x.fillRect(0, 0, 64, 8); const l = x.getImageData(2, 2, 1, 1).data[0], r = x.getImageData(61, 2, 1, 1).data[0]; const p = x.createPattern(atlas(), "repeat"); return (r - l > 150 && !!p) || `gradient ${l}->${r} pattern ${!!p}`; })],
    ["check.dash", () => H5B.check("line_dash_ellipse", () => { ctx(); if (typeof x.setLineDash !== "function" || typeof x.ellipse !== "function") return H5B.MISSING; x.setLineDash([4, 2]); const ok = x.getLineDash().length === 2; x.setLineDash([]); return ok; })],
    ["check.smoothing", () => H5B.check("image_smoothing_off", () => { ctx(); x.imageSmoothingEnabled = false; const s = document.createElement("canvas"); s.width = 2; s.height = 1; const sx = s.getContext("2d"); sx.fillStyle = "#000"; sx.fillRect(0, 0, 1, 1); sx.fillStyle = "#fff"; sx.fillRect(1, 0, 1, 1); x.drawImage(s, 0, 0, 2, 1, 0, 0, 20, 10); const v = x.getImageData(9, 5, 1, 1).data[0]; x.imageSmoothingEnabled = true; return v === 0 || "edge value " + v; })],
    ["check.dataurl", () => H5B.check("todataurl_png", () => { const c = document.createElement("canvas"); c.width = 4; c.height = 4; c.getContext("2d").fillRect(0, 0, 2, 2); const u = c.toDataURL("image/png"); return /^data:image\/png;base64,iVBOR/.test(u) || "got " + String(u).slice(0, 30); })],

    ["sprites", () => { let a; return H5B.ramp("drawimage.sprites_32px", { setup: () => { ctx(); a = atlas(); }, frame: (_, n) => { clear(); const t = H5B.now() * 0.05; for (let i = 0; i < n; i++) x.drawImage(a, (i & 7) * 32, ((i >> 3) & 7) * 32, 32, 32, (i * 37 + t * ((i & 7) + 1)) % 640, (i * 53) % 480, 32, 32); } }); }],
    ["sprites.scaled", () => { let a; return H5B.ramp("drawimage.scaled_rotated_32px", { setup: () => { ctx(); a = atlas(); }, frame: (_, n) => { clear(); const t = H5B.now() * 0.001; for (let i = 0; i < n; i++) { x.setTransform(1.5, 0, 0, 1.5, (i * 37) % 640, (i * 53) % 480); x.rotate(t + i); x.drawImage(a, (i & 7) * 32, ((i >> 3) & 7) * 32, 32, 32, -16, -16, 32, 32); } x.setTransform(1, 0, 0, 1, 0, 0); } }); }],
    ["fillrect", () => H5B.ramp("fillrect.colored_16px", { setup: ctx, frame: (_, n) => { clear(); for (let i = 0; i < n; i++) { x.fillStyle = i & 1 ? "#c84" : "#48c"; x.fillRect((i * 29) % 624, (i * 17) % 464, 16, 16); } } })],
    ["paths", () => H5B.ramp("path.arcs_filled", { setup: ctx, frame: (_, n) => { clear(); x.fillStyle = "#7c5"; for (let i = 0; i < n; i++) { x.beginPath(); x.arc((i * 29) % 640, (i * 17) % 480, 10, 0, Math.PI * 2); x.fill(); } } })],
    ["text", () => H5B.frames("text.filltext_100_lines", { setup: ctx, frame: (_, i) => { clear(); x.fillStyle = "#fff"; x.font = "18px sans-serif"; for (let k = 0; k < 100; k++) x.fillText(words[(k + i) % words.length] + " " + k + " HP 120/120", (k % 4) * 160, 10 + (k >> 2) * 18); }, seconds: 3 })],
    ["text.outlined", () => H5B.frames("text.stroked_outlined_40_lines", { setup: ctx, frame: (_, i) => { clear(); x.font = "22px sans-serif"; x.lineWidth = 4; x.strokeStyle = "#000"; x.fillStyle = "#fff"; for (let k = 0; k < 40; k++) { const s = words[(k + i) % words.length] + " " + k; x.strokeText(s, (k % 2) * 320, 20 + (k >> 1) * 23); x.fillText(s, (k % 2) * 320, 20 + (k >> 1) * 23); } }, seconds: 3 })],
    ["measure", () => H5B.measure("text.measuretext_100", (n) => { for (let j = 0; j < n; j++) for (let k = 0; k < 100; k++) x.measureText(words[k % words.length] + k); }, { setup: () => { ctx(); x.font = "18px sans-serif"; } })],
    ["blit.full", () => { let src; return H5B.frames("drawimage.full_640x480_canvas", { setup: () => { ctx(); src = document.createElement("canvas"); src.width = 640; src.height = 480; const s = src.getContext("2d"); s.fillStyle = "#335"; s.fillRect(0, 0, 640, 480); s.drawImage(atlas(), 100, 100); }, frame: () => { x.drawImage(src, 0, 0); }, seconds: 3 }); }],
    ["getimagedata", () => H5B.once("imagedata.get_640x480", () => { x.getImageData(0, 0, 640, 480); }, { runs: 9, setup: ctx })],
    ["putimagedata", () => { let im; return H5B.once("imagedata.put_640x480", () => { x.putImageData(im, 0, 0); x.getImageData(0, 0, 1, 1); }, { runs: 9, setup: () => { ctx(); im = x.createImageData(640, 480); } }); }],
  ]);
})();
