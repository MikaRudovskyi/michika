import datetime as dt

import pytest

from app.models.common import GeoPoint, I18n
from app.models.itinerary import CostBreakdown, Itinerary, ItineraryDay, ItineraryParams, Stop
from app.models.site import CrowdProfile, CulturalSite
from app.services.alerts import is_disruption
from app.services.best_time import best_hours, score_starts, site_months, top_months
from app.services.climate import FALLBACK_NORMALS, DayWeather, comfort, monthly_normals, temp_comfort
from app.services.compare import metrics_for, pick_best
from app.services.context import SnapshotContext
from app.services.crowds import crowd_adjustment


def make_site(
    sid="a", *, month_crowd=None, hour_crowd=None, indoor=False, closed=(), open_h=9, close_h=17, minutes=60
) -> CulturalSite:
    return CulturalSite(
        id=sid,
        slug=f"site-{sid}",
        name=I18n(en=sid),
        type="temple",
        region_id="kansai",
        city_id="kyoto",
        location=GeoPoint(coordinates=(135.75, 35.0)),
        avg_duration_min=minutes,
        open_hour=open_h,
        close_hour=close_h,
        closed_weekdays=list(closed),
        indoor=indoor,
        crowd=CrowdProfile(by_month=month_crowd or [0.5] * 12, by_hour=hour_crowd or [0.5] * 24),
    )


# ------------------------------- climate -------------------------------- #
def test_temp_comfort_is_flat_in_the_mild_range_and_zero_at_extremes():
    assert temp_comfort(18) == 1.0
    assert temp_comfort(-2) == 0.0
    assert temp_comfort(36) == 0.0
    assert temp_comfort(30) < temp_comfort(26) < 1.0


def test_rain_lowers_comfort():
    assert comfort(18, 0.0) > comfort(18, 0.8)


def test_monthly_normals_average_and_fall_back_for_missing_months():
    rows = [(dt.date(2023, 1, 1), 2.0, 0.0), (dt.date(2023, 1, 2), 4.0, 3.0)]
    normals = monthly_normals(rows)
    assert (normals[0].mean_temp_c, normals[0].wet_ratio) == (3.0, 0.5)
    assert normals[1] == FALLBACK_NORMALS[1]


def test_weekends_and_peak_weeks_are_busier():
    assert crowd_adjustment(dt.date(2026, 10, 5)) == 0  # Monday
    assert crowd_adjustment(dt.date(2026, 10, 3)) == pytest.approx(0.08)  # Saturday
    assert crowd_adjustment(dt.date(2026, 5, 3)) == pytest.approx(0.23)  # Sunday in Golden Week


# -------------------------------- context ------------------------------- #
def test_forecast_beats_normals_and_indoor_sites_care_less_about_rain():
    day = dt.date(2026, 10, 6)
    rainy = DayWeather(day, 18, 12, 90, 12.0, 63)
    ctx = SnapshotContext({"out": {day: rainy}, "in": {day: rainy}})
    outdoor = make_site("out")
    indoor = make_site("in", indoor=True)
    assert ctx.fit_on(indoor, day) > ctx.fit_on(outdoor, day)


# ------------------------------- best time ------------------------------ #
def test_quiet_month_wins_when_the_rest_are_crowded():
    crowd = [0.9] * 12
    crowd[10] = 0.1  # November
    months = site_months(make_site(month_crowd=crowd), FALLBACK_NORMALS)
    assert top_months(months, 1) == [11]


def test_best_hours_are_the_quietest_ones_within_opening_hours():
    hours = [0.9] * 24
    hours[10], hours[15] = 0.1, 0.2
    site = make_site(hour_crowd=hours, open_h=9, close_h=17, minutes=60)
    assert [h.hour for h in best_hours(site, 2)] == [10, 15]


def test_start_dates_prefer_quiet_seasons():
    crowd = [0.9] * 12
    crowd[10] = 0.1
    site = make_site(month_crowd=crowd)
    options = score_starts(
        [[site]], [dt.date(2026, 3, 10), dt.date(2026, 11, 10)], SnapshotContext(), top=2, min_gap=1
    )
    assert options[0].start == dt.date(2026, 11, 10)


def test_closed_weekday_counts_against_a_date():
    site = make_site(closed=[0])  # closed on Mondays
    monday, tuesday = dt.date(2026, 11, 9), dt.date(2026, 11, 10)
    options = score_starts([[site]], [monday, tuesday], SnapshotContext(), top=2, min_gap=1)
    assert options[0].start == tuesday
    closed = next(o for o in options if o.start == monday)
    assert closed.closures == 1 and "closures" in closed.reasons


def test_suggestions_are_spread_out():
    start = dt.date(2026, 11, 1)
    candidates = [start + dt.timedelta(days=i) for i in range(10)]
    picks = score_starts([[make_site()]], candidates, SnapshotContext(), top=3, min_gap=5)
    for i, a in enumerate(picks):
        for b in picks[i + 1 :]:
            assert abs((a.start - b.start).days) >= 5


# -------------------------------- compare ------------------------------- #
def route(rid, total, stops, transfer=0):
    return Itinerary(
        id=rid,
        params=ItineraryParams(budget_jpy=100_000, days=2, travelers=2),
        days=[ItineraryDay(index=0, stops=stops, transfer_min=transfer), ItineraryDay(index=1)],
        cost=CostBreakdown(total_jpy=total, per_person_jpy=total // 2),
        warnings=[],
    )


def test_metrics_and_winners():
    busy = route(
        "r1",
        60_000,
        [
            Stop(site_id="a", start_min=540, end_min=600, crowd=0.4),
            Stop(site_id="b", start_min=620, end_min=680, transit_min=20, crowd=0.6),
        ],
        transfer=15,
    )
    simple = route("r2", 45_000, [Stop(site_id="a", start_min=540, end_min=600, crowd=0.3)])

    m1 = metrics_for(busy)
    assert (m1.stops, m1.activity_min, m1.transit_min, m1.avg_crowd) == (2, 120, 35, 0.5)
    assert (m1.budget_used_pct, m1.within_budget, m1.per_day_jpy) == (60, True, 30_000)

    best = pick_best([m1, metrics_for(simple)])
    assert best == {"cheapest": "r2", "most_sites": "r1", "fewest_transit": "r2", "quietest": "r2"}


def test_identical_routes_have_no_winner():
    stops = [Stop(site_id="a", start_min=540, end_min=600)]
    assert pick_best([metrics_for(route("r1", 50_000, stops)), metrics_for(route("r2", 50_000, stops))]) == {}


# --------------------------------- alerts ------------------------------- #
def test_only_troubled_lines_are_reported():
    normal = {"odpt:trainInformationText": {"ja": "現在、平常通り運転しています。", "en": "Operating normally."}}
    delayed = {
        "odpt:trainInformationStatus": {"ja": "遅延", "en": "Delay"},
        "odpt:trainInformationText": {"ja": "信号トラブルのため遅れ", "en": "Delays due to signal trouble"},
    }
    assert not is_disruption(normal)
    assert is_disruption(delayed)
    assert not is_disruption({})