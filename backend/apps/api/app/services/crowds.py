from datetime import date


def crowd_adjustment(day: date) -> float:
    """Extra crowding on weekends and on Japan's peak travel weeks.

    A fixed-date approximation: Golden Week (Apr 29 - May 5), Obon (Aug 13-16) and the
    New Year break (Dec 29 - Jan 3). Moving holidays such as Silver Week are not covered.
    """
    bump = 0.0
    if day.weekday() >= 5:
        bump += 0.08
    md = (day.month, day.day)
    if (4, 29) <= md <= (5, 5) or (8, 13) <= md <= (8, 16) or md >= (12, 29) or md <= (1, 3):
        bump += 0.15
    return bump