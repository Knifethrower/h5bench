// h5bench page "storage": how saves get written (localStorage, IndexedDB, Node fs in NW.js-style engines).
"use strict";
(function () {
  const big = "x".repeat(100 * 1024);
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open("h5bench", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error || new Error("open failed")); });
  const tx = (db, mode, fn) => new Promise((res, rej) => { const t = db.transaction("kv", mode); const out = fn(t.objectStore("kv")); t.oncomplete = () => res(out && out.result); t.onerror = () => rej(t.error); });
  const nodeFs = () => { try { return typeof require === "function" ? require("fs") : null; } catch (_) { return null; } };
  const tmpFile = () => { try { const os = require("os"), path = require("path"); return path.join(os.tmpdir(), "h5bench-" + Date.now() + ".bin"); } catch (_) { return "h5bench-tmp.bin"; } };

  H5B.suite("storage", [
    ["check.local", () => H5B.check("local_storage", () => { if (typeof localStorage === "undefined") return H5B.MISSING; localStorage.setItem("h5b", "1"); const ok = localStorage.getItem("h5b") === "1"; localStorage.removeItem("h5b"); return ok; })],
    ["check.idb", () => H5B.check("indexeddb_roundtrip", async () => { if (typeof indexedDB === "undefined") return H5B.MISSING; const db = await idb(); await tx(db, "readwrite", (s) => s.put({ a: [1, 2] }, "k")); const v = await tx(db, "readonly", (s) => s.get("k")); db.close(); return (v && v.a && v.a[1] === 2) || "got " + JSON.stringify(v); })],
    ["check.fs", () => H5B.check("node_fs", () => { const fs = nodeFs(); if (!fs) return H5B.MISSING; const f = tmpFile(); fs.writeFileSync(f, "abc"); const ok = fs.readFileSync(f, "utf8") === "abc"; fs.unlinkSync(f); return ok; })],

    ["local.write", () => typeof localStorage === "undefined" ? H5B.skip("local_storage.write_100kb_x10", "no localStorage") : H5B.once("local_storage.write_100kb_x10", () => { for (let i = 0; i < 10; i++) localStorage.setItem("h5b" + i, big + i); }, { runs: 5 })],
    ["local.read", () => typeof localStorage === "undefined" ? H5B.skip("local_storage.read_100kb_x10", "no localStorage") : H5B.once("local_storage.read_100kb_x10", () => { let n = 0; for (let i = 0; i < 10; i++) n += (localStorage.getItem("h5b" + i) || "").length; for (let i = 0; i < 10; i++) if (n < 0) localStorage.removeItem("h5b" + i); }, { runs: 5 })],
    ["local.cleanup", async () => { try { for (let i = 0; i < 10; i++) localStorage.removeItem("h5b" + i); } catch (_) {} }],
    ["idb.write", () => { if (typeof indexedDB === "undefined") return H5B.skip("indexeddb.put_100kb_x10", "no indexedDB"); let db; return H5B.once("indexeddb.put_100kb_x10", () => tx(db, "readwrite", (s) => { for (let i = 0; i < 10; i++) s.put(big + i, "k" + i); }), { runs: 5, setup: async () => { db = await idb(); } }); }],
    ["fs.write", () => { if (!nodeFs()) return H5B.skip("node_fs.write_read_1mb", "no require(fs)"); let fs, f; const buf = new Uint8Array(1 << 20); return H5B.once("node_fs.write_read_1mb", () => { fs.writeFileSync(f, buf); fs.readFileSync(f); }, { runs: 5, setup: () => { fs = nodeFs(); f = tmpFile(); } }).then(() => { try { fs.unlinkSync(f); } catch (_) {} }); }],
  ]);
})();
