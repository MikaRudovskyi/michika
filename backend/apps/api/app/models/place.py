from pydantic import BaseModel, Field

from app.models.common import I18n

KEY_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


class RegionIn(BaseModel):
    key: str = Field(min_length=2, max_length=40, pattern=KEY_PATTERN)
    name: I18n


class Region(RegionIn):
    id: str


class CityIn(BaseModel):
    key: str = Field(min_length=2, max_length=40, pattern=KEY_PATTERN)
    region_key: str
    name: I18n


class City(CityIn):
    id: str