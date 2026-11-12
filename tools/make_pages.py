#!/usr/bin/env python3
"""Make one page per module (bench/modules.js) and index.html (all modules in order), for engines that boot a
file by name and cannot pass run.html?pages=... . usage: python3 tools/make_pages.py"""
import os, re

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mods = re.findall(r'"([\w-]+)"', re.search(r"MODULES\s*=\s*\[([^\]]*)\]", open(os.path.join(root, "bench", "modules.js"), encoding="utf-8").read()).group(1))

def page(name, title, modules):
    tags = "".join(f'    <script src="bench/{m}.js"></script>\n' for m in modules)
    lst = ", ".join(f'"{m}"' for m in modules)
    html = ('<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <title>h5bench: ' + title + '</title>\n</head>\n'
            '<body style="background:#111;color:#ddd;margin:0">\n    <script src="bench/harness.js"></script>\n'
            '    <script src="bench/boot.js"></script>\n    <script src="bench/modules.js"></script>\n' + tags +
            '    <script>window.addEventListener("load", () => H5B.run([' + lst + ']));</script>\n</body>\n</html>\n')
    with open(os.path.join(root, name + ".html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(html)

for m in mods:
    page(m, m, [m])
page("index", "all modules", mods)
print("pages:", ", ".join(mods), "+ index")
