import datetime as dt

from app.models.accommodation import Accommodation, RoomType, SeasonRule, default_policy
from app.models.booking import BookingStatus
from app.models.common import GeoPoint, I18n
from app.models.itinerary import ItineraryDay, Stop
from app.models.site import CulturalSite
from app.services.booking_policy import can_transition, refund_for
from app.services.pricing import nightly_price
from app.services.stay_engine import build_segments, lodging_by_night, recommend

TODAY = dt.date(2026, 10, 1)


def site(i: str, lat: float, lon: float) -> CulturalSite:
    return CulturalSite(
        id=i,
        slug=i,
        name=I18n(en=i),
        type="temple",
        region_id="r",
        city_id="c",
        location=GeoPoint(coordinates=(lon, lat)),
    )


def acc(i: str, lat: float, lon: float, price=10_000, count=2, weekend=1.0, seasons=None) -> Accommodation:
    return Accommodation(
        id=i,
        owner_id="m1",
        name=I18n(en=i),
        type="hotel",
        region_id="r",
        city_id="c",
        location=GeoPoint(coordinates=(lon, lat)),
        rooms=[RoomType(id="std", name=I18n(en="Standard"), capacity=2, base_price_jpy=price, count=count)],
        weekend_multiplier=weekend,
        seasons=seasons or [],
    )


def day(index: int, *site_ids: str) -> ItineraryDay:
    stops = [Stop(site_id=s, start_min=540 + 90 * k, end_min=600 + 90 * k) for k, s in enumerate(site_ids)]
    return ItineraryDay(index=index, stops=stops)


def segments():
    sites = {
        s.id: s
        for s in [
            site("k1", 35.00, 135.75),
            site("k2", 35.01, 135.76),
            site("k3", 35.02, 135.74),
            site("o1", 34.69, 135.50),  # ~40 km from Kyoto
        ]
    }
    days = [day(0, "k1"), day(1, "k2"), day(2, "k3"), day(3, "o1")]
    return build_segments(days, sites, dt.date(2026, 10, 5))


def test_nightly_price_applies_weekend_and_season():
    a = acc(
        "A", 35.0, 135.75, weekend=1.2,
        seasons=[SeasonRule(label="peak", date_from=dt.date(2026, 11, 20), date_to=dt.date(2026, 11, 25), multiplier=1.5)],
    )
    room = a.rooms[0]
    assert nightly_price(a, room, dt.date(2026, 10, 1)) == 10_000  # Thursday
    assert nightly_price(a, room, dt.date(2026, 10, 2)) == 12_000  # Friday
    assert nightly_price(a, room, dt.date(2026, 11, 22)) == 15_000  # Sunday inside the peak
    assert nightly_price(a, room, dt.date(2026, 11, 20)) == 18_000  # Friday inside the peak


def test_refund_follows_policy_tiers():
    policy = default_policy()  # 7 days: 100%, 3 days: 50%, 0 days: 0%
    total = 40_000
    assert refund_for(policy, dt.date(2026, 10, 11), TODAY, total) == (100, 40_000)
    assert refund_for(policy, dt.date(2026, 10, 6), TODAY, total) == (50, 20_000)
    assert refund_for(policy, dt.date(2026, 10, 2), TODAY, total) == (0, 0)
    assert refund_for(policy, dt.date(2026, 9, 30), TODAY, total) == (0, 0)  # already started
    assert refund_for(policy, dt.date(2026, 10, 2), TODAY, total, full=True) == (100, 40_000)


def test_booking_state_machine():
    assert can_transition(BookingStatus.pending, BookingStatus.confirmed)
    assert can_transition(BookingStatus.pending, BookingStatus.cancelled)
    assert can_transition(BookingStatus.confirmed, BookingStatus.completed)
    assert not can_transition(BookingStatus.pending, BookingStatus.completed)
    assert not can_transition(BookingStatus.cancelled, BookingStatus.confirmed)
    assert not can_transition(BookingStatus.completed, BookingStatus.cancelled)


def test_segments_group_nearby_nights_and_split_far_ones():
    segs = segments()
    assert [s.nights for s in segs] == [2, 1]
    assert (segs[0].check_in, segs[0].check_out) == (dt.date(2026, 10, 5), dt.date(2026, 10, 7))
    assert (segs[1].check_in, segs[1].check_out) == (dt.date(2026, 10, 7), dt.date(2026, 10, 8))


def test_recommend_filters_by_distance_and_availability():
    near = acc("A", 35.005, 135.755, price=10_000, count=1)
    far = acc("B", 34.69, 135.50)
    first = segments()[:1]

    recs = recommend(first, [near, far], guests=2, booked={})
    assert [o.accommodation_id for o in recs[0].options] == ["A"]
    assert recs[0].options[0].nightly_total_jpy == [10_000, 10_000]  # Mon + Tue
    assert lodging_by_night(recs) == {0: 10_000, 1: 10_000}

    full = recommend(first, [near], guests=2, booked={("A", "std", "2026-10-05"): 1})
    assert full[0].options == []