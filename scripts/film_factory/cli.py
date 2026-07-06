"""Film Factory CLI.

  python -m scripts.film_factory develop   [--project-dir D]
  python -m scripts.film_factory bible     [--only-failed]
  python -m scripts.film_factory keyframes [--concurrency 3] [--limit N]
  python -m scripts.film_factory render    [--concurrency 3] [--max-takes 2]
                                           [--limit N] [--shots id,id]
                                           [--qc-threshold 6.0] [--fast]
  python -m scripts.film_factory assemble  [--version v1]
  python -m scripts.film_factory status
  python -m scripts.film_factory budget    [--set 4500]

Stop a running farm gracefully: create a file named STOP in the project dir.
"""
import argparse
import json
import logging
import sys
from pathlib import Path

DEFAULT_PROJECT = Path(r"D:\Synthograsizer_Films\art_olympics")


def _setup_logging(project_dir: Path):
    project_dir.mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s",
                            "%H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    fh = logging.FileHandler(project_dir / "film.log", encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    root.addHandler(fh)
    root.addHandler(sh)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("google_genai").setLevel(logging.WARNING)


def status(db):
    from . import costs
    film = db.film()
    print(f"\nFILM: {film.get('title', '(not developed yet)')}")
    print(f"      {film.get('logline', '')}")
    n_assets = db.fetchall("SELECT kind, status, COUNT(*) FROM assets GROUP BY 1,2")
    if n_assets:
        print("\nBIBLE:", "  ".join(f"{k}/{s}={c}" for k, s, c in n_assets))
    rows = db.fetchall("SELECT status, COUNT(*) FROM shots GROUP BY 1")
    kf = db.fetchall("SELECT keyframe_status, COUNT(*) FROM shots "
                     "WHERE needs_keyframe=1 GROUP BY 1")
    total = db.fetchone("SELECT COUNT(*) FROM shots")[0]
    print(f"\nSHOTS ({total} total, {total * 8 // 60}:{total * 8 % 60:02d} runtime):")
    print("  status:   ", "  ".join(f"{s}={c}" for s, c in rows) or "-")
    print("  keyframes:", "  ".join(f"{s}={c}" for s, c in kf) or "-")
    takes = db.fetchall("SELECT status, COUNT(*), ROUND(AVG(qc_score),1) "
                        "FROM takes GROUP BY 1")
    if takes:
        print("  takes:    ", "  ".join(f"{s}={c} (avg qc {q})" for s, c, q in takes))
    print(f"\nSPEND (estimates - AI Studio dashboard is authoritative):")
    for stage, n, usd in costs.by_stage(db):
        print(f"  {stage:<10} {n:>5} calls  ${usd}")
    print(f"  TOTAL ${costs.spent(db):.2f} of ${costs.budget(db):.2f} budget\n")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="film_factory")
    ap.add_argument("command", choices=["develop", "bible", "keyframes", "render",
                                        "assemble", "status", "budget", "restyle",
                                        "tapeify", "extend"])
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--count", type=int, default=5, help="extend: how many new shots")
    ap.add_argument("--direction", type=str, default=None,
                    help="restyle: new visual direction brief")
    ap.add_argument("--brief", type=str, default="art_olympics",
                    help="develop: brief module name (brief_<name>.py)")
    ap.add_argument("--crop43", action="store_true",
                    help="assemble: center-crop to 4:3")
    ap.add_argument("--tape", action="store_true",
                    help="assemble: use tapeify/ processed clips")
    ap.add_argument("--preset", type=str, default=None,
                    help="tapeify: signal-path preset (default: project meta)")
    ap.add_argument("--project-dir", type=Path, default=DEFAULT_PROJECT)
    ap.add_argument("--concurrency", type=int, default=3)
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--shots", type=str, default=None, help="comma-separated shot ids")
    ap.add_argument("--max-takes", type=int, default=2)
    ap.add_argument("--qc-threshold", type=float, default=6.0)
    ap.add_argument("--only-failed", action="store_true")
    ap.add_argument("--fast", action="store_true", help="render on Veo 3.1 Fast")
    ap.add_argument("--version", type=str, default="v1")
    ap.add_argument("--set", dest="set_value", type=float, default=None)
    args = ap.parse_args(argv)

    _setup_logging(args.project_dir)
    from . import bootstrap
    ai = bootstrap(args.project_dir)
    from .db import DB
    db = DB(args.project_dir)

    if args.command == "status":
        status(db)
    elif args.command == "budget":
        if args.set_value is not None:
            db.set_meta("budget_usd", args.set_value)
        from . import costs
        print(f"budget: ${costs.budget(db):.2f}  spent: ${costs.spent(db):.2f}")
    elif args.command == "develop":
        from . import briefs, develop
        develop.run(ai, db, briefs.load(args.brief))
    elif args.command == "extend":
        from . import briefs, develop
        develop.extend(ai, db, briefs.load(args.brief), args.count,
                       args.direction or "")
    elif args.command == "bible":
        from . import bible
        bible.run(ai, db, only_failed=args.only_failed)
    elif args.command == "keyframes":
        from . import keyframes
        keyframes.run(ai, db, concurrency=args.concurrency, limit=args.limit,
                      only_failed=args.only_failed)
    elif args.command == "render":
        from . import render
        model = ("veo-3.1-fast-generate-preview" if args.fast else render.MODEL)
        shot_ids = args.shots.split(",") if args.shots else None
        render.run(ai, db, concurrency=args.concurrency, max_takes=args.max_takes,
                   qc_threshold=args.qc_threshold, limit=args.limit,
                   shot_ids=shot_ids, model=model)
    elif args.command == "assemble":
        from . import assemble
        assemble.run(ai, db, version=args.version, crop43=args.crop43,
                     tape=args.tape)
    elif args.command == "restyle":
        if not args.direction:
            ap.error("restyle requires --direction")
        from . import restyle
        restyle.run(ai, db, direction=args.direction)
    elif args.command == "tapeify":
        from . import tapeify
        shot_ids = args.shots.split(",") if args.shots else None
        tapeify.run(ai, db, concurrency=args.concurrency, shot_ids=shot_ids,
                    force=args.force, preset=args.preset)


if __name__ == "__main__":
    main()
