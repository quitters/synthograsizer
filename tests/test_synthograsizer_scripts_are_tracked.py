"""Every local <script src> and <link rel=stylesheet href> in the Synthograsizer pages must be a file the deploy actually has.

Why: the live site is built from git. A file that exists on a developer's disk but is gitignored (static/metadata-manager/ was) loads fine
locally and 404s on the live site, which showed up as "window.extractAIMetadataFromPNG is not a function" in the Metadata Reader.

Run with:  python -m pytest tests/test_synthograsizer_scripts_are_tracked.py -q
"""
import re
import subprocess
from pathlib import Path
from urllib.parse import urlsplit

import pytest

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "static" / "synthograsizer"
PAGES = ["index.html", "av.html", "demo.html"]


def local_assets(page):
    html = (APP / page).read_text(encoding="utf-8")
    html = re.sub(r"<!--.*?-->", "", html, flags=re.S)
    refs = re.findall(r"<script[^>]+\bsrc=\"([^\"]+)\"", html)
    refs += re.findall(r"<link[^>]+rel=\"stylesheet\"[^>]+href=\"([^\"]+)\"", html)
    out = []
    for ref in refs:
        parts = urlsplit(ref)
        if parts.scheme or parts.netloc or ref.startswith(("//", "data:", "/")):
            continue  # external, or served by the backend rather than from this folder
        out.append(parts.path)
    return out


def is_gitignored(path):
    r = subprocess.run(["git", "check-ignore", "-q", str(path)], cwd=ROOT)
    return r.returncode == 0


@pytest.mark.parametrize("page", PAGES)
def test_every_local_asset_exists_and_is_not_gitignored(page):
    problems = []
    for ref in local_assets(page):
        path = (APP / ref).resolve()
        if not path.exists():
            problems.append(f"{ref}: missing")
        elif is_gitignored(path):
            problems.append(f"{ref}: exists locally but is gitignored, so the live site will 404")
    assert not problems, f"{page}: " + "; ".join(problems)
