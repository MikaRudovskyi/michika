from typing import Literal

from pydantic import BaseModel

Lang = Literal["en", "uk", "ja"]


class I18n(BaseModel):
    en: str
    uk: str | None = None
    ja: str | None = None

    def get(self, lang: str = "en") -> str:
        return getattr(self, lang, None) or self.en


class GeoPoint(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]  # (lon, lat), GeoJSON order

    @property
    def latlon(self) -> tuple[float, float]:
        return (self.coordinates[1], self.coordinates[0])