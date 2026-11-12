#!/usr/bin/env python3
"""h5bench results: logs (any engine's console output with H5B lines) -> JSON, comparisons, tables.

  h5bench.py parse <log> [-o run.json] [--label NAME]     one run (all H5B lines in the log)
  h5bench.py compare <base> <new> [--threshold 10]         regressions, improvements, new and fixed gaps
  h5bench.py table <run> <run> ...                         side by side (engines, devices, builds)
  h5bench.py serve [port]                                  serve the pages; save results POSTed to /results
  h5bench.py score <run> --reference <run>                 per-area and overall score, 100 = the reference
  h5bench.py ci (--browser chrome|edge|PATH [--gpu] | --engine 'CMD {dir} {page}') [--pages a,b]
                [--baseline F] [--threshold 25] [--fail-on gaps[,regressions]] [--junit F] [--summary F]
                [--save-baseline F] [--label L]
      runs headless, judges against the baseline: exit 1 on new gaps or regressions, 2 on no results

<base>, <new>, <run> are logs or JSON files from `parse`. Output is Markdown.
Metrics: ops_s, fps, max60 are higher-is-better; ms, ms_op, frame_ms, p95_ms, cpu_ms lower-is-better."""
import json, os, re, sys

HIGHER = {"ops_s", "fps", "max60"}
LOWER = {"ms", "ms_op", "frame_ms", "p95_ms", "cpu_ms", "min_ms", "max_ms"}
# The metric a test is judged by, in this order.
PRIMARY = ["ops_s", "max60", "ms", "frame_ms"]


def parse_log(path, label=None):
    run = {"label": label or os.path.splitext(os.path.basename(path))[0], "info": {}, "checks": {}, "times": {}, "errors": {}, "skipped": {}, "pages_done": []}
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            # Engines may prefix console lines (timestamps, "[console]"): find the tag anywhere.
            m = re.search(r"\b(H5B(?:-INFO|-CHECK|-ERROR|-SKIP|-DONE|-ALLDONE)?) (.*)$", line.rstrip("\r\n"))
            if not m:
                continue
            tag, rest = m.group(1), m.group(2).split(" ")
            if tag == "H5B-INFO" and len(rest) >= 2 and "=" in rest[1]:
                k, v = rest[1].split("=", 1)
                run["info"][k] = v
            elif tag == "H5B-CHECK" and len(rest) >= 3:
                run["checks"][rest[0] + "/" + rest[1]] = {"status": rest[2], "detail": " ".join(rest[3:]).replace("_", " ")}
            elif tag == "H5B-ERROR" and len(rest) >= 2:
                run["errors"][rest[0] + "/" + rest[1]] = " ".join(rest[2:]).replace("_", " ")
            elif tag == "H5B-SKIP" and len(rest) >= 2:
                run["skipped"][rest[0] + "/" + rest[1]] = " ".join(rest[2:]).replace("_", " ")
            elif tag == "H5B-DONE" and rest:
                run["pages_done"].append(rest[0])
            elif tag == "H5B" and len(rest) >= 3:
                metrics = {}
                for kv in rest[2:]:
                    if "=" in kv:
                        k, v = kv.split("=", 1)
                        try:
                            metrics[k] = float(v)
                        except ValueError:
                            pass
                run["times"][rest[0] + "/" + rest[1]] = metrics
    return run


def load(path, label=None):
    if path.endswith(".json"):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return parse_log(path, label)


def primary(metrics):
    for k in PRIMARY:
        if k in metrics:
            return k, metrics[k]
    return None, None


def fmt(v):
    return "" if v is None else f"{v:.0f}" if abs(v) >= 100 else f"{v:.1f}" if abs(v) >= 10 else f"{v:.3g}"


def gaps(run):
    g = {k: f"{c['status']}" + (f" ({c['detail']})" if c["detail"] else "") for k, c in run["checks"].items() if c["status"] != "pass"}
    g.update({k: "error: " + e for k, e in run["errors"].items()})
    return g


def compare(base, new, threshold):
    out = [f"# h5bench: {base['label']} -> {new['label']}", ""]
    for who in (base, new):
        i = who["info"]
        out.append(f"- **{who['label']}**: {i.get('gl_renderer', '?')}, window {i.get('window', '?')}, {i.get('user_agent', '?')[:80]}")
    regress, better, same = [], [], 0
    for name in sorted(set(base["times"]) & set(new["times"])):
        k, a = primary(base["times"][name])
        b = new["times"][name].get(k) if k else None
        if k is None or b is None or a in (0, None):
            continue
        change = (b - a) / a * 100 if k in HIGHER else (a - b) / a * 100  # positive = better
        row = f"| {name} | {k} | {fmt(a)} | {fmt(b)} | {change:+.0f}% |"
        if change <= -threshold:
            regress.append((change, row))
        elif change >= threshold:
            better.append((-change, row))
        else:
            same += 1
    head = ["| test | metric | " + base["label"] + " | " + new["label"] + " | change |", "|---|---|---|---|---|"]
    out += ["", f"## Regressions (worse by {threshold}% or more): {len(regress)}", ""]
    out += head + [r for _, r in sorted(regress)] if regress else ["None."]
    out += ["", f"## Improvements: {len(better)}", ""]
    out += head + [r for _, r in sorted(better)] if better else ["None."]
    out += ["", f"{same} timings within {threshold}%."]
    gb, gn = gaps(base), gaps(new)
    new_gaps = {k: v for k, v in gn.items() if k not in gb}
    fixed = {k: v for k, v in gb.items() if k not in gn and (k in new["checks"] or k in new["times"])}
    out += ["", f"## New gaps: {len(new_gaps)}", ""] + ([f"- {k}: {v}" for k, v in sorted(new_gaps.items())] or ["None."])
    out += ["", f"## Fixed gaps: {len(fixed)}", ""] + ([f"- {k}: was {v}" for k, v in sorted(fixed.items())] or ["None."])
    gone = sorted((set(base["times"]) | set(base["checks"])) - (set(new["times"]) | set(new["checks"]) | set(new["errors"]) | set(new.get("skipped", {}))))
    if gone:
        out += ["", f"## Not run in {new['label']}: {len(gone)}", ""] + [f"- {k}" for k in gone]
    return "\n".join(out)


def table(runs):
    labels = [r["label"] for r in runs]
    out = ["# h5bench: " + ", ".join(labels), ""]
    for r in runs:
        i = r["info"]
        out.append(f"- **{r['label']}**: {i.get('gl_renderer', '?')}, window {i.get('window', '?')}, cores {i.get('cores', '?')}")
    names = sorted(set().union(*[r["times"] for r in runs]))
    out += ["", "## Timings", "", "| test | metric | " + " | ".join(labels) + " |", "|---|---|" + "---|" * len(runs)]
    for n in names:
        k = next((primary(r["times"][n])[0] for r in runs if n in r["times"]), None)
        out.append(f"| {n} | {k} | " + " | ".join(fmt(r["times"].get(n, {}).get(k)) for r in runs) + " |")
    checks = sorted(set().union(*[r["checks"] for r in runs]) | set().union(*[r["errors"] for r in runs]))
    out += ["", "## Checks (gaps in bold)", "", "| check | " + " | ".join(labels) + " |", "|---|" + "---|" * len(runs)]
    for c in checks:
        cells = []
        for r in runs:
            if c in r["errors"]:
                cells.append("**error**")
            elif c in r["checks"]:
                s = r["checks"][c]["status"]
                cells.append(s if s == "pass" else f"**{s}**")
            else:
                cells.append("")
        out.append(f"| {c} | " + " | ".join(cells) + " |")
    return "\n".join(out)


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def modules():
    src = open(os.path.join(ROOT, "bench", "modules.js"), encoding="utf-8").read()
    return re.findall(r'"([\w-]+)"', re.search(r"MODULES\s*=\s*\[([^\]]*)\]", src).group(1))


def ratio(metric, ref, new):
    """new relative to ref, >1 = better, by the metric's direction."""
    if not ref or not new:
        return None
    return new / ref if metric in HIGHER else ref / new


def score(run, ref):
    """Speedometer/MotionMark-style: per area the geometric mean of every timing against the reference run, x100;
    overall = geometric mean of the areas. 100 = as fast as the reference."""
    import math
    per = {}
    for name, m in run["times"].items():
        if name not in ref["times"]:
            continue
        k, a = primary(ref["times"][name])
        r = ratio(k, a, m.get(k)) if k else None
        if r and r > 0:
            per.setdefault(name.split("/")[0], []).append(math.log(r))
    areas = {a: 100 * math.exp(sum(v) / len(v)) for a, v in per.items()}
    if areas:
        areas["overall"] = 100 * math.exp(sum(math.log(v / 100) for v in areas.values()) / len(areas))
    return areas


def judge(base, new, threshold):
    """CI verdict against a baseline: regressions past the threshold and gaps the baseline did not have."""
    regress = []
    for name in sorted(set(base["times"]) & set(new["times"])):
        k, a = primary(base["times"][name])
        r = ratio(k, a, new["times"][name].get(k)) if k else None
        if r is not None and (1 - r) * 100 >= threshold:
            regress.append((name, k, a, new["times"][name].get(k), (r - 1) * 100))
    gb, gn = gaps(base), gaps(new)
    new_gaps = {k: v for k, v in gn.items() if k not in gb}
    missing = sorted((set(base["times"]) | set(base["checks"])) - (set(new["times"]) | set(new["checks"]) | set(new["errors"]) | set(new.get("skipped", {}))))
    return regress, new_gaps, gb, missing


def junit(run, base, threshold, path, fail_regress=False):
    """JUnit XML: a test case per check and timing; new gaps and regressions fail, known gaps are skipped."""
    from xml.sax.saxutils import quoteattr, escape
    regress, new_gaps, known, _ = judge(base, run, threshold) if base else ([], gaps(run), {}, [])
    bad = {r[0]: f"{r[1]} {fmt(r[2])} -> {fmt(r[3])} ({r[4]:+.0f}%)" for r in regress} if fail_regress else {}
    cases = {}
    for name in list(run["checks"]) + list(run["errors"]) + list(run["times"]) + list(run.get("skipped", {})):
        area, test = name.split("/", 1)
        if name in new_gaps:
            body = f"<failure message={quoteattr(new_gaps[name])}/>"
        elif name in bad:
            body = f"<failure message={quoteattr('regression: ' + bad[name])}/>"
        elif name in known or name in run.get("skipped", {}):
            body = f"<skipped message={quoteattr('known gap: ' + str(known.get(name, run.get('skipped', {}).get(name, ''))))}/>"
        else:
            body = ""
        cases.setdefault(area, []).append(f'    <testcase classname={quoteattr("h5bench." + area)} name={quoteattr(test)}>{body}</testcase>')
    out = ['<?xml version="1.0" encoding="utf-8"?>', "<testsuites>"]
    for area, cs in cases.items():
        fails = sum("<failure" in c for c in cs)
        out += [f'  <testsuite name={quoteattr("h5bench." + area)} tests="{len(cs)}" failures="{fails}">'] + cs + ["  </testsuite>"]
    out.append("</testsuites>")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")


def find_browser(name):
    import shutil
    if os.path.isfile(name):
        return name
    cands = {"chrome": [r"C:\Program Files\Google\Chrome\Application\chrome.exe", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"],
             "edge": [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "microsoft-edge", "msedge"]}.get(name, [name])
    for c in cands:
        p = c if os.path.isfile(c) else shutil.which(c)
        if p:
            return p
    sys.exit(f"browser not found: {name}")


def ci(args, opt):
    """Run pages headless (a browser, or any engine command), judge against a baseline, write JUnit + summary.
    Exit 0 = no new gaps or regressions, 1 = some, 2 = no results."""
    import subprocess, tempfile, threading, time
    pages = (opt("--pages") or ",".join(modules())).split(",")
    label = opt("--label", "ci")
    threshold = float(opt("--threshold", 25))
    timeout = float(opt("--timeout", 1200))
    lines = []
    if opt("--browser"):
        got = threading.Event()
        httpd = make_server(0, lambda name: got.set())
        httpd.echo = "--quiet" not in args  # the CI log shows the run as it goes
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        url = f"http://127.0.0.1:{httpd.server_address[1]}/run.html?pages={','.join(pages)}&post=/results&label={label}"
        flags = ["--headless=new", "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "--window-size=640,480"]
        if "--gpu" not in args:
            flags += ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]  # same GL on every CI machine
        # The browser's whole process tree ends with the run (a timeout too); its throwaway profile may still be
        # locked for a moment on Windows, so cleanup errors are ignored.
        with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as prof:
            kw = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
            proc = subprocess.Popen([find_browser(opt("--browser")), *flags, f"--user-data-dir={prof}", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kw)
            ok = got.wait(timeout)
            if os.name == "nt":
                subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
            else:
                import signal
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
            try:
                proc.wait(10)
            except subprocess.TimeoutExpired:
                proc.kill()
            time.sleep(2)
        httpd.shutdown()
        if not ok:
            # Where it stopped: the streamed lines up to the hang, judged like a finished run.
            last = next((l for l in reversed(httpd.progress) if l.startswith(("H5B ", "H5B-CHECK", "H5B-ERROR", "H5B-SKIP", "H5B-DONE"))), "nothing")
            print(f"no results within {timeout:.0f} s; {len(httpd.progress)} lines streamed, the last: {last}")
            if not httpd.progress:
                return 2
            lines = httpd.progress + [f"H5B-ERROR {last.split(' ')[1] if ' ' in last else 'run'} run_timeout after_{last.replace(' ', '_')[:80]}"]
        else:
            lines = None
        if lines is None:
            lines = open(os.path.join(ROOT, "results", httpd.last_name + ".log"), encoding="utf-8").read().splitlines()
    else:
        tpl = opt("--engine")
        if not tpl:
            sys.exit("ci needs --browser NAME|PATH or --engine 'command with {dir} {page}'")
        for p in pages:  # engines that boot a file by name: one page per run
            cmd = tpl.format(dir=ROOT, page=p + ".html")
            print("$", cmd, flush=True)
            try:
                r = subprocess.run(cmd, shell=True, capture_output=True, text=True, errors="replace", timeout=timeout)
                lines += [l for l in (r.stdout + "\n" + r.stderr).splitlines() if "H5B" in l]
            except subprocess.TimeoutExpired as e:
                lines += [l for l in ((e.stdout or b"").decode(errors="replace")).splitlines() if "H5B" in l]
                lines.append(f"H5B-ERROR {p} page_timeout no_H5B-DONE_after_{timeout:.0f}s")
    path = os.path.join(ROOT, "results", f"{label}-ci.log")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    run = parse_log(path, label)
    if not run["times"] and not run["checks"]:
        print("no H5B results")
        return 2
    with open(os.path.join(ROOT, "results", f"{label}-ci.json"), "w", encoding="utf-8") as f:
        json.dump(run, f, indent=1)
    base = load(opt("--baseline")) if opt("--baseline") and os.path.exists(opt("--baseline")) else None
    if opt("--save-baseline"):
        with open(opt("--save-baseline"), "w", encoding="utf-8") as f:
            json.dump(run, f, indent=1)
    if opt("--junit"):
        junit(run, base, threshold, opt("--junit"), "regressions" in (opt("--fail-on") or "gaps").split(","))
    text = [f"# h5bench CI: {label}", "", f"{len(run['times'])} timings, {len(run['checks'])} checks, {len(gaps(run))} gaps, pages {', '.join(run['pages_done'])}"]
    failed = False
    # Gaps are deterministic; timings on shared CI machines are not: by default only new gaps fail the build.
    fail_on = (opt("--fail-on") or "gaps").split(",")
    if base:
        regress, new_gaps, known, missing = judge(base, run, threshold)
        failed = bool(new_gaps and "gaps" in fail_on) or bool(regress and "regressions" in fail_on)
        sc = score(run, base)
        text += ["", "Score against the baseline (100 = same): " + ", ".join(f"{a} {v:.0f}" for a, v in sc.items())]
        text += ["", f"## New gaps: {len(new_gaps)}", ""] + ([f"- {k}: {v}" for k, v in sorted(new_gaps.items())] or ["None."])
        warn = "" if "regressions" in fail_on else " (warnings: --fail-on gaps,regressions makes them fail)"
        text += ["", f"## Regressions ({threshold:.0f}% or worse): {len(regress)}{warn}", ""] + ([f"- {n}: {k} {fmt(a)} -> {fmt(b)} ({c:+.0f}%)" for n, k, a, b, c in regress] or ["None."])
        text += ["", f"Known gaps (in the baseline): {len(known)}. Not run: {len(missing)}."]
    else:
        text += ["", "No baseline: nothing to judge (use --save-baseline to make one)."]
    text += ["", "**Result: " + ("FAIL" if failed else "pass") + "**"]
    md = "\n".join(text) + "\n"
    print(md)
    if opt("--summary"):
        with open(opt("--summary"), "a", encoding="utf-8") as f:
            f.write(md)
    return 1 if failed else 0


def make_server(port, on_result=None):
    """The bench folder over HTTP; POST /results saves a page's results (pages opened with ?post=/results)."""
    import http.server, functools
    results = os.path.join(ROOT, "results")
    os.makedirs(results, exist_ok=True)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
        def do_POST(self):
            if self.path.split("?")[0] == "/results/progress":
                line = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8", "replace")
                self.server.progress.append(line)
                if getattr(self.server, "echo", False):
                    print("  " + line, flush=True)
                self.send_response(204)
                self.end_headers()
                return
            if self.path.split("?")[0] != "/results":
                self.send_error(404)
                return
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            name = re.sub(r"[^\w.-]", "_", str(body.get("name", "run")))
            with open(os.path.join(results, name + ".json"), "w", encoding="utf-8") as f:
                json.dump(body.get("json", {}), f, indent=1)
            with open(os.path.join(results, name + ".log"), "w", encoding="utf-8") as f:
                f.write(body.get("log", ""))
            print(f"saved results/{name}.json from {self.client_address[0]}", flush=True)
            self.server.last_name = name
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            if on_result:
                on_result(name)

    httpd = http.server.ThreadingHTTPServer(("", port), functools.partial(Handler, directory=ROOT))
    httpd.last_name = None
    httpd.progress = []
    return httpd


def serve(port):
    print(f"h5bench on http://0.0.0.0:{port}/ (open e.g. /run.html?post=/results&label=NAME); results go to results/", flush=True)
    make_server(port).serve_forever()


def main(argv):
    if len(argv) >= 2 and argv[1] == "serve":
        serve(int(argv[2]) if len(argv) > 2 else 8000)
        return 0
    if len(argv) >= 2 and argv[1] in ("ci", "score"):
        args = argv[2:]
        opt = lambda name, default=None: args[args.index(name) + 1] if name in args else default
        if argv[1] == "ci":
            return ci(args, opt)
        files = [a for a in args if not a.startswith("--") and a != opt("--reference")]
        for a, v in score(load(files[0]), load(opt("--reference") or files[1])).items():
            print(f"{a}: {v:.0f}")
        return 0
    if len(argv) < 2 or argv[1] not in ("parse", "compare", "table"):
        print(__doc__)
        return 2
    cmd, args = argv[1], argv[2:]
    opt = lambda name, default=None: args[args.index(name) + 1] if name in args else default
    files = [a for i, a in enumerate(args) if not a.startswith("--") and not (i and args[i - 1] in ("-o", "--label", "--threshold")) and a != "-o"]
    if cmd == "parse":
        run = parse_log(files[0], opt("--label"))
        text = json.dumps(run, indent=1)
        if opt("-o"):
            with open(opt("-o"), "w", encoding="utf-8") as f:
                f.write(text)
            print(f"{opt('-o')}: {len(run['times'])} timings, {len(run['checks'])} checks, {len(gaps(run))} gaps, pages {','.join(run['pages_done'])}")
        else:
            print(text)
    elif cmd == "compare":
        print(compare(load(files[0]), load(files[1]), float(opt("--threshold", 10))))
    else:
        print(table([load(f) for f in files]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
