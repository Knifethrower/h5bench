// h5bench page "dom": the DOM API engines' pages and plugins use (jQuery pages, RPG Maker MZ plugins, Construct
// form controls), without layout.
"use strict";
(function () {
  const host = () => { const d = document.createElement("div"); document.body.appendChild(d); return d; };
  const drop = (d) => (d.remove ? d.remove() : d.parentNode && d.parentNode.removeChild(d));
  const tableHtml = (rows) => "<table>" + Array.from({ length: rows }, (_, i) => `<tr class="row r${i}" data-i="${i}"><td>${i}</td><td><b>Item ${i}</b></td><td><span class="v">${i * 3}</span></td></tr>`).join("") + "</table>";

  H5B.suite("dom", [
    ["check.tree", () => H5B.check("append_children", () => { const h = host(); for (let i = 0; i < 3; i++) h.appendChild(document.createElement("p")); const ok = h.children.length === 3 && h.firstChild && h.firstChild.tagName === "P"; drop(h); return ok; })],
    ["check.innerhtml", () => H5B.check("innerhtml_parse", () => { const h = host(); h.innerHTML = tableHtml(5); const n = h.getElementsByTagName ? h.getElementsByTagName("tr").length : 0; drop(h); return n === 5 || "rows " + n; })],
    ["check.query", () => H5B.check("query_selector", () => { const h = host(); h.innerHTML = tableHtml(5); const a = h.querySelector && h.querySelector(".r3"); const b = h.querySelectorAll ? h.querySelectorAll("tr[data-i]").length : 0; drop(h); return (a && a.getAttribute("data-i") === "3" && b === 5) || `byclass=${!!a} byattr=${b}`; })],
    ["check.byid", () => H5B.check("get_element_by_id", () => { const h = host(); const d = document.createElement("div"); d.id = "h5b-id-test"; h.appendChild(d); const ok = document.getElementById("h5b-id-test") === d; drop(h); return ok; })],
    ["check.classlist", () => H5B.check("class_list", () => { const d = document.createElement("div"); if (!d.classList) return H5B.MISSING; d.classList.add("a", "b"); d.classList.toggle("a"); return (d.className === "b" && d.classList.contains("b")) || "className " + d.className; })],
    ["check.dataset", () => H5B.check("dataset", () => { const d = document.createElement("div"); if (!d.dataset) return H5B.MISSING; d.dataset.fooBar = "1"; return d.getAttribute("data-foo-bar") === "1" || "attribute " + d.getAttribute("data-foo-bar"); })],
    ["check.events", () => H5B.check("custom_event_dispatch", () => { const d = document.createElement("div"); let n = 0; d.addEventListener("ping", (e) => { n += e.detail; }, { once: true }); d.dispatchEvent(new CustomEvent("ping", { detail: 2 })); d.dispatchEvent(new CustomEvent("ping", { detail: 2 })); return n === 2 || "count " + n; })],
    ["check.bubble", () => H5B.check("event_bubbling", () => { const h = host(); const c = document.createElement("span"); h.appendChild(c); let got = 0; h.addEventListener("tap", () => got++); c.dispatchEvent(new Event("tap", { bubbles: true })); drop(h); return got === 1 || "parent saw " + got; })],
    ["check.domparser", () => H5B.check("dom_parser", () => (typeof DOMParser === "function" ? new DOMParser().parseFromString("<a><b>1</b></a>", "text/html").getElementsByTagName("b").length === 1 : H5B.MISSING))],
    ["check.mutation", () => H5B.check("mutation_observer", () => (typeof MutationObserver === "function" ? true : H5B.MISSING))],
    ["check.closest", () => H5B.check("matches_closest", () => { const h = host(); h.innerHTML = tableHtml(2); const s = h.querySelector && h.querySelector(".v"); const ok = s && s.closest && s.closest("tr") && s.matches && s.matches("span.v"); drop(h); return !!ok || (s ? "closest/matches missing" : H5B.MISSING); })],
    ["check.clone", () => H5B.check("clone_node_deep", () => { const h = host(); h.innerHTML = tableHtml(3); const c = h.cloneNode && h.cloneNode(true); const n = c && c.getElementsByTagName ? c.getElementsByTagName("td").length : 0; drop(h); return n === 9 || "cells " + n; })],

    ["create", () => H5B.measure("dom.create_append_remove_100", (n, h) => { for (let k = 0; k < n; k++) { const els = []; for (let i = 0; i < 100; i++) { const e = document.createElement("div"); e.className = "x"; h.appendChild(e); els.push(e); } for (const e of els) h.removeChild(e); } }, { setup: host, teardown: drop })],
    ["innerhtml", () => H5B.measure("dom.innerhtml_100_rows", (n, h) => { for (let k = 0; k < n; k++) h.innerHTML = tableHtml(100); }, { setup: host, teardown: drop })],
    ["query", () => H5B.measure("dom.query_selector_all_rows", (n, h) => { for (let k = 0; k < n; k++) h.querySelectorAll("tr.row"); }, { setup: () => { const h = host(); h.innerHTML = tableHtml(300); return h; }, teardown: drop })],
    ["attrs", () => H5B.measure("dom.set_get_attribute_100", (n, h) => { for (let k = 0; k < n; k++) for (let i = 0; i < 100; i++) { h.setAttribute("data-k" + (i & 15), i); h.getAttribute("data-k" + (i & 15)); } }, { setup: host, teardown: drop })],
    ["events", () => H5B.measure("dom.dispatch_event_100", (n, d) => { for (let k = 0; k < n; k++) for (let i = 0; i < 100; i++) d.dispatchEvent(new Event("tick")); }, { setup: () => { const d = document.createElement("div"); d.addEventListener("tick", () => {}); return d; } })],
    ["style", () => H5B.measure("dom.style_writes_100", (n, h) => { for (let k = 0; k < n; k++) for (let i = 0; i < 100; i++) { h.style.left = i + "px"; h.style.opacity = String(i / 100); } }, { setup: host, teardown: drop })],
    ["text", () => H5B.measure("dom.text_content_100", (n, h) => { for (let k = 0; k < n; k++) for (let i = 0; i < 100; i++) h.textContent = "Score " + i; }, { setup: host, teardown: drop })],
  ]);
})();
