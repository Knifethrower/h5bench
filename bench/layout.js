// h5bench page "layout": CSS box layout as a browser does it, and the text layout engines do with measureText
// (MV/MZ message windows, word wrap). Engines without a layout engine show the box checks as gaps.
"use strict";
(function () {
  const box = (css, parent = document.body, text) => { const d = document.createElement("div"); d.setAttribute("style", css); if (text) d.textContent = text; parent.appendChild(d); return d; };
  const wrapIn = (fn) => { const host = box("position:absolute;left:0;top:0;width:400px;"); try { return fn(host); } finally { host.remove ? host.remove() : document.body.removeChild(host); } };
  const r = (el) => el.getBoundingClientRect();
  const near = (a, b) => Math.abs(a - b) <= 1;
  let x = null;
  const ctx2d = () => { if (!x) { const c = document.createElement("canvas"); c.width = 16; c.height = 16; x = c.getContext("2d"); } return x; };
  const para = Array.from({ length: 2000 }, (_, i) => ["the", "party", "walks", "into", "town", "and", "meets", "an", "old", "friend", "who", "remembers", "everything"][i % 13]).join(" ");
  // Word wrap with measureText, as RPG Maker's message windows and many engines do.
  const wrap = (text, width) => { const out = []; let line = ""; for (const w of text.split(" ")) { const t = line ? line + " " + w : w; if (x.measureText(t).width > width && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; };

  H5B.suite("layout", [
    ["check.box", () => H5B.check("styled_box_size", () => wrapIn((h) => { const d = box("width:100px;height:50px;", h); const b = r(d); return (near(b.width, 100) && near(b.height, 50)) || `got ${b.width}x${b.height}`; }))],
    ["check.offset", () => H5B.check("offset_width_height", () => wrapIn((h) => { const d = box("width:120px;height:30px;padding:5px;", h); return (near(d.offsetWidth, 130) && near(d.offsetHeight, 40)) || `got ${d.offsetWidth}x${d.offsetHeight}`; }))],
    ["check.flow", () => H5B.check("block_flow", () => wrapIn((h) => { const a = box("height:20px;", h), b = box("height:20px;", h); return near(r(b).top - r(a).top, 20) || `gap ${r(b).top - r(a).top}`; }))],
    ["check.percent", () => H5B.check("percent_width", () => wrapIn((h) => { const p = box("width:200px;", h), c = box("width:50%;height:10px;", p); return near(r(c).width, 100) || `got ${r(c).width}`; }))],
    ["check.flex", () => H5B.check("flexbox", () => wrapIn((h) => { const p = box("display:flex;width:300px;", h); const k = [0, 1, 2].map(() => box("flex:1;height:10px;", p)); const w = k.map((e) => Math.round(r(e).width)); return w.every((v) => near(v, 100)) || "widths " + w.join(","); }))],
    ["check.absolute", () => H5B.check("absolute_position", () => wrapIn((h) => { const d = box("position:absolute;left:30px;top:40px;width:10px;height:10px;", h); const b = r(d), hb = r(h); return (near(b.left - hb.left, 30) && near(b.top - hb.top, 40)) || `at ${b.left - hb.left},${b.top - hb.top}`; }))],
    ["check.inline_text", () => H5B.check("inline_text_width", () => wrapIn((h) => { const s = document.createElement("span"); s.setAttribute("style", "font:20px sans-serif;"); s.textContent = "Hello world"; h.appendChild(s); const w = s.offsetWidth || r(s).width; return (w > 60 && w < 200) || "width " + w; }))],
    ["check.computed", () => H5B.check("computed_style", () => wrapIn((h) => { if (typeof getComputedStyle !== "function") return H5B.MISSING; const d = box("width:100px;color:rgb(10, 20, 30);", h); const cs = getComputedStyle(d); return (cs.width === "100px" && cs.color.replace(/\s/g, "") === "rgb(10,20,30)") || `width=${cs.width} color=${cs.color}`; }))],
    ["check.scroll", () => H5B.check("scroll_size", () => wrapIn((h) => { const p = box("width:100px;height:50px;overflow:hidden;", h); box("height:200px;", p); return near(p.scrollHeight, 200) || "scrollHeight " + p.scrollHeight; }))],
    ["check.fonts", () => H5B.check("css_font_loading", () => (document.fonts && document.fonts.ready && typeof FontFace === "function" ? true : H5B.MISSING))],
    ["check.text_cjk", () => H5B.check("measuretext_cjk_fallback", () => { ctx2d(); x.font = "20px sans-serif"; const w = x.measureText("日本語のテキスト").width; return (w > 100 && w < 220) || "width " + w; })],

    ["wrap", () => H5B.once("text.wrap_2000_words_measuretext", () => { wrap(para, 400); }, { runs: 7, setup: () => { ctx2d(); x.font = "22px sans-serif"; } })],
    // Each write-then-read forces a layout in a browser (1000 here: ~1 s in Chromium on a desktop).
    ["thrash", () => H5B.once("layout.style_write_read_100x10", () => wrapIn((h) => { const els = Array.from({ length: 100 }, (_, i) => box(`width:${50 + i % 50}px;height:10px;`, h)); let s = 0; for (let k = 0; k < 10; k++) for (const e of els) { e.style.width = (50 + (k * 7) % 50) + "px"; s += e.offsetWidth; } return s; }), { runs: 3 })],
    ["build", () => H5B.once("layout.build_1000_styled_read_positions", () => wrapIn((h) => { const els = []; for (let i = 0; i < 1000; i++) els.push(box("display:inline-block;width:30px;height:12px;margin:1px;", h)); let s = 0; for (const e of els) s += r(e).top; return s; }), { runs: 5 })],
  ]);
})();
