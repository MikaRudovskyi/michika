import math

from app.models.itinerary import CostBreakdown, DayCost, ItineraryDay

DEFAULT_NIGHTLY_ROOM_JPY = 15_000
DEFAULT_EXTRAS_PER_PERSON_DAY = 6_000  # meals, snacks, small purchases


def compute_costs(
    days: list[ItineraryDay],
    *,
    travelers: int,
    nightly_room_jpy: int | None = None,
    extras_per_person_day_jpy: int = DEFAULT_EXTRAS_PER_PERSON_DAY,
    lodging_by_night: dict[int, int] | None = None,
) -> CostBreakdown:
    """Pure function: entry fees + transport + lodging + extras.

    - Entry fees and transport are stored per person on stops/days and scaled here.
    - Lodging is per room (2 travelers per room); `lodging_by_night` maps
      night index -> total price for all rooms (e.g. a real booking quote).
    - Nights = days - 1: the last day has no lodging.
    """
    rooms = math.ceil(travelers / 2)
    nightly = (nightly_room_jpy if nightly_room_jpy is not None else DEFAULT_NIGHTLY_ROOM_JPY) * rooms
    last_index = len(days) - 1
    lodging_by_night = lodging_by_night or {}

    per_day: list[DayCost] = []
    for day in days:
        entry = sum(s.entry_fee_jpy for s in day.stops) * travelers
        transport = (sum(s.transit_cost_jpy for s in day.stops) + day.transfer_cost_jpy) * travelers
        lodging = 0 if day.index == last_index else lodging_by_night.get(day.index, nightly)
        extras = extras_per_person_day_jpy * travelers
        per_day.append(
            DayCost(
                day_index=day.index,
                entry_fees_jpy=entry,
                transport_jpy=transport,
                lodging_jpy=lodging,
                extras_jpy=extras,
                total_jpy=entry + transport + lodging + extras,
            )
        )

    entry = sum(d.entry_fees_jpy for d in per_day)
    transport = sum(d.transport_jpy for d in per_day)
    lodging = sum(d.lodging_jpy for d in per_day)
    extras = sum(d.extras_jpy for d in per_day)
    total = entry + transport + lodging + extras

    # Confidence band: fees and lodging are fairly stable, transport and extras are not.
    fixed = entry + lodging
    variable = transport + extras
    return CostBreakdown(
        entry_fees_jpy=entry,
        transport_jpy=transport,
        lodging_jpy=lodging,
        extras_jpy=extras,
        total_jpy=total,
        per_person_jpy=math.ceil(total / max(1, travelers)),
        low_jpy=int(fixed * 0.95 + variable * 0.85),
        high_jpy=int(fixed * 1.05 + variable * 1.25),
        per_day=per_day,
    )