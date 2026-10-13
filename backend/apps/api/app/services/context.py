from datetime import date, timedelta

from app.models.site import CulturalSite
from app.services.climate import FALLBACK_NORMALS, DayWeather, MonthlyClimate, comfort, weather_fit
from app.services.crowds import crowd_adjustment


class SnapshotContext:
    """Crowd and weather lookups over data that was fetched beforehand.

    Satisfies the engine's ContextProvider protocol while keeping the engine free of I/O.
    A day's weather comes from the forecast when there is one, otherwise from the
    monthly climate normals, otherwise from built-in averages.
    """

    def __init__(
        self,
        forecast_by_site: dict[str, dict[date, DayWeather]] | None = None,
        normals_by_site: dict[str, list[MonthlyClimate]] | None = None,
        trip_days: int = 1,
        climate_source: str = "fallback",
    ):
        self.forecast_by_site = forecast_by_site or {}
        self.normals_by_site = normals_by_site or {}
        self.trip_days = max(1, trip_days)
        self.climate_source = climate_source

    def crowd_on(self, site: CulturalSite, day: date) -> float:
        return min(1.0, site.crowd.by_month[day.month - 1] + crowd_adjustment(day))

    def fit_on(self, site: CulturalSite, day: date) -> float:
        forecast = self.forecast_by_site.get(site.id, {}).get(day)
        if forecast is not None:
            raw = comfort(forecast.mean_temp, forecast.rain_chance)
        else:
            normals = self.normals_by_site.get(site.id) or FALLBACK_NORMALS
            n = normals[day.month - 1]
            raw = comfort(n.mean_temp_c, n.wet_ratio)
        return weather_fit(raw, site.indoor)

    # ---- ContextProvider ----
    def crowd_level(self, site: CulturalSite, when: date | None) -> float:
        if when is None:
            return sum(site.crowd.by_month) / 12
        return self.crowd_on(site, when)

    def weather_fit(self, site: CulturalSite, when: date | None) -> float:
        """Average over the whole trip: the engine scores sites once, from the start date."""
        if when is None:
            return 1.0
        total = sum(self.fit_on(site, when + timedelta(days=i)) for i in range(self.trip_days))
        return round(total / self.trip_days, 4)