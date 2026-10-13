from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.common import GeoPoint, I18n

SiteType = Literal["temple", "castle", "garden", "museum", "historical_site", "tea_ceremony"]
Availability = Literal["available", "temporarily_unavailable"]


class CrowdProfile(BaseModel):
    by_month: list[float] = Field(default_factory=lambda: [0.5] * 12, min_length=12, max_length=12)
    by_hour: list[float] = Field(default_factory=lambda: [0.5] * 24, min_length=24, max_length=24)


class CulturalSiteIn(BaseModel):
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    name: I18n
    description: I18n | None = None
    type: SiteType
    tags: list[str] = Field(default_factory=list)
    region_id: str
    city_id: str
    location: GeoPoint
    fee_jpy: int = Field(0, ge=0)
    avg_duration_min: int = Field(60, ge=10, le=600)
    popularity: float = Field(0.5, ge=0, le=1)
    crowd: CrowdProfile = Field(default_factory=CrowdProfile)
    open_hour: int = Field(9, ge=0, le=23)
    close_hour: int = Field(17, ge=1, le=24)
    closed_weekdays: list[int] = Field(default_factory=list)  # 0 = Monday
    indoor: bool = False
    availability: Availability = "available"
    unavailable_reason: str | None = Field(None, max_length=300)

    @model_validator(mode="after")
    def _consistent(self):
        if self.close_hour <= self.open_hour:
            raise ValueError("close_hour must be later than open_hour")
        if any(d < 0 or d > 6 for d in self.closed_weekdays):
            raise ValueError("closed_weekdays must be 0 (Monday) to 6 (Sunday)")
        lon, lat = self.location.coordinates
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("location must be [longitude, latitude] within valid ranges")
        if self.availability == "available":
            self.unavailable_reason = None
        return self

    @property
    def latlon(self) -> tuple[float, float]:
        return self.location.latlon


class CulturalSite(CulturalSiteIn):
    id: str


class SitePatch(BaseModel):
    """Any subset of fields (the slug is immutable); the merged result is re-validated."""

    name: I18n | None = None
    description: I18n | None = None
    type: SiteType | None = None
    tags: list[str] | None = None
    region_id: str | None = None
    city_id: str | None = None
    location: GeoPoint | None = None
    fee_jpy: int | None = Field(None, ge=0)
    avg_duration_min: int | None = Field(None, ge=10, le=600)
    popularity: float | None = Field(None, ge=0, le=1)
    crowd: CrowdProfile | None = None
    open_hour: int | None = Field(None, ge=0, le=23)
    close_hour: int | None = Field(None, ge=1, le=24)
    closed_weekdays: list[int] | None = None
    indoor: bool | None = None
    availability: Availability | None = None
    unavailable_reason: str | None = Field(None, max_length=300)