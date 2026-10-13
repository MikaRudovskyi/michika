import asyncio

from app.core.db import ensure_indexes, get_db

MONTH_CURVE = [0.6, 0.5, 0.8, 0.9, 0.7, 0.5, 0.55, 0.65, 0.6, 0.8, 0.95, 0.7]
HOUR_CURVE = [0.1] * 8 + [0.4, 0.5, 0.8, 0.9, 0.9, 0.9, 0.8, 0.7, 0.6, 0.4, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1]


def crowd(scale: float) -> dict:
    return {
        "by_month": [round(min(1.0, m * scale), 3) for m in MONTH_CURVE],
        "by_hour": HOUR_CURVE,
    }


def site(slug, en, uk, ja, type_, lon, lat, region, city, fee, minutes, pop, scale,
         tags=(), open_h=9, close_h=17, closed=(), indoor=False):
    return {
        "slug": slug,
        "name": {"en": en, "uk": uk, "ja": ja},
        "type": type_,
        "tags": list(tags),
        "region_id": region,
        "city_id": city,
        "location": {"type": "Point", "coordinates": [lon, lat]},
        "fee_jpy": fee,
        "avg_duration_min": minutes,
        "popularity": pop,
        "crowd": crowd(scale),
        "open_hour": open_h,
        "close_hour": close_h,
        "closed_weekdays": list(closed),
        "indoor": indoor,
        "availability": "available",
    }


SITES = [
    site("kinkaku-ji", "Kinkaku-ji", "Кінкаку-дзі", "金閣寺", "temple", 135.7292, 35.0394,
         "kansai", "kyoto", 500, 60, 0.95, 1.0, ("zen", "unesco")),
    site("fushimi-inari", "Fushimi Inari Taisha", "Фусімі Інарі Тайся", "伏見稲荷大社", "temple",
         135.7727, 34.9671, "kansai", "kyoto", 0, 120, 0.97, 1.0, ("shinto", "hiking"), 0, 24),
    site("nijo-castle", "Nijō Castle", "Замок Нідзьо", "二条城", "castle", 135.7480, 35.0142,
         "kansai", "kyoto", 1300, 90, 0.8, 0.9, ("samurai", "unesco")),
    site("ryoan-ji", "Ryōan-ji", "Рьоан-дзі", "龍安寺", "garden", 135.7185, 35.0345,
         "kansai", "kyoto", 600, 45, 0.7, 0.7, ("zen", "unesco")),
    site("kyoto-national-museum", "Kyoto National Museum", "Національний музей Кіото",
         "京都国立博物館", "museum", 135.7728, 34.9900, "kansai", "kyoto", 700, 90, 0.55, 0.5,
         ("art", "history"), 9, 17, (0,), True),
    site("gion-tea", "Gion Tea Ceremony Experience", "Чайна церемонія в Гіоні",
         "祇園の茶会体験", "tea_ceremony", 135.7757, 35.0037, "kansai", "kyoto", 3500, 60, 0.6, 0.4,
         ("tea", "tradition"), 10, 18, (), True),
    site("todai-ji", "Tōdai-ji", "Тодай-дзі", "東大寺", "temple", 135.8398, 34.6890,
         "kansai", "nara", 600, 90, 0.9, 0.9, ("buddhism", "unesco")),
    site("osaka-castle", "Osaka Castle", "Замок Осака", "大阪城", "castle", 135.5262, 34.6873,
         "kansai", "osaka", 600, 90, 0.85, 0.8, ("samurai", "history")),
]


async def main() -> None:
    db = get_db()
    await ensure_indexes(db)
    for doc in SITES:
        await db.cultural_sites.update_one({"slug": doc["slug"]}, {"$set": doc}, upsert=True)
    print(f"Seeded {len(SITES)} sites")


if __name__ == "__main__":
    asyncio.run(main())