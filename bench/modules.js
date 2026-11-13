// h5bench modules: one file per area in bench/, run in this order by index.html and run.html. To add an area,
// write bench/<name>.js (H5B.suite("<name>", [...])), add it here and run tools/make_pages.py for its page.
"use strict";
H5B.MODULES = ["js", "webgl", "webgl2", "canvas2d", "layout", "dom", "media", "timing", "storage"];
