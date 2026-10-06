"""Audit the licences of the Commons archive pieces against what the wall promises.

Reads backend/service/thecommons_data/archive/*.json (read-only) and flags the
pieces that need a human decision before the Commons is shown to the public:

  share-alike   BY-SA / BY-NC-SA: an adaptation must be shared under the same
                licence. The wall adds controls to the artist's code, which is
                an adaptation.
  old-version   Pre-4.0 licences (2.0, 3.0): moral-rights wording is weaker and
                the legal code differs by jurisdiction.
  version-assumed
                The artist's recorded text names no version (e.g. "CC BY") but
                the loader normalised it to 4.0. That is a guess.
  free-text     The artist's licence text is a sentence rather than a licence
                name, so the normalised name is the loader's reading of it.
  public-domain CC0: nothing is owed, but the credit is still shown.

Exit status is 0 whatever is found: this is a report, not a gate.

    python scripts/commons_license_audit.py            # table
    python scripts/commons_license_audit.py --markdown # for docs/
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

ARCHIVE = Path(__file__).resolve().parent.parent / "backend" / "service" / "thecommons_data" / "archive"
_VERSION = re.compile(r"\b(\d\.\d)\b")


def flags(lic: dict) -> list:
    name, text = lic.get("name", ""), lic.get("text", "")
    out = []
    if "-SA" in name:
        out.append("share-alike")
    if name.startswith("CC0"):
        out.append("public-domain")
        return out
    version = _VERSION.search(name)
    if version and version.group(1) != "4.0":
        out.append("old-version")
    if not _VERSION.search(text):
        out.append("version-assumed" if len(text) <= 25 else "free-text")
    elif len(text) > 25:
        out.append("free-text")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--markdown", action="store_true")
    args = ap.parse_args()

    rows, counts = [], Counter()
    for path in sorted(ARCHIVE.glob("*.json")):
        credit = json.loads(path.read_text(encoding="utf8")).get("credit", {})
        lic = credit.get("license", {})
        counts[lic.get("name", "?")] += 1
        fl = flags(lic)
        if fl:
            rows.append((path.stem, credit.get("artist", "?"), lic.get("name", "?"), lic.get("text", ""), fl))

    total = sum(counts.values())
    print(f"{total} pieces. Licences: " + ", ".join(f"{n} x{c}" for n, c in counts.most_common()))
    by_flag = Counter(f for r in rows for f in r[4])
    print("Flags: " + (", ".join(f"{f} x{c}" for f, c in by_flag.most_common()) or "none"))
    print()

    if args.markdown:
        print("| piece | artist | licence | recorded text | flags |\n|---|---|---|---|---|")
        for slug, artist, name, text, fl in rows:
            short = (text[:60] + "...") if len(text) > 60 else text
            print(f"| {slug} | {artist} | {name} | {short.replace('|', '/')} | {', '.join(fl)} |")
    else:
        for slug, artist, name, text, fl in rows:
            print(f"{slug:40} {artist[:24]:24} {name:16} {', '.join(fl)}")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
