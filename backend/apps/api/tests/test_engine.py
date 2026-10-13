from datetime import date

from app.models.common import GeoPoint, I18n
from app.models.itinerary import ItineraryParams
from app.models.site import CulturalSite
from app.services.itinerary_engine import MAX_STOPS_PER_DAY, ItineraryEngine


def mk(i: int, fee: int = 500, tags=(), type_="temple", lat_off: float = 0.0) -> CulturalSite:
    return CulturalSite(
        id=f"s{i}",
        slug=f"s{i}",
        name=I18n(en=f"Site {i}"),
        type=type_,
        tags=list(tags),
        region_id="kyoto",
        city_id="kyoto",
        location=GeoPoint(coordinates=(135.75, 35.0 + i * 0.01 + lat_off)),
        fee_jpy=fee,
        avg_duration_min=60,
        popularity=0.6,
    )


def planned_ids(itin) -> list[str]:
    return [st.site_id for d in itin.days for st in d.stops]


def test_basic_generation_respects_structure():
    engine = ItineraryEngine([mk(i) for i in range(8)])
    itin = engine.generate(ItineraryParams(budget_jpy=200_000, days=2, interests=["temple"]))
    ids = planned_ids(itin)
    assert len(itin.days) == 2
    assert ids and len(ids) == len(set(ids))
    assert all(len(d.stops) <= MAX_STOPS_PER_DAY for d in itin.days)
    assert itin.cost.total_jpy <= 200_000
    assert itin.cost.low_jpy <= itin.cost.total_jpy <= itin.cost.high_jpy


def test_budget_fitting_drops_expensive_stops():
    engine = ItineraryEngine([mk(i, fee=5000) for i in range(6)])
    itin = engine.generate(ItineraryParams(budget_jpy=40_000, days=2))
    assert itin.cost.total_jpy <= 40_000
    assert 0 < len(planned_ids(itin)) < 6


def test_pinned_site_is_never_dropped():
    engine = ItineraryEngine([mk(i, fee=5000) for i in range(6)])
    itin = engine.generate(ItineraryParams(budget_jpy=40_000, days=2, pinned_site_ids=["s5"]))
    assert "s5" in planned_ids(itin)


def test_unavailable_and_closed_sites_are_skipped():
    sites = [mk(i) for i in range(4)]
    sites[0].availability = "temporarily_unavailable"
    sites[1].closed_weekdays = [0]  # closed Mondays
    engine = ItineraryEngine(sites)
    monday = date(2026, 10, 5)
    itin = engine.generate(ItineraryParams(budget_jpy=200_000, days=1, start_date=monday))
    ids = planned_ids(itin)
    assert "s0" not in ids and "s1" not in ids


def test_rebuild_diff_reports_removed_site():
    engine = ItineraryEngine([mk(i) for i in range(8)])
    base = ItineraryParams(budget_jpy=200_000, days=2)
    first = engine.generate(base)
    victim = planned_ids(first)[0]
    second = engine.generate(base.model_copy(update={"excluded_site_ids": [victim]}))
    diff = ItineraryEngine.diff(first, second)
    assert victim in diff["removed"]