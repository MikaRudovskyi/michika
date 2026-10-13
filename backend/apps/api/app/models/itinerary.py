import datetime as dt

from pydantic import BaseModel, Field

from app.models.common import GeoPoint


class ItineraryParams(BaseModel):
    interests: list[str] = Field(default_factory=list)
    budget_jpy: int = Field(gt=0)
    days: int = Field(ge=1, le=21)
    travelers: int = Field(1, ge=1, le=10)
    start_location: GeoPoint | None = None
    start_date: dt.date | None = None
    region_ids: list[str] = Field(default_factory=list)
    pinned_site_ids: list[str] = Field(default_factory=list)
    excluded_site_ids: list[str] = Field(default_factory=list)
    day_start_hour: int = Field(9, ge=5, le=12)
    daily_hours: float = Field(8, ge=3, le=14)
    max_crowd: float = Field(1.0, ge=0, le=1)
    nightly_room_jpy: int | None = Field(None, gt=0)


class Stop(BaseModel):
    site_id: str
    start_min: int  # minutes from midnight
    end_min: int
    transit_min: int = 0
    transit_mode: str | None = None
    transit_cost_jpy: int = 0  # per person
    entry_fee_jpy: int = 0  # per person
    crowd: float = 0.5


class ItineraryDay(BaseModel):
    index: int
    date: dt.date | None = None
    stops: list[Stop] = Field(default_factory=list)
    transfer_min: int = 0  # from previous day's last stop / start point
    transfer_cost_jpy: int = 0  # per person


class DayCost(BaseModel):
    day_index: int
    entry_fees_jpy: int
    transport_jpy: int
    lodging_jpy: int
    extras_jpy: int
    total_jpy: int


class CostBreakdown(BaseModel):
    entry_fees_jpy: int = 0
    transport_jpy: int = 0
    lodging_jpy: int = 0
    extras_jpy: int = 0
    total_jpy: int = 0
    per_person_jpy: int = 0
    low_jpy: int = 0
    high_jpy: int = 0
    per_day: list[DayCost] = Field(default_factory=list)


class Itinerary(BaseModel):
    id: str | None = None
    owner_id: str | None = None
    params: ItineraryParams
    days: list[ItineraryDay]
    cost: CostBreakdown
    warnings: list[str] = Field(default_factory=list)
    alternatives: list[str] = Field(default_factory=list)  # site ids
    version: int = 1
    created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))