import datetime as dt
import math

from app.models.accommodation import Accommodation, RoomType

MAX_NIGHTS = 30


def nights_between(check_in: dt.date, check_out: dt.date) -> list[dt.date]:
    return [check_in + dt.timedelta(days=i) for i in range((check_out - check_in).days)]


def validated_nights(check_in: dt.date, check_out: dt.date, today: dt.date) -> list[dt.date]:
    """Raises ValueError with a user-facing message for invalid stay dates."""
    if check_in < today:
        raise ValueError("check_in is in the past")
    n = (check_out - check_in).days
    if n < 1:
        raise ValueError("check_out must be after check_in")
    if n > MAX_NIGHTS:
        raise ValueError(f"Maximum stay is {MAX_NIGHTS} nights")
    return nights_between(check_in, check_out)


def rooms_needed(guests: int, room: RoomType) -> int:
    return math.ceil(guests / room.capacity)


def nightly_price(acc: Accommodation, room: RoomType, night: dt.date) -> int:
    """Price of one room for the given night, rounded to 100 yen.

    Season rules: the highest matching multiplier wins. Friday and Saturday nights
    additionally get `weekend_multiplier`.
    """
    multiplier = max(
        (r.multiplier for r in acc.seasons if r.date_from <= night <= r.date_to),
        default=1.0,
    )
    if night.weekday() in (4, 5):
        multiplier *= acc.weekend_multiplier
    return max(100, int(round(room.base_price_jpy * multiplier, -2)))


def quote(
    acc: Accommodation, room: RoomType, check_in: dt.date, check_out: dt.date, rooms: int
) -> list[int]:
    """Total price per night for all rooms."""
    return [nightly_price(acc, room, n) * rooms for n in nights_between(check_in, check_out)]