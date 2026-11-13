# h5bench

Benchmarks and feature checks for HTML5 game engines and runtimes: browser-free runtimes (V8 or Node with their
own web APIs), NW.js, Electron, and desktop or handheld browsers as a reference. Plain HTML and JavaScript,
no build step and no dependencies, so the same files run everywhere.

Each area has its own page, so a regression or a gap shows up on the page it belongs to:

| Page | What it covers |
|---|---|
| `js.html` | JavaScript engine: loops, math, allocation and GC, property access (mono/poly/dictionary), arrays, typed arrays, strings, regex, JSON (1 MB), Map, closures, exceptions, promises. Checks: ES2020, class fields, WeakRef, WebAssembly, TextEncoder, structuredClone, Intl, SharedArrayBuffer, Worker |
| `webgl.html` | WebGL 1: draw calls, batched sprites, blended fill rate, texture uploads (arrays and 2D canvases), program and framebuffer switches, readPixels, shader compiles. Checks: WebGL 2, common extensions, max texture size, clear and readback, `texImage2D(null)` is zero, framebuffer completeness |
| `webgl2.html` | WebGL 2, as modern engines use it: instanced sprites, uniform buffer updates, vertex array object switches, 4 render targets (G-buffer), texture-array sprites, transform-feedback particles (100k), 4x MSAA resolve, RGBA16F targets, fenced pixel-buffer readback. Checks named by the Khronos conformance suite's areas (buffers, glsl, rendering, state, textures), each rendering and reading back: limits, GLSL ES 3.00, VAOs, gl_InstanceID, MRT, texStorage, 3D and array textures with texelFetch, UBOs, transform feedback, copyBufferSubData, samplers, integer textures, float targets, MSAA blit, PBO readback, fence sync, queries, NPOT mipmaps |
| `canvas2d.html` | Canvas 2D: sprites with drawImage (plain, scaled and rotated), fillRect, paths, text (filled and outlined), measureText, full-canvas blits, get/putImageData. Checks: measureText scaling and bounding boxes, text painting, exact image data, composite modes (and that `lighter` adds), filter, gradients, patterns, line dash, smoothing off, toDataURL |
| `layout.html` | CSS layout as a browser does it (box sizes, block flow, percentages, flexbox, absolute positioning, inline text, computed style, scroll size, font loading) and the text layout engines do themselves (measureText word wrap, CJK fallback) |
| `dom.html` | DOM API without layout: tree building, innerHTML, selectors, classList, dataset, events and bubbling, DOMParser, MutationObserver, closest/matches, cloneNode, plus their costs |
| `media.html` | PNG decoding (256 to 2048 px), image upload to WebGL and first 2D draw, ImageBitmap, blob URLs, Web Audio (node types, AudioWorklet, WAV and OGG decoding, starting sources every frame), audio and video codec answers |
| `timing.html` | requestAnimationFrame cadence (idle and with 8 ms of work), setTimeout and setInterval accuracy, performance.now resolution, MessageChannel, queueMicrotask, page visibility |
| `storage.html` | localStorage, IndexedDB and Node `fs` (NW.js-style saves): checks and write/read times |
| `index.html` | All pages in order (about 6-10 minutes). Engines usually boot `index.html` |

## Results

Every result is one console line, so any engine with a console works:

```
H5B-INFO  <page> <key>=<value>                    environment: user agent, GL renderer, window, cores
H5B-CHECK <page> <name> pass|fail|missing [why]   a feature; fail and missing are gaps
H5B <page> <name> <metric>=<value> ...            a timing
H5B-ERROR <page> <name> <message>                 a test threw: a gap
H5B-SKIP  <page> <name> <why>                     not run because its API is missing (the check says so)
H5B-DONE  <page> <seconds>
```

Metrics: `ops_s` (work units per second), `max60` (the most items that still run at 55+ fps: draw calls,
sprites, full-screen layers), `fps`, `frame_ms`, `p95_ms`, `cpu_ms` (time inside the frame callback), `ms`
(median of several runs). `max60` does not depend on the display's refresh cap, so it compares engines and
devices well.

Browsers also print the lines on the page. `?only=a,b` runs only the tests whose names start with those prefixes
(for example `webgl.html?only=check,sprites`). The URL options (`only`, `label`, `post`, `download`, `close`,
`file=0`) need an engine that passes a query string to `location.search`; engines that boot a file by name run
the whole page with the label `run`.

## Results files

At the end of a run the page saves `<label>-<page or all>-<date-time>.json` (the same format `h5bench.py parse`
makes) and the raw `.log`:

- Engines with Node `fs` (NW.js, browser-free runtimes, Node-based engines) write them into `results/` next to
  the pages and print `H5B-FILE <path>`.
- `?post=<url>` sends them to that URL: `python3 tools/h5bench.py serve 8000` serves the pages and saves what
  pages opened as `http://<pc>:8000/index.html?post=/results&label=<name>` send (handheld browsers, engines with
  XHR but no file access).
- Browsers without either get a "Download results" link at the top of the page (`?download=1` clicks it).

## Comparing runs

```
python3 tools/h5bench.py parse results/engineA.log -o results/engineA.json --label engineA
python3 tools/h5bench.py compare results/engineA.json results/engineB.json --threshold 10
python3 tools/h5bench.py table results/a.json results/b.json results/c.json
```

`compare` lists regressions (worse by the threshold or more, by each metric's direction), improvements, new
gaps, fixed gaps and tests the new run did not do. `table` puts several runs side by side (engines, devices,
builds) with gaps in bold. Logs can be passed directly instead of JSON; lines may have prefixes (timestamps).

`score` gives one number per area and overall, Speedometer-style: the geometric mean of every timing against a
reference run, where 100 = as fast as the reference:

```
python3 tools/h5bench.py score results/new.json --reference expectations/chrome-headless.json
```

## Modules

Each area is a module, `bench/<area>.js`, registering its tests with `H5B.suite("<area>", [[id, fn], ...])`.
`bench/modules.js` lists them in run order. `run.html?pages=a,b` loads any modules dynamically.
`tools/make_pages.py` writes one page per module plus `index.html`, for engines that boot a file by name. To add
an area: write the module, add it to the list, run `make_pages.py`. A test is one of:
- `H5B.check(name, fn)`: true, false or a reason, or `H5B.MISSING`.
- `H5B.measure(name, fn(n))`: throughput, median of 5 windows plus `spread` (the run's own noise).
- `H5B.once(name, fn)`: median of several runs.
- `H5B.frames(name, {frame})`: frame times over a few seconds.
- `H5B.ramp(name, {frame(ctx, n)})`: MotionMark-style, the most `n` that still holds 55+ fps.
- `H5B.skip(name, why)`: when the API is missing.

## CI

`tools/h5bench.py ci` runs pages headless and judges the run against a baseline in `expectations/`, the way
web-platform-tests uses expectation files: gaps the baseline already has are known (reported as skipped), new
gaps fail. Timing regressions past `--threshold` (default 25%) are listed as warnings, since shared CI machines
are noisy; `--fail-on gaps,regressions` makes them fail on a dedicated machine. Exit codes: 0 pass, 1 fail, 2 no
results.

```
# a browser: serves the pages, runs it headless (SwiftShader GL unless --gpu), takes the POSTed results
python3 tools/h5bench.py ci --browser chrome --baseline expectations/chrome-headless.json --junit results/junit.xml
# any engine: one page per run, {dir} = this folder, {page} = the page file; its console output is collected
xvfb-run -a python3 tools/h5bench.py ci --engine 'ENGINE --game {dir} --page {page}' --baseline expectations/engine.json
# make or refresh a baseline from a run you trust
python3 tools/h5bench.py ci --browser chrome --save-baseline expectations/chrome-headless.json
```

Headless browsers run on SwiftShader (software GL) unless `--gpu`: fine for checks and JS, while GPU timings
there say little about real hardware. Every WebGL and Canvas 2D frame test ends its frame with a 1x1 readback, so
frames wait for the GPU even where requestAnimationFrame does not (headless browsers otherwise queue frames
without limit). While a run goes, pages opened with `?post` stream each line to the server, and `ci` prints them,
so a run that hangs shows the test it stopped in.

`--junit` writes JUnit XML (one test case per check and timing), `--summary` appends Markdown (on GitHub:
`$GITHUB_STEP_SUMMARY`). `.github/workflows/h5bench.yml` runs every page in headless Chrome on each push, with an
engine job to copy for engines that have a Linux build.

## Running it

- **Browser:** serve the folder (`python3 -m http.server 8000`) and open `http://localhost:8000/js.html`. Pages
  opened from `file://` cannot load the assets. Keep the tab visible: browsers pause requestAnimationFrame in
  hidden tabs, and the frame tests wait for it.
- **NW.js:** `package.json` points at `index.html`: run `nw .` in this folder.
- **A browser-free runtime:** boot the page as the game, at 640x480 if it has a window size option, and save
  stdout. For example RMMV Native, a V8-based runtime that boots the page named in `RMMV_INDEX`:
  `RMMV_INDEX=webgl.html rmmv-native --game h5bench --window 640x480 --secs 300 > webgl.log`
  (`tools/h5bench_pc.sh` there does this under Xvfb). Engines with a Node-like `process` close themselves when
  done (`?close=0` to stay open, `?close=1` to close in a browser).
- **Assets:** `assets/` is made by `tools/make_assets.py` (Pillow; ffmpeg for the OGG). Run it again to rebuild.

## Notes for fair numbers

- All drawing uses a 640x480 canvas (the window scales it), the same random seed, and the same work everywhere.
- Frame tests include presenting the frame; `cpu_ms` is only the JavaScript side. A GPU-bound test shows a low
  fps with a small `cpu_ms`.
- Run each page twice and look at the second run when an engine caches compiled code or shaders.
- On handhelds, the CPU governor and GPU clock change results a lot: note them with the run.
