from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class MonthlyClimate:
    month: int  # 1-12
    mean_temp_c: float
    wet_ratio: float  # share of days with at least 1 mm of precipitation, 0..1


@dataclass(frozen=True)
class DayWeather:
    day: date
    temp_max_c: float
    temp_min_c: float
    precip_prob: float | None  # percent, 0..100
    precip_mm: float
    code: int | None  # WMO weather code

    @property
    def mean_temp(self) -> float:
        return (self.temp_max_c + self.temp_min_c) / 2

    @property
    def rain_chance(self) -> float:
        if self.precip_prob is not None:
            return min(1.0, max(0.0, self.precip_prob / 100))
        return min(1.0, self.precip_mm / 8)


# Rounded long-term averages for Kyoto and Osaka (approximate). Used only when the
# archive API is unreachable, so the app keeps working offline.
_TEMPS = [4.9, 5.5, 8.9, 14.5, 19.1, 23.0, 27.0, 28.0, 23.8, 17.7, 12.0, 7.2]
_WET = [0.26, 0.32, 0.35, 0.36, 0.36, 0.43, 0.39, 0.30, 0.39, 0.30, 0.28, 0.25]
FALLBACK_NORMALS = [MonthlyClimate(m + 1, _TEMPS[m], _WET[m]) for m in range(12)]


def temp_comfort(temp_c: float) -> float:
    """1.0 between 14 and 24 degrees, falling to 0 at -2 and 36."""
    if temp_c < 14:
        return max(0.0, 1 - (14 - temp_c) / 16)
    if temp_c > 24:
        return max(0.0, 1 - (temp_c - 24) / 12)
    return 1.0


def comfort(temp_c: float, rain_chance: float) -> float:
    """How pleasant a day is for sightseeing, 0..1."""
    rain = min(1.0, max(0.0, rain_chance))
    return round(temp_comfort(temp_c) * (1 - 0.6 * rain), 4)


def weather_fit(raw_comfort: float, indoor: bool) -> float:
    """Indoor attractions care less about the weather."""
    return 0.5 + 0.5 * raw_comfort if indoor else raw_comfort


def monthly_normals(rows: Iterable[tuple[date, float | None, float | None]]) -> list[MonthlyClimate]:
    """Daily (date, mean temperature, precipitation mm) -> twelve monthly normals."""
    temps: dict[int, list[float]] = {m: [] for m in range(1, 13)}
    wet: dict[int, list[bool]] = {m: [] for m in range(1, 13)}
    for day, temp, precip in rows:
        if temp is not None:
            temps[day.month].append(temp)
        if precip is not None:
            wet[day.month].append(precip >= 1.0)

    out: list[MonthlyClimate] = []
    for m in range(1, 13):
        fallback = FALLBACK_NORMALS[m - 1]
        t = sum(temps[m]) / len(temps[m]) if temps[m] else fallback.mean_temp_c
        w = sum(wet[m]) / len(wet[m]) if wet[m] else fallback.wet_ratio
        out.append(MonthlyClimate(m, round(t, 1), round(w, 3)))
    return out