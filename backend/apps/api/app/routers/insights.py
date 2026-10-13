import datetime as dt
from statistics import fmean

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.db import from_doc, get_db, to_oid
from app.core.rbac import RANK, require_role
from app.models.common import Lang
from app.models.itinerary import Itinerary
from app.models.site import CulturalSite
from app.models.user import Role, User
from app.services.alerts import ServiceAlert, fetch_alerts
from app.services.best_time import (
    HourScore,
    MonthScore,
    StartOption,
    best_hours,
    score_starts,
    site_months,
    top_months,
)
from app.services.geo import haversine_km
from app.services.live_context import build_context
from app.services.sites import load_sites
from app.services.weather import get_weather

router = APIRouter(prefix="/insights", tags=["insights"])
registered = require_role(Role.user)


async def _load(db, itinerary_id: str, user: User) -> Itinerary:
    doc = await db.itineraries.find_one({"_id": to_oid(itinerary_id, "Itinerary")})
    if not doc:
        raise HTTPException(404, "Itinerary not found")
    route = from_doc(Itinerary, doc)
    if route.owner_id != user.id and RANK[user.role] < RANK[Role.manager]:
        raise HTTPException(403, "Not your itinerary")
    return route


# ------------------------------ best time ------------------------------ #
class BestTimeOut(BaseModel):
    site_id: str
    name: str
    indoor: bool
    months: list[MonthScore]
    best_months: list[int]
    best_hours: list[HourScore]
    climate_source: str


@router.get("/sites/{site_id}/best-time", response_model=BestTimeOut)
async def site_best_time(site_id: str, lang: Lang = "en", db=Depends(get_db)):
    """Public: when a site is quietest and the weather is kindest, by month and by hour."""
    doc = await db.cultural_sites.find_one({"_id": to_oid(site_id, "Site")})
    if not doc:
        raise HTTPException(404, "Site not found")
    site = from_doc(CulturalSite, doc)
    normals, source = await get_weather(db).normals(*site.latlon)
    months = site_months(site, normals)
    return BestTimeOut(
        site_id=site.id,
        name=site.name.get(lang),
        indoor=site.indoor,
        months=months,
        best_months=top_months(months),
        best_hours=best_hours(site),
        climate_source=source,
    )


class StartDatesIn(BaseModel):
    window_days: int = Field(90, ge=7, le=180)
    top: int = Field(5, ge=1, le=10)


class StartDatesOut(BaseModel):
    options: list[StartOption]
    current_start: dt.date | None = None
    current_score: float | None = None
    climate_source: str


@router.post("/itineraries/{itinerary_id}/start-dates", response_model=StartDatesOut)
async def start_dates(
    itinerary_id: str,
    body: StartDatesIn,
    user: User = Depends(registered),
    db=Depends(get_db),
):
    """Best dates to start this same route: crowds, weather and closed days compared."""
    route = await _load(db, itinerary_id, user)
    sites = await load_sites(db, {s.site_id for d in route.days for s in d.stops})
    plan = [[sites[s.site_id] for s in d.stops if s.site_id in sites] for d in route.days]
    flat = [s for day in plan for s in day]
    if not flat:
        raise HTTPException(422, "The itinerary has no stops to analyse")

    today = dt.date.today()
    ctx = await build_context(db, flat, today, body.window_days + len(plan))
    candidates = [today + dt.timedelta(days=i) for i in range(1, body.window_days + 1)]
    options = score_starts(plan, candidates, ctx, top=body.top)

    current = route.params.start_date
    current_score = None
    if current is not None and current >= today:
        scored = score_starts(plan, [current], ctx, top=1)
        current_score = scored[0].score if scored else None

    return StartDatesOut(
        options=options, current_start=current, current_score=current_score, climate_source=ctx.climate_source
    )


# ------------------------------- weather ------------------------------- #
class IndoorAlt(BaseModel):
    id: str
    name: str
    distance_km: float


class DayWeatherOut(BaseModel):
    day: int
    date: dt.date
    source: str  # "forecast" or "normals"
    temp_mean: float
    temp_max: float | None = None
    temp_min: float | None = None
    rain_chance: float  # 0..1
    code: int | None = None
    flags: list[str] = Field(default_factory=list)
    outdoor_stops: list[str] = Field(default_factory=list)
    alternatives: list[IndoorAlt] = Field(default_factory=list)


@router.get("/itineraries/{itinerary_id}/weather", response_model=list[DayWeatherOut])
async def itinerary_weather(
    itinerary_id: str,
    lang: Lang = "en",
    user: User = Depends(registered),
    db=Depends(get_db),
):
    """Weather for each day of the route: the forecast when it exists, typical values otherwise."""
    route = await _load(db, itinerary_id, user)
    start = route.params.start_date
    if start is None:
        raise HTTPException(422, "The itinerary has no start date")

    sites = await load_sites(db, {s.site_id for d in route.days for s in d.stops})
    if not sites:
        return []
    svc = get_weather(db)
    all_sites = list(sites.values())
    route_ids = set(sites)

    out: list[DayWeatherOut] = []
    for day in route.days:
        day_sites = [sites[s.site_id] for s in day.stops if s.site_id in sites] or all_sites
        lat = fmean(s.latlon[0] for s in day_sites)
        lon = fmean(s.latlon[1] for s in day_sites)
        when = start + dt.timedelta(days=day.index)

        forecast = (await svc.forecast(lat, lon)).get(when)
        if forecast is not None:
            entry = DayWeatherOut(
                day=day.index,
                date=when,
                source="forecast",
                temp_mean=round(forecast.mean_temp, 1),
                temp_max=round(forecast.temp_max_c, 1),
                temp_min=round(forecast.temp_min_c, 1),
                rain_chance=round(forecast.rain_chance, 2),
                code=forecast.code,
            )
        else:
            normals, _ = await svc.normals(lat, lon)
            n = normals[when.month - 1]
            entry = DayWeatherOut(
                day=day.index, date=when, source="normals", temp_mean=n.mean_temp_c, rain_chance=n.wet_ratio
            )

        if entry.rain_chance >= 0.6:
            entry.flags.append("rain_risk")
        if entry.code is not None and entry.code >= 95:
            entry.flags.append("storm")
        if (entry.temp_max or entry.temp_mean) >= 33:
            entry.flags.append("heat")
        if (entry.temp_min if entry.temp_min is not None else entry.temp_mean) <= 0:
            entry.flags.append("cold")

        outdoor = [s for s in day.stops if s.site_id in sites and not sites[s.site_id].indoor]
        entry.outdoor_stops = [sites[s.site_id].name.get(lang) for s in outdoor]

        if outdoor and ({"rain_risk", "storm"} & set(entry.flags)):
            query = {
                "availability": "available",
                "indoor": True,
                "location": {"$geoWithin": {"$centerSphere": [[lon, lat], 8 / 6378.1]}},
            }
            alternatives: list[IndoorAlt] = []
            async for doc in db.cultural_sites.find(query).limit(30):
                candidate = from_doc(CulturalSite, doc)
                if candidate.id in route_ids:
                    continue
                alternatives.append(
                    IndoorAlt(
                        id=candidate.id,
                        name=candidate.name.get(lang),
                        distance_km=round(haversine_km((lat, lon), candidate.latlon), 1),
                    )
                )
            entry.alternatives = sorted(alternatives, key=lambda a: a.distance_km)[:3]

        out.append(entry)
    return out


# ------------------------------- alerts -------------------------------- #
class AlertsOut(BaseModel):
    configured: bool
    alerts: list[ServiceAlert]


@router.get("/alerts", response_model=AlertsOut)
async def alerts(_: User = Depends(registered)):
    """Rail disruptions from ODPT; `configured` is false until a key is set."""
    items = await fetch_alerts()
    return AlertsOut(configured=items is not None, alerts=items or [])