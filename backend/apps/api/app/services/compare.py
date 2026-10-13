import datetime as dt
from statistics import fmean

from pydantic import BaseModel

from app.models.itinerary import Itinerary


class RouteMetrics(BaseModel):
    id: str
    days: int
    stops: int
    travelers: int
    start_date: dt.date | None = None
    version: int
    total_jpy: int
    per_person_jpy: int
    per_day_jpy: int
    budget_jpy: int
    budget_used_pct: int
    within_budget: bool
    entry_fees_jpy: int
    transport_jpy: int
    lodging_jpy: int
    extras_jpy: int
    activity_min: int  # time spent at the sites
    transit_min: int  # time spent travelling
    avg_crowd: float
    warnings: int
    site_ids: list[str]


def metrics_for(it: Itinerary) -> RouteMetrics:
    stops = [s for d in it.days for s in d.stops]
    cost = it.cost
    budget = it.params.budget_jpy
    return RouteMetrics(
        id=it.id or "",
        days=len(it.days),
        stops=len(stops),
        travelers=it.params.travelers,
        start_date=it.params.start_date,
        version=it.version,
        total_jpy=cost.total_jpy,
        per_person_jpy=cost.per_person_jpy,
        per_day_jpy=cost.total_jpy // max(1, len(it.days)),
        budget_jpy=budget,
        budget_used_pct=round(100 * cost.total_jpy / budget) if budget else 0,
        within_budget=cost.total_jpy <= budget,
        entry_fees_jpy=cost.entry_fees_jpy,
        transport_jpy=cost.transport_jpy,
        lodging_jpy=cost.lodging_jpy,
        extras_jpy=cost.extras_jpy,
        activity_min=sum(s.end_min - s.start_min for s in stops),
        transit_min=sum(s.transit_min for s in stops) + sum(d.transfer_min for d in it.days),
        avg_crowd=round(fmean(s.crowd for s in stops), 3) if stops else 0.0,
        warnings=len(it.warnings),
        site_ids=[s.site_id for s in stops],
    )


def pick_best(routes: list[RouteMetrics]) -> dict[str, str]:
    """Which route wins each criterion. A criterion where every route is equal has no winner."""
    best: dict[str, str] = {}

    def add(name: str, key, *, lowest: bool, only: list[RouteMetrics] | None = None) -> None:
        pool = only if only is not None else routes
        if len(pool) < 2 or len({key(r) for r in pool}) < 2:
            return
        chosen = min(pool, key=key) if lowest else max(pool, key=key)
        best[name] = chosen.id

    add("cheapest", lambda r: r.total_jpy, lowest=True)
    add("most_sites", lambda r: r.stops, lowest=False)
    add("fewest_transit", lambda r: r.transit_min, lowest=True)
    add("quietest", lambda r: r.avg_crowd, lowest=True, only=[r for r in routes if r.stops])
    return best