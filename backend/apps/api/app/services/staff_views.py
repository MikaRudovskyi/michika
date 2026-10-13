from collections.abc import Iterable

from app.models.itinerary import Itinerary


def summarize(it: Itinerary) -> dict[str, int]:
    """Numbers shown in the staff list of user routes."""
    return {
        "days": len(it.days),
        "stops": sum(len(d.stops) for d in it.days),
        "total_jpy": it.cost.total_jpy,
        "warnings": len(it.warnings),
    }


def removed_room_ids(old_ids: Iterable[str], new_ids: Iterable[str]) -> list[str]:
    """Room types that exist now but are missing from an updated room list."""
    keep = set(new_ids)
    return [i for i in old_ids if i not in keep]