import math
from collections.abc import Sequence
from datetime import date, timedelta
from statistics import fmean

from pydantic import BaseModel

from app.models.site import CulturalSite
from app.services.climate import MonthlyClimate, comfort, weather_fit
from app.services.context import SnapshotContext
from app.services.crowds import crowd_adjustment


class MonthScore(BaseModel):
    month: int
    crowd: float
    comfort: float
    score: float  # 0..1, higher = fewer people and nicer weather


class HourScore(BaseModel):
    hour: int
    crowd: float


class StartOption(BaseModel):
    start: date
    end: date
    score: float  # 0..100
    crowd: float
    weather: float
    closures: int
    reasons: list[str]


def site_months(site: CulturalSite, normals: Sequence[MonthlyClimate]) -> list[MonthScore]:
    out: list[MonthScore] = []
    for m in range(1, 13):
        crowd = site.crowd.by_month[m - 1]
        n = normals[m - 1]
        fit = weather_fit(comfort(n.mean_temp_c, n.wet_ratio), site.indoor)
        out.append(
            MonthScore(
                month=m,
                crowd=round(crowd, 3),
                comfort=round(fit, 3),
                score=round(0.55 * (1 - crowd) + 0.45 * fit, 3),
            )
        )
    return out


def top_months(scores: Sequence[MonthScore], n: int = 3) -> list[int]:
    return [s.month for s in sorted(scores, key=lambda s: (-s.score, s.month))[:n]]


def best_hours(site: CulturalSite, limit: int = 3) -> list[HourScore]:
    """Quietest hours to arrive, keeping enough time before closing for a typical visit."""
    last_start = max(site.open_hour, math.floor(site.close_hour - site.avg_duration_min / 60))
    hours = list(range(site.open_hour, min(24, last_start + 1)))
    ranked = sorted(hours, key=lambda h: (site.crowd.by_hour[h], h))[:limit]
    return [HourScore(hour=h, crowd=round(site.crowd.by_hour[h], 3)) for h in ranked]


def score_starts(
    plan: Sequence[Sequence[CulturalSite]],
    candidates: Sequence[date],
    ctx: SnapshotContext,
    *,
    top: int = 5,
    min_gap: int = 5,
) -> list[StartOption]:
    """Rate each possible start date for the same day-by-day plan.

    A site that is closed on its weekday counts against the date; open sites contribute
    their crowd level and weather comfort for the day they would be visited. Results are
    spread out: no two suggestions start less than `min_gap` days apart.
    """
    options: list[StartOption] = []
    for start in candidates:
        crowds: list[float] = []
        fits: list[float] = []
        closures = 0
        total = 0
        for i, sites in enumerate(plan):
            day = start + timedelta(days=i)
            for site in sites:
                total += 1
                if day.weekday() in site.closed_weekdays:
                    closures += 1
                    continue
                crowds.append(ctx.crowd_on(site, day))
                fits.append(ctx.fit_on(site, day))
        if total == 0:
            continue

        crowd = fmean(crowds) if crowds else 1.0
        fit = fmean(fits) if fits else 0.0
        open_share = (total - closures) / total
        score = round(100 * (0.5 * (1 - crowd) + 0.5 * fit) * open_share, 1)

        peak = any(crowd_adjustment(start + timedelta(days=i)) >= 0.15 for i in range(len(plan)))
        reasons: list[str] = []
        if crowd < 0.45:
            reasons.append("low_crowds")
        elif crowd > 0.7:
            reasons.append("busy_season")
        if fit >= 0.8:
            reasons.append("mild_weather")
        elif fit < 0.5:
            reasons.append("rain_risk")
        if closures:
            reasons.append("closures")
        if peak:
            reasons.append("peak_holiday")

        options.append(
            StartOption(
                start=start,
                end=start + timedelta(days=max(0, len(plan) - 1)),
                score=score,
                crowd=round(crowd, 3),
                weather=round(fit, 3),
                closures=closures,
                reasons=reasons,
            )
        )

    options.sort(key=lambda o: (-o.score, o.start))
    picked: list[StartOption] = []
    for option in options:
        if all(abs((option.start - p.start).days) >= min_gap for p in picked):
            picked.append(option)
        if len(picked) == top:
            break
    return picked