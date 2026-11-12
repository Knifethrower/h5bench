// h5bench: show the result lines on the page too, where the engine renders HTML (browsers, NW.js).
"use strict";
(function () {
  let pre = null;
  try {
    pre = document.createElement("pre");
    pre.id = "h5b-log";
    pre.setAttribute("style", "font:12px monospace;white-space:pre-wrap;margin:8px;");
    document.body.appendChild(pre);
  } catch (_) { pre = null; }
  H5B.onLine = (s) => { if (pre) pre.textContent += s + "\n"; };
})();
