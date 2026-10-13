"""Stay recommendation: pure functions, no I/O.

Night i is the night after day i. Its "anchor" is the midpoint between where day i
ends (last stop) and where day i+1 starts (first stop). Consecutive nights whose
anchors stay within MAX_SEGMENT_RADIUS_KM of the segment centre share one property,
so travellers are not moved between hotels every night. For each segment we rank
properties by proximity, price fit and rating, skipping anything without enough
free rooms on every night.
"""

import datetime as dt
import math
from collections.abc import Mapping, Sequence

from pydantic import BaseModel

from app.models.accommodation import Accommodation
from app.models.itinerary import ItineraryDay
from app.models.site import CulturalSite
from app.services.geo import LatLon, haversine_km
from app.services.pricing import nights_between, nightly_price

MAX_SEGMENT_RADIUS_KM = 15.0
MAX_STAY_DISTANCE_KM = 10.0
LODGING_SHARE = 0.4  # share of the total budget assumed for lodging when no cap is given


class StaySegment(BaseModel):
    first_night: int
    nights: int
    check_in: dt.date
    check_out: dt.date
    anchor: tuple[float, float]  # (lat, lon)


class StayOption(BaseModel):
    accommodation_id: str
    room_type_id: str
    name: str
    room_name: str
    type: str
    distance_km: float
    rooms: int
    nightly_total_jpy: list[int]  # all rooms, per night
    total_jpy: int
    free_rooms: int
    score: float


class StayRecommendation(BaseModel):
    segment: StaySegment
    options: list[StayOption]


def _centroid(points: Sequence[LatLon]) -> LatLon:
    return (
        sum(p[0] for p in points) / len(points),
        sum(p[1] for p in points) / len(points),
    )


def night_anchors(
    days: Sequence[ItineraryDay], sites: Mapping[str, CulturalSite]
) -> list[LatLon | None]:
    anchors: list[LatLon | None] = []
    for i in range(len(days) - 1):
        evening = [s for s in days[i].stops if s.site_id in sites]
        morning = [s for s in days[i + 1].stops if s.site_id in sites]
        points: list[LatLon] = []
        if evening:
            points.append(sites[evening[-1].site_id].latlon)
        if morning:
            points.append(sites[morning[0].site_id].latlon)
        anchors.append(_centroid(points) if points else None)
    return anchors


def build_segments(
    days: Sequence[ItineraryDay],
    sites: Mapping[str, CulturalSite],
    start_date: dt.date,
    max_radius_km: float = MAX_SEGMENT_RADIUS_KM,
) -> list[StaySegment]:
    anchors = night_anchors(days, sites)
    known = [i for i, a in enumerate(anchors) if a is not None]
    if not known:
        return []

    # Nights next to an empty day inherit the nearest known anchor.
    filled: list[LatLon] = []
    for i, a in enumerate(anchors):
        if a is None:
            nearest = min(known, key=lambda k, i=i: abs(k - i))
            a = anchors[nearest]
        assert a is not None
        filled.append(a)

    groups: list[list[int]] = []
    centers: list[LatLon] = []
    for i, a in enumerate(filled):
        if groups and haversine_km(centers[-1], a) <= max_radius_km:
            groups[-1].append(i)
            centers[-1] = _centroid([filled[k] for k in groups[-1]])
        else:
            groups.append([i])
            centers.append(a)

    return [
        StaySegment(
            first_night=g[0],
            nights=len(g),
            check_in=start_date + dt.timedelta(days=g[0]),
            check_out=start_date + dt.timedelta(days=g[-1] + 1),
            anchor=c,
        )
        for g, c in zip(groups, centers)
    ]


def default_nightly_budget(total_budget_jpy: int, nights: int, rooms: int) -> int | None:
    if nights <= 0:
        return None
    return int(total_budget_jpy * LODGING_SHARE / nights / max(1, rooms))


def _score(distance_km: float, avg_room_jpy: float, rating: float, budget: int | None) -> float:
    proximity = 1 - min(distance_km, MAX_STAY_DISTANCE_KM) / MAX_STAY_DISTANCE_KM
    if budget:
        ratio = avg_room_jpy / budget
        price_fit = 1.0 if ratio <= 1 else max(0.0, 1 - (ratio - 1))
    else:
        price_fit = 0.5
    return round(0.45 * proximity + 0.35 * price_fit + 0.20 * rating / 5, 4)


def recommend(
    segments: Sequence[StaySegment],
    accommodations: Sequence[Accommodation],
    *,
    guests: int,
    booked: Mapping[tuple[str, str, str], int],
    lang: str = "en",
    nightly_budget_jpy: int | None = None,
    limit: int = 3,
) -> list[StayRecommendation]:
    """`booked` maps (accommodation_id, room_type_id, 'YYYY-MM-DD') -> rooms already taken."""
    result: list[StayRecommendation] = []
    for seg in segments:
        nights = nights_between(seg.check_in, seg.check_out)
        options: list[StayOption] = []

        for acc in accommodations:
            if acc.status != "active":
                continue
            distance = haversine_km(seg.anchor, acc.location.latlon)
            if distance > MAX_STAY_DISTANCE_KM:
                continue

            best: StayOption | None = None
            for room in acc.rooms:
                rooms = math.ceil(guests / room.capacity)
                free = min(
                    room.count - booked.get((acc.id, room.id, n.isoformat()), 0) for n in nights
                )
                if rooms > free:
                    continue
                totals = [nightly_price(acc, room, n) * rooms for n in nights]
                avg_room = sum(totals) / len(totals) / rooms
                option = StayOption(
                    accommodation_id=acc.id,
                    room_type_id=room.id,
                    name=acc.name.get(lang),
                    room_name=room.name.get(lang),
                    type=acc.type,
                    distance_km=round(distance, 2),
                    rooms=rooms,
                    nightly_total_jpy=totals,
                    total_jpy=sum(totals),
                    free_rooms=free,
                    score=_score(distance, avg_room, acc.rating, nightly_budget_jpy),
                )
                if best is None or option.score > best.score:
                    best = option
            if best:
                options.append(best)

        options.sort(key=lambda o: o.score, reverse=True)
        result.append(StayRecommendation(segment=seg, options=options[:limit]))
    return result


def lodging_by_night(recs: Sequence[StayRecommendation]) -> dict[int, int]:
    """Night index -> total price, taking the top option of each segment.
    Feeds `compute_costs(lodging_by_night=...)` so the estimate uses real quotes."""
    out: dict[int, int] = {}
    for rec in recs:
        if rec.options:
            for k, price in enumerate(rec.options[0].nightly_total_jpy):
                out[rec.segment.first_night + k] = price
    return out