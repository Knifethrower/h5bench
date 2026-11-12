// h5bench page "js": the JavaScript engine alone, in the kinds of work games do each frame.
"use strict";
(function () {
  const { rng } = H5B;
  let sink = 0; // results go here so the engine cannot drop the work
  const r = rng(1);

  // MV-style database: 2000 records with nested arrays and strings (~1 MB of JSON).
  const bigData = () => {
    const rr = rng(7), a = [];
    for (let i = 0; i < 2000; i++) a.push({ id: i, name: "Item " + i, note: "<tag:" + (i % 13) + ">".repeat(3), params: [i, i * 2, i * 3, rr() * 100 | 0, 0, 0, 0, 0], traits: [{ code: 11, dataId: i % 7, value: rr() }, { code: 31, dataId: 1, value: 0 }], effects: Array.from({ length: 6 }, (_, k) => ({ code: k, dataId: i, value1: rr(), value2: 0 })), meta: { hp: i * 10, flag: i % 2 === 0 } });
    return JSON.stringify(a);
  };

  class Vec { constructor(x, y) { this.x = x; this.y = y; } add(o) { return new Vec(this.x + o.x, this.y + o.y); } len() { return Math.sqrt(this.x * this.x + this.y * this.y); } }
  class Sprite { constructor(i) { this.x = i; this.y = i * 2; this.vx = 1; this.vy = -1; this.rotation = 0; this.visible = true; } update() { this.x += this.vx; this.y += this.vy; this.rotation += 0.01; if (this.x > 640) this.vx = -1; if (this.x < 0) this.vx = 1; } }
  const shapes = [() => ({ a: 1, b: 2 }), () => ({ b: 2, a: 1 }), () => ({ a: 1, b: 2, c: 3 }), () => ({ x: 0, a: 1, b: 2 })];

  H5B.suite("js", [
    // ---- checks: language and runtime features engines and games expect ----
    ["check.es2020", () => H5B.check("es2020", () => { const o = { a: { b: 1 } }; return (o?.a?.b ?? 0) === 1 && 2n ** 10n === 1024n; })],
    ["check.async", () => H5B.check("async_await", async () => (await Promise.resolve(3)) === 3)],
    ["check.classfields", () => H5B.check("class_fields", () => { try { return new Function("class A { #x = 1; y = 2; get x() { return this.#x; } } return new A().x + new A().y;")() === 3; } catch (_) { return false; } })],
    ["check.weakref", () => H5B.check("weakref_finalization", () => typeof WeakRef === "function" && typeof FinalizationRegistry === "function" ? true : H5B.MISSING)],
    ["check.wasm", () => H5B.check("webassembly", () => { if (typeof WebAssembly !== "object") return H5B.MISSING; const m = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 7, 1, 96, 2, 127, 127, 1, 127, 3, 2, 1, 0, 7, 7, 1, 3, 97, 100, 100, 0, 0, 10, 9, 1, 7, 0, 32, 0, 32, 1, 106, 11])); return new WebAssembly.Instance(m).exports.add(2, 3) === 5; })],
    ["check.textcodec", () => H5B.check("text_encoder_decoder", () => typeof TextEncoder === "function" && typeof TextDecoder === "function" ? new TextDecoder().decode(new TextEncoder().encode("é✓")) === "é✓" : H5B.MISSING)],
    ["check.structuredclone", () => H5B.check("structured_clone", () => typeof structuredClone === "function" ? structuredClone({ a: [1, { b: 2 }] }).a[1].b === 2 : H5B.MISSING)],
    ["check.intl", () => H5B.check("intl_number_format", () => typeof Intl === "object" ? new Intl.NumberFormat("en-US").format(1234.5) === "1,234.5" : H5B.MISSING)],
    ["check.sab", () => H5B.check("shared_array_buffer", () => typeof SharedArrayBuffer === "function" ? true : H5B.MISSING)],
    ["check.worker", () => H5B.check("worker", () => typeof Worker === "function" ? true : H5B.MISSING)],

    // ---- timings ----
    ["loop.int", () => H5B.measure("loop.int_sum_1k", (n) => { let s = 0; for (let k = 0; k < n; k++) for (let i = 0; i < 1000; i++) s = (s + i * k) | 0; sink += s; })],
    ["math.trig", () => H5B.measure("math.sin_cos_sqrt_1k", (n) => { let s = 0; for (let k = 0; k < n; k++) for (let i = 0; i < 1000; i++) s += Math.sin(i) * Math.cos(i) + Math.sqrt(i); sink += s; })],
    ["obj.alloc", () => H5B.measure("obj.alloc_vec_1k", (n) => { let v = new Vec(0, 0); const d = new Vec(1, 1); for (let k = 0; k < n; k++) for (let i = 0; i < 1000; i++) v = v.add(d); sink += v.len(); })],
    ["obj.sprites", () => H5B.measure("obj.update_1k_sprites", (n, ss) => { for (let k = 0; k < n; k++) for (const s of ss) s.update(); sink += ss[0].x; }, { setup: () => Array.from({ length: 1000 }, (_, i) => new Sprite(i)) })],
    ["prop.mono", () => H5B.measure("prop.monomorphic_1k", (n, os) => { let s = 0; for (let k = 0; k < n; k++) for (const o of os) s += o.a + o.b; sink += s; }, { setup: () => Array.from({ length: 1000 }, () => shapes[0]()) })],
    ["prop.poly", () => H5B.measure("prop.polymorphic4_1k", (n, os) => { let s = 0; for (let k = 0; k < n; k++) for (const o of os) s += o.a + o.b; sink += s; }, { setup: () => Array.from({ length: 1000 }, (_, i) => shapes[i & 3]()) })],
    ["prop.dict", () => H5B.measure("prop.dictionary_1k", (n, o) => { let s = 0; for (let k = 0; k < n; k++) for (let i = 0; i < 1000; i++) s += o["k" + (i & 255)]; sink += s; }, { setup: () => { const o = {}; for (let i = 0; i < 256; i++) o["k" + i] = i; return o; } })],
    ["array.pushpop", () => H5B.measure("array.push_pop_1k", (n) => { const a = []; for (let k = 0; k < n; k++) { for (let i = 0; i < 1000; i++) a.push(i); for (let i = 0; i < 1000; i++) sink += a.pop(); } })],
    ["array.functional", () => H5B.measure("array.map_filter_reduce_1k", (n, a) => { for (let k = 0; k < n; k++) sink += a.map((x) => x * 2).filter((x) => x % 3).reduce((p, x) => p + x, 0); }, { setup: () => Array.from({ length: 1000 }, (_, i) => i) })],
    ["array.sort", () => H5B.measure("array.sort_1k_numbers", (n, a) => { for (let k = 0; k < n; k++) { const b = a.slice(); b.sort((x, y) => x - y); sink += b[0]; } }, { setup: () => Array.from({ length: 1000 }, () => r()) })],
    ["typed.f32", () => H5B.measure("typed.f32_vertex_fill_4k", (n, f) => { for (let k = 0; k < n; k++) { for (let i = 0; i < f.length; i += 4) { f[i] = i; f[i + 1] = k; f[i + 2] = 0.5; f[i + 3] = 1; } } sink += f[5]; }, { setup: () => new Float32Array(4096) })],
    ["typed.u8", () => H5B.measure("typed.u8_pixel_loop_64k", (n, p) => { for (let k = 0; k < n; k++) for (let i = 0; i < p.length; i += 4) { p[i] = 255 - p[i]; p[i + 3] = 255; } sink += p[0]; }, { setup: () => new Uint8ClampedArray(65536) })],
    ["string.concat", () => H5B.measure("string.concat_1k", (n) => { for (let k = 0; k < n; k++) { let s = ""; for (let i = 0; i < 1000; i++) s += "ab" + i; sink += s.length; } })],
    ["string.template", () => H5B.measure("string.template_1k", (n) => { let l = 0; for (let k = 0; k < n; k++) for (let i = 0; i < 1000; i++) l += `\\C[${i % 8}]HP ${i}/${k}`.length; sink += l; })],
    ["string.regex", () => H5B.measure("string.regex_escape_codes", (n, t) => { for (let k = 0; k < n; k++) sink += t.replace(/\\([CIVN])\[(\d+)\]/gi, (m, c, d) => c + d).length; }, { setup: () => "\\C[2]Hello \\V[10] and \\N[1]! ".repeat(40) })],
    ["string.splitjoin", () => H5B.measure("string.split_join_1k_words", (n, t) => { for (let k = 0; k < n; k++) sink += t.split(" ").reverse().join(" ").length; }, { setup: () => Array.from({ length: 1000 }, (_, i) => "word" + i).join(" ") })],
    ["json.parse", () => H5B.once("json.parse_1mb", (d) => { sink += JSON.parse(d).length; }, { setup: bigData })],
    ["json.stringify", () => H5B.once("json.stringify_1mb", (o) => { sink += JSON.stringify(o).length; }, { setup: () => JSON.parse(bigData()) })],
    ["map.set", () => H5B.measure("map.set_get_1k", (n) => { const m = new Map(); for (let k = 0; k < n; k++) { for (let i = 0; i < 1000; i++) m.set("k" + i, i); for (let i = 0; i < 1000; i++) sink += m.get("k" + i); } })],
    ["call.closure", () => H5B.measure("call.closure_1k", (n) => { const add = (a) => (b) => a + b; let s = 0; for (let k = 0; k < n; k++) for (let i = 0; i < 1000; i++) s = add(i)(s) | 0; sink += s; })],
    ["call.trycatch", () => H5B.measure("call.try_catch_throw_100", (n) => { for (let k = 0; k < n; k++) for (let i = 0; i < 100; i++) { try { if (i % 10 === 0) throw new Error("x"); } catch (e) { sink++; } } })],
    ["gc.churn", () => H5B.measure("gc.churn_10k_small_arrays", (n) => { for (let k = 0; k < n; k++) { let keep = null; for (let i = 0; i < 10000; i++) { const a = [i, i + 1, i + 2]; if ((i & 1023) === 0) keep = a; } sink += keep[0]; } })],
    ["promise.chain", () => H5B.once("promise.chain_10k", async () => { let p = Promise.resolve(0); for (let i = 0; i < 10000; i++) p = p.then((v) => v + 1); sink += await p; })],
  ]);
  H5B.jsSink = () => sink;
})();
