// h5bench page "media": image decoding and upload, audio decoding and node cost, codec support.
// Images and the OGG come from assets/ (tools/make_assets.py); the WAV is made here.
"use strict";
(function () {
  const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("cannot load " + src)); im.src = src; });
  const bytes = (url) => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open("GET", url); x.responseType = "arraybuffer"; x.onload = () => (x.status < 400 && x.response ? res(x.response) : rej(new Error("status " + x.status))); x.onerror = () => rej(new Error("cannot read " + url)); x.send(); });
  let ac = null;
  const audio = () => { if (!ac) { const A = window.AudioContext || window.webkitAudioContext; ac = A ? new A() : null; } return ac; };
  // 1 s of 44.1 kHz stereo 16-bit PCM (a 440 Hz tone) as a WAV file.
  const wav = (secs = 1) => {
    const rate = 44100, n = rate * secs, b = new ArrayBuffer(44 + n * 4), v = new DataView(b), s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    s(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); s(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 4, true);
    for (let i = 0; i < n; i++) { const x = Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 8000); v.setInt16(44 + i * 4, x, true); v.setInt16(46 + i * 4, x, true); }
    return b;
  };
  const decode = (buf) => new Promise((res, rej) => { const p = audio().decodeAudioData(buf.slice(0), res, rej); if (p && p.then) p.then(res, rej); });
  const canPlay = (el, types) => types.map((t) => t.split("/")[1].split(";")[0] + ":" + (el.canPlayType(t) || "no")).join(",");

  H5B.suite("media", [
    ["check.image", () => H5B.check("image_png_load", async () => { const im = await load("assets/sprites_256.png"); return (im.width === 256 && im.height === 256) || `size ${im.width}x${im.height}`; })],
    ["check.bitmap", () => H5B.check("create_image_bitmap", async () => { if (typeof createImageBitmap !== "function") return H5B.MISSING; const b = await createImageBitmap(await load("assets/sprites_256.png")); return b.width === 256 || "width " + b.width; })],
    ["check.blob_url", () => H5B.check("blob_object_url_image", async () => { if (typeof URL === "undefined" || !URL.createObjectURL) return H5B.MISSING; const u = URL.createObjectURL(new Blob([await bytes("assets/sprites_256.png")], { type: "image/png" })); const im = await load(u); return im.width === 256 || "width " + im.width; })],
    ["check.audiocontext", () => H5B.check("audio_context", () => (audio() ? true : H5B.MISSING))],
    ["check.nodes", () => H5B.check("audio_node_types", () => { const a = audio(); if (!a) return H5B.MISSING; const miss = ["createGain", "createBufferSource", "createOscillator", "createStereoPanner", "createPanner", "createBiquadFilter", "createDynamicsCompressor", "createConvolver", "createAnalyser", "createDelay", "createWaveShaper"].filter((f) => typeof a[f] !== "function"); return miss.length ? "missing " + miss.join(",") : true; })],
    ["check.worklet", () => H5B.check("audio_worklet", () => (audio() && audio().audioWorklet ? true : H5B.MISSING))],
    ["check.wav", () => H5B.check("decode_wav", async () => { const b = await decode(wav(1)); return (Math.abs(b.duration - 1) < 0.01 && b.numberOfChannels === 2) || `duration ${b.duration} ch ${b.numberOfChannels}`; })],
    ["check.ogg", () => H5B.check("decode_ogg_vorbis", async () => { let buf; try { buf = await bytes("assets/tone_10s.ogg"); } catch (_) { return "asset missing (make_assets.py needs ffmpeg)"; } const b = await decode(buf); return Math.abs(b.duration - 10) < 0.1 || "duration " + b.duration; })],
    ["check.codecs_audio", () => H5B.check("audio_element_types", () => { const a = document.createElement("audio"); if (!a.canPlayType) return H5B.MISSING; const r = canPlay(a, ['audio/ogg; codecs="vorbis"', 'audio/ogg; codecs="opus"', "audio/mpeg", "audio/mp4", "audio/wav"]); H5B.info("audio_types", r); return !/ogg:no/.test(r.split(",")[0]) || r; })],
    ["check.codecs_video", () => H5B.check("video_element_types", () => { const v = document.createElement("video"); if (!v.canPlayType) return H5B.MISSING; const r = canPlay(v, ['video/webm; codecs="vp8"', 'video/webm; codecs="vp9"', 'video/mp4; codecs="avc1.42E01E"']); H5B.info("video_types", r); return !/webm:no/.test(r) || r; })],

    ["decode.256", () => H5B.once("image.decode_png_256", (_, i) => load("assets/sprites_256.png?" + i), { runs: 7 })],
    ["decode.1024", () => H5B.once("image.decode_png_1024", (_, i) => load("assets/sheet_1024.png?" + i), { runs: 5 })],
    ["decode.2048", () => H5B.once("image.decode_png_2048", (_, i) => load("assets/big_2048.png?" + i), { runs: 3 })],
    ["upload.webgl", () => { let gl, im; return H5B.once("image.webgl_upload_1024", () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); gl.deleteTexture(t); }, { runs: 5, setup: async () => { gl = H5B.getCanvas(640, 480).getContext("webgl"); im = await load("assets/sheet_1024.png"); } }); }],
    ["draw.2d", () => { let x, im; return H5B.once("image.first_2d_draw_1024", (_, i) => { x.drawImage(im, i, 0); x.getImageData(0, 0, 1, 1); }, { runs: 5, setup: async () => { const c = document.createElement("canvas"); c.width = 1024; c.height = 1024; x = c.getContext("2d"); im = await load("assets/sheet_1024.png"); } }); }],
    ["decode.wav", () => { let b; return H5B.once("audio.decode_wav_5s", () => decode(b), { runs: 5, setup: () => { audio(); b = wav(5); } }); }],
    ["decode.ogg", () => { let b; return H5B.once("audio.decode_ogg_10s", () => decode(b), { runs: 3, setup: async () => { audio(); b = await bytes("assets/tone_10s.ogg"); } }); }],
    ["play.sources", () => { let a, buf, g; return H5B.frames("audio.start_8_sources_a_frame", { setup: async () => { a = audio(); buf = await decode(wav(1)); g = a.createGain(); g.gain.value = 0.02; g.connect(a.destination); }, frame: () => { for (let k = 0; k < 8; k++) { const s = a.createBufferSource(); s.buffer = buf; s.connect(g); s.start(); s.stop(a.currentTime + 0.05); } }, seconds: 2 }); }],
  ]);
})();
