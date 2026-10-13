import asyncio
import datetime as dt
from collections.abc import Sequence

from app.core.config import settings
from app.models.site import CulturalSite
from app.services.context import SnapshotContext
from app.services.weather import HORIZON_DAYS, cell, get_weather


async def build_context(
    db, sites: Sequence[CulturalSite], start: dt.date | None, trip_days: int
) -> SnapshotContext:
    """Fetch what the trip needs (forecast when the dates are near, climate normals always),
    then hand back a plain, synchronous context for the engine to use."""
    if start is None or not sites or not settings.weather_enabled:
        return SnapshotContext(trip_days=trip_days)

    svc = get_weather(db)
    today = dt.date.today()
    end = start + dt.timedelta(days=trip_days - 1)
    needs_forecast = start <= today + dt.timedelta(days=HORIZON_DAYS - 1) and end >= today

    forecast_cell = {s.id: cell(*s.latlon, 0.1) for s in sites}
    normals_cell = {s.id: cell(*s.latlon, 0.5) for s in sites}

    forecasts: dict[tuple[float, float], dict] = {}
    if needs_forecast:
        cells = sorted(set(forecast_cell.values()))
        results = await asyncio.gather(*(svc.forecast(lat, lon) for lat, lon in cells))
        forecasts = dict(zip(cells, results))

    ncells = sorted(set(normals_cell.values()))
    normals_results = await asyncio.gather(*(svc.normals(lat, lon) for lat, lon in ncells))
    normals = {c: r[0] for c, r in zip(ncells, normals_results)}
    source = "archive" if all(r[1] == "archive" for r in normals_results) else "fallback"

    return SnapshotContext(
        {s.id: forecasts.get(forecast_cell[s.id], {}) for s in sites},
        {s.id: normals[normals_cell[s.id]] for s in sites},
        trip_days,
        source,
    )