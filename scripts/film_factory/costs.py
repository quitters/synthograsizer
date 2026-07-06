"""Cost estimation + budget governor.

Rates are ESTIMATES for ledger/budget purposes — the authoritative spend is
the AI Studio billing dashboard. Update RATES when Google reprices.
"""
import datetime


class BudgetExceeded(Exception):
    pass


# model -> (usd per unit, unit kind)
RATES = {
    "veo-3.1-generate-preview": (0.40, "sec"),
    "veo-3.1-fast-generate-preview": (0.15, "sec"),
    "gemini-3-pro-image-preview": (0.15, "image"),
    "gemini-3.1-flash-image-preview": (0.05, "image"),
    "gemini-2.5-flash-image": (0.04, "image"),
    # text calls: flat per-call estimates (they are rounding errors here)
    "gemini-3.1-pro-preview": (0.05, "call"),
    "gemini-3-flash-preview": (0.005, "call"),
}


def estimate(model: str, units: float) -> float:
    rate, _kind = RATES.get(model, (0.01, "call"))
    return round(rate * units, 4)


def charge(db, stage: str, item: str, model: str, units: float) -> float:
    usd = estimate(model, units)
    kind = RATES.get(model, (0, "call"))[1]
    db.exec(
        "INSERT INTO ledger (ts, stage, item, model, units, unit_kind, usd) "
        "VALUES (?,?,?,?,?,?,?)",
        (datetime.datetime.now().isoformat(timespec="seconds"),
         stage, item, model, units, kind, usd),
    )
    return usd


def spent(db) -> float:
    row = db.fetchone("SELECT COALESCE(SUM(usd), 0) FROM ledger")
    return round(row[0], 2)


def budget(db) -> float:
    return float(db.get_meta("budget_usd", "4500"))


def assert_budget(db, about_to_spend: float = 0.0):
    total = spent(db) + about_to_spend
    cap = budget(db)
    if total > cap:
        raise BudgetExceeded(
            f"Budget cap ${cap:.2f} would be exceeded (spent ${spent(db):.2f}, "
            f"next call ~${about_to_spend:.2f}). Raise with: "
            f"python -m scripts.film_factory budget --set <usd>")


def by_stage(db):
    return db.fetchall(
        "SELECT stage, COUNT(*), ROUND(SUM(usd),2) FROM ledger GROUP BY stage ORDER BY 3 DESC")
