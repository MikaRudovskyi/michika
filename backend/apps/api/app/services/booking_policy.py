import datetime as dt

from app.models.accommodation import CancellationTier
from app.models.booking import BookingStatus

# pending -> confirmed -> (cancelled | completed); pending -> cancelled
ALLOWED: dict[BookingStatus, set[BookingStatus]] = {
    BookingStatus.pending: {BookingStatus.confirmed, BookingStatus.cancelled},
    BookingStatus.confirmed: {BookingStatus.cancelled, BookingStatus.completed},
    BookingStatus.cancelled: set(),
    BookingStatus.completed: set(),
}


def can_transition(current: BookingStatus, new: BookingStatus) -> bool:
    return new in ALLOWED[current]


def refund_for(
    policy: list[CancellationTier],
    check_in: dt.date,
    today: dt.date,
    total_jpy: int,
    *,
    full: bool = False,
) -> tuple[int, int]:
    """Returns (refund_pct, refund_jpy).

    `full=True` is used when the property cancels, or when the booking was never
    confirmed. Otherwise the tier with the largest `days_before` that is still
    satisfied applies; after check-in nothing is refunded.
    """
    if full:
        return 100, total_jpy
    days_until = (check_in - today).days
    pct = 0
    for tier in sorted(policy, key=lambda t: t.days_before, reverse=True):
        if days_until >= tier.days_before:
            pct = tier.refund_pct
            break
    return pct, total_jpy * pct // 100