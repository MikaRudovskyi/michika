from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongo_url: str = "mongodb://localhost:27017"
    mongo_db: str = "japan_platform"
    jwt_secret: str
    jwt_alg: str = "HS256"
    access_ttl_min: int = 60
    cors_origins: list[str] = ["http://localhost:5173"]

    # Live weather (Open-Meteo: free for non-commercial use, no key).
    weather_enabled: bool = True
    forecast_ttl_min: int = 180

    # Rail service alerts (ODPT; needs a free key from the ODPT Center). Empty key = feature off.
    odpt_consumer_key: str | None = None
    odpt_base_url: str = "https://api.odpt.org/api/v4"
    odpt_operators: str = ""  # comma-separated, e.g. "odpt.Operator:TokyoMetro,odpt.Operator:Toei"

    # Uploaded photos. Stored on local disk; swap services/storage.py for S3/R2 in production.
    media_dir: str = "media"
    media_base_url: str = "http://127.0.0.1:8000/files"
    max_upload_mb: int = 8
    max_images_per_entity: int = 24

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()