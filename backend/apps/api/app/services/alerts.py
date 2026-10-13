import logging
import time

import httpx
from pydantic import BaseModel

from app.core.config import settings

log = logging.getLogger(__name__)

CACHE_SECONDS = 300


class ServiceAlert(BaseModel):
    operator: str
    railway: str
    status: str | None = None
    text_en: str | None = None
    text_ja: str | None = None


_cache: tuple[float, list[ServiceAlert]] | None = None


def _pick(value: object, lang: str) -> str:
    if isinstance(value, dict):
        return str(value.get(lang) or "")
    return str(value) if value and lang == "ja" else ""  # plain strings are Japanese


def is_disruption(item: dict) -> bool:
    """ODPT lists every line, including those running normally; keep only the troubled ones.

    Heuristic: a line is fine when its text says "平常" (normal operation) or "normal".
    """
    status = item.get("odpt:trainInformationStatus")
    text = item.get("odpt:trainInformationText")
    ja = f"{_pick(status, 'ja')} {_pick(text, 'ja')}".strip()
    en = f"{_pick(status, 'en')} {_pick(text, 'en')}".strip().lower()
    if not ja and not en:
        return False
    return not ("平常" in ja or "normal" in en)


async def fetch_alerts() -> list[ServiceAlert] | None:
    """None means the feature is not configured (no ODPT key)."""
    global _cache
    if not settings.odpt_consumer_key:
        return None
    if _cache and time.monotonic() - _cache[0] < CACHE_SECONDS:
        return _cache[1]

    wanted = {o.strip() for o in settings.odpt_operators.split(",") if o.strip()}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=3.0)) as client:
            res = await client.get(
                f"{settings.odpt_base_url}/odpt:TrainInformation",
                params={"acl:consumerKey": settings.odpt_consumer_key},
            )
            res.raise_for_status()
            items = res.json()
    except (httpx.HTTPError, ValueError) as exc:
        # Log the type only: httpx puts the request URL, and so the API key, in its messages.
        log.warning("ODPT request failed: %s", type(exc).__name__)
        return _cache[1] if _cache else []

    alerts: list[ServiceAlert] = []
    for item in items if isinstance(items, list) else []:
        if wanted and item.get("odpt:operator") not in wanted:
            continue
        if not is_disruption(item):
            continue
        status = item.get("odpt:trainInformationStatus")
        text = item.get("odpt:trainInformationText")
        alerts.append(
            ServiceAlert(
                operator=str(item.get("odpt:operator", "")),
                railway=str(item.get("odpt:railway", "")),
                status=_pick(status, "en") or _pick(status, "ja") or None,
                text_en=_pick(text, "en") or None,
                text_ja=_pick(text, "ja") or None,
            )
        )
    _cache = (time.monotonic(), alerts)
    return alerts