import asyncio
import datetime as dt
import logging

import httpx

from app.core.config import settings
from app.services.climate import FALLBACK_NORMALS, DayWeather, MonthlyClimate, monthly_normals

log = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
HORIZON_DAYS = 16
NORMALS_FROM, NORMALS_TO = "2019-01-01", "2023-12-31"  # five complete years
FAILURE_TTL = dt.timedelta(minutes=5)


def cell(lat: float, lon: float, step: float) -> tuple[float, float]:
    """Snap a point to a grid so that nearby sites share one cached request."""
    return round(round(lat / step) * step, 4), round(round(lon / step) * step, 4)


def _now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def _at(values: list | None, i: int):
    return values[i] if values and i < len(values) else None


def _parse_forecast(daily: dict) -> dict[dt.date, DayWeather]:
    out: dict[dt.date, DayWeather] = {}
    for i, iso in enumerate(daily.get("time") or []):
        tmax = _at(daily.get("temperature_2m_max"), i)
        tmin = _at(daily.get("temperature_2m_min"), i)
        if tmax is None or tmin is None:
            continue
        day = dt.date.fromisoformat(iso)
        out[day] = DayWeather(
            day=day,
            temp_max_c=float(tmax),
            temp_min_c=float(tmin),
            precip_prob=_at(daily.get("precipitation_probability_max"), i),
            precip_mm=float(_at(daily.get("precipitation_sum"), i) or 0.0),
            code=_at(daily.get("weather_code"), i),
        )
    return out


def _encode_days(days: dict[dt.date, DayWeather]) -> list[dict]:
    return [
        {"d": d.isoformat(), "max": w.temp_max_c, "min": w.temp_min_c, "p": w.precip_prob, "mm": w.precip_mm, "c": w.code}
        for d, w in days.items()
    ]


def _decode_days(rows: list[dict]) -> dict[dt.date, DayWeather]:
    out: dict[dt.date, DayWeather] = {}
    for r in rows:
        day = dt.date.fromisoformat(r["d"])
        out[day] = DayWeather(day, r["max"], r["min"], r["p"], r["mm"], r["c"])
    return out


class WeatherService:
    """Open-Meteo forecast and climate normals, cached in MongoDB and failing soft.

    A network problem never breaks the app: callers get an empty forecast or the built-in
    normals, and the failure is remembered for a few minutes so requests are not retried
    on every call.
    """

    def __init__(self, db):
        self.db = db
        self._http = httpx.AsyncClient(timeout=httpx.Timeout(6.0, connect=3.0))
        self._gate = asyncio.Semaphore(8)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _cached(self, key: str):
        doc = await self.db.weather_cache.find_one({"_id": key, "expires_at": {"$gt": _now()}})
        return doc["data"] if doc else None

    async def _store(self, key: str, data, ttl: dt.timedelta) -> None:
        await self.db.weather_cache.replace_one(
            {"_id": key}, {"_id": key, "data": data, "expires_at": _now() + ttl}, upsert=True
        )

    async def _get_json(self, url: str, params: dict) -> dict | None:
        async with self._gate:
            try:
                res = await self._http.get(url, params=params)
                res.raise_for_status()
                return res.json()
            except (httpx.HTTPError, ValueError) as exc:
                log.warning("Weather request failed: %s", type(exc).__name__)
                return None

    async def forecast(self, lat: float, lon: float) -> dict[dt.date, DayWeather]:
        """Daily forecast for the next 16 days; empty when unavailable."""
        if not settings.weather_enabled:
            return {}
        clat, clon = cell(lat, lon, 0.1)
        key = f"forecast:{clat:.1f}:{clon:.1f}"
        cached = await self._cached(key)
        if cached is not None:
            return _decode_days(cached)

        data = await self._get_json(
            FORECAST_URL,
            {
                "latitude": clat,
                "longitude": clon,
                "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
                "timezone": "Asia/Tokyo",
                "forecast_days": HORIZON_DAYS,
            },
        )
        days = _parse_forecast(data["daily"]) if data and "daily" in data else {}
        ttl = dt.timedelta(minutes=settings.forecast_ttl_min) if days else FAILURE_TTL
        await self._store(key, _encode_days(days), ttl)
        return days

    async def normals(self, lat: float, lon: float) -> tuple[list[MonthlyClimate], str]:
        """Twelve monthly normals and where they came from: 'archive' or 'fallback'."""
        if not settings.weather_enabled:
            return FALLBACK_NORMALS, "fallback"
        clat, clon = cell(lat, lon, 0.5)
        key = f"normals:{clat:.1f}:{clon:.1f}"
        cached = await self._cached(key)
        if cached is not None:
            months = cached.get("months")
            if months:
                return [MonthlyClimate(int(m), float(t), float(w)) for m, t, w in months], "archive"
            return FALLBACK_NORMALS, "fallback"

        data = await self._get_json(
            ARCHIVE_URL,
            {
                "latitude": clat,
                "longitude": clon,
                "start_date": NORMALS_FROM,
                "end_date": NORMALS_TO,
                "daily": "temperature_2m_mean,precipitation_sum",
                "timezone": "Asia/Tokyo",
            },
        )
        daily = data.get("daily") if data else None
        if daily and daily.get("time"):
            rows = (
                (dt.date.fromisoformat(iso), _at(daily.get("temperature_2m_mean"), i), _at(daily.get("precipitation_sum"), i))
                for i, iso in enumerate(daily["time"])
            )
            months = monthly_normals(rows)
            await self._store(
                key, {"months": [[m.month, m.mean_temp_c, m.wet_ratio] for m in months]}, dt.timedelta(days=365)
            )
            return months, "archive"

        await self._store(key, {"months": None}, FAILURE_TTL * 2)
        return FALLBACK_NORMALS, "fallback"


_service: WeatherService | None = None


def get_weather(db) -> WeatherService:
    global _service
    if _service is None:
        _service = WeatherService(db)
    return _service


async def close_weather() -> None:
    global _service
    if _service is not None:
        await _service.aclose()
        _service = None


async def ensure_weather_indexes(db) -> None:
    await db.weather_cache.create_index("expires_at", expireAfterSeconds=0)