from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.db import ensure_indexes, get_db
from app.routers import (
    accommodations,
    admin,
    auth,
    bookings,
    catalog,
    compare,
    insights,
    itineraries,
    media,
    regions,
    sites_admin,
    staff,
    stays,
)
from app.services.media_store import ensure_media_indexes
from app.services.weather import close_weather, ensure_weather_indexes


class ImmutableFiles(StaticFiles):
    """Photo file names are random and never reused, so browsers may cache them for good."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 200:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


@asynccontextmanager
async def lifespan(_: FastAPI):
    db = get_db()
    await ensure_indexes(db)
    await ensure_weather_indexes(db)
    await ensure_media_indexes(db)
    yield
    await close_weather()


app = FastAPI(title="Japan Cultural Tourism API", version="0.5.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(sites_admin.router)
app.include_router(regions.router)
app.include_router(itineraries.router)
app.include_router(insights.router)
app.include_router(compare.router)
app.include_router(media.router)
app.include_router(accommodations.router)
app.include_router(stays.router)
app.include_router(bookings.router)
app.include_router(staff.router)
app.include_router(admin.router)

# Uploaded photos (served at /files, while the API for them lives under /media).
Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
app.mount("/files", ImmutableFiles(directory=settings.media_dir), name="files")


@app.get("/health")
async def health():
    return {"status": "ok"}