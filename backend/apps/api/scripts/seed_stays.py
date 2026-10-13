import asyncio
import datetime as dt

from app.core.db import ensure_indexes, get_db
from app.core.security import hash_password
from app.models.accommodation import AccommodationIn

# DEV ONLY. Change or delete these accounts before any real deployment.
# The domain must be a real-looking one: email-validator rejects reserved names such as .local.
MANAGER = ("manager@michika.dev", "Manager#2026!")
ADMIN = ("admin@michika.dev", "Admin#2026!")


def room(rid, en, uk, ja, capacity, price, count):
    return {
        "id": rid,
        "name": {"en": en, "uk": uk, "ja": ja},
        "capacity": capacity,
        "base_price_jpy": price,
        "count": count,
    }


STRICT = [
    {"days_before": 14, "refund_pct": 100},
    {"days_before": 7, "refund_pct": 50},
    {"days_before": 0, "refund_pct": 0},
]
AUTUMN = {"label": "Autumn leaves", "date_from": "2026-11-15", "date_to": "2026-12-05", "multiplier": 1.5}
SAKURA = {"label": "Cherry blossoms", "date_from": "2027-03-25", "date_to": "2027-04-10", "multiplier": 1.4}

PROPERTIES = [
    {
        "name": {"en": "Gion Machiya Ibuki", "uk": "Мачія Ібукі в Гіоні", "ja": "祇園 町家 伊吹"},
        "type": "machiya",
        "region_id": "kansai",
        "city_id": "kyoto",
        "location": {"type": "Point", "coordinates": [135.7740, 35.0036]},
        "rooms": [room("house", "Whole machiya house", "Цілий будинок мачія", "町家一棟貸し", 4, 38000, 1)],
        "weekend_multiplier": 1.1,
        "seasons": [AUTUMN, SAKURA],
        "amenities": ["tatami rooms", "private garden"],
        "rating": 4.8,
    },
    {
        "name": {"en": "Kamo River Ryokan Aoi", "uk": "Рьокан Аої на березі Камо", "ja": "鴨川旅館 葵"},
        "type": "ryokan",
        "region_id": "kansai",
        "city_id": "kyoto",
        "location": {"type": "Point", "coordinates": [135.7712, 35.0105]},
        "rooms": [
            room("tatami", "Tatami room", "Кімната з татамі", "和室", 2, 28000, 6),
            room("premium", "Premium room with kaiseki", "Преміум із кайсекі", "特別室（会席付き）", 3, 46000, 3),
        ],
        "weekend_multiplier": 1.15,
        "seasons": [AUTUMN, SAKURA],
        "amenities": ["kaiseki dinner", "onsen", "tatami rooms"],
        "cancellation_policy": STRICT,
        "rating": 4.7,
    },
    {
        "name": {"en": "Kyoto Station Hotel Sora", "uk": "Готель Сора біля вокзалу Кіото", "ja": "京都駅ホテル 空"},
        "type": "hotel",
        "region_id": "kansai",
        "city_id": "kyoto",
        "location": {"type": "Point", "coordinates": [135.7588, 34.9858]},
        "rooms": [
            room("twin", "Twin room", "Двомісний номер", "ツインルーム", 2, 11000, 20),
            room("family", "Family room", "Сімейний номер", "ファミリールーム", 4, 19000, 6),
        ],
        "seasons": [AUTUMN, SAKURA],
        "amenities": ["wifi", "breakfast"],
        "rating": 4.2,
    },
    {
        "name": {"en": "Arashiyama Garden Inn", "uk": "Садовий інн Арасіяма", "ja": "嵐山ガーデンイン"},
        "type": "hotel",
        "region_id": "kansai",
        "city_id": "kyoto",
        "location": {"type": "Point", "coordinates": [135.6770, 35.0094]},
        "rooms": [room("twin", "Twin room", "Двомісний номер", "ツインルーム", 2, 14000, 8)],
        "seasons": [AUTUMN, SAKURA],
        "amenities": ["wifi", "garden"],
        "rating": 4.4,
    },
    {
        "name": {"en": "Nara Park Guesthouse", "uk": "Гестхаус біля парку Нара", "ja": "奈良公園ゲストハウス"},
        "type": "hostel",
        "region_id": "kansai",
        "city_id": "nara",
        "location": {"type": "Point", "coordinates": [135.8300, 34.6830]},
        "rooms": [room("private", "Private room", "Приватна кімната", "個室", 2, 6500, 8)],
        "amenities": ["wifi", "shared kitchen"],
        "rating": 4.1,
    },
    {
        "name": {"en": "Heijo Ryokan Kasuga", "uk": "Рьокан Касуга Хейдзьо", "ja": "平城旅館 春日"},
        "type": "ryokan",
        "region_id": "kansai",
        "city_id": "nara",
        "location": {"type": "Point", "coordinates": [135.8330, 34.6850]},
        "rooms": [room("tatami", "Tatami room", "Кімната з татамі", "和室", 2, 24000, 5)],
        "weekend_multiplier": 1.15,
        "amenities": ["kaiseki dinner", "tatami rooms"],
        "cancellation_policy": STRICT,
        "rating": 4.6,
    },
    {
        "name": {"en": "Osaka Castle View Hotel", "uk": "Готель із видом на замок Осака", "ja": "大阪城ビューホテル"},
        "type": "hotel",
        "region_id": "kansai",
        "city_id": "osaka",
        "location": {"type": "Point", "coordinates": [135.5300, 34.6880]},
        "rooms": [room("twin", "Twin room", "Двомісний номер", "ツインルーム", 2, 13000, 15)],
        "amenities": ["wifi", "castle view"],
        "rating": 4.3,
    },
    {
        "name": {"en": "Namba Urban Stay", "uk": "Урбан-стей Намба", "ja": "なんば アーバンステイ"},
        "type": "hotel",
        "region_id": "kansai",
        "city_id": "osaka",
        "location": {"type": "Point", "coordinates": [135.5014, 34.6657]},
        "rooms": [room("twin", "Twin room", "Двомісний номер", "ツインルーム", 2, 9500, 20)],
        "amenities": ["wifi"],
        "rating": 4.0,
    },
]


async def ensure_user(db, email: str, name: str, role: str, password: str) -> str:
    await db.users.update_one(
        {"email": email},
        {
            "$setOnInsert": {
                "password_hash": hash_password(password),
                "name": name,
                "role": role,
                "status": "active",
                "prefs": {"interests": [], "budget_jpy": 150000, "trip_days": 5},
                "locale": "en",
                "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )
    doc = await db.users.find_one({"email": email})
    return str(doc["_id"])


async def main() -> None:
    db = get_db()
    await ensure_indexes(db)

    manager_id = await ensure_user(db, MANAGER[0], "Demo Manager", "manager", MANAGER[1])
    await ensure_user(db, ADMIN[0], "Demo Admin", "admin", ADMIN[1])

    now = dt.datetime.now(dt.timezone.utc).isoformat()
    for raw in PROPERTIES:
        model = AccommodationIn.model_validate(raw)  # validates the seed data too
        doc = model.model_dump(mode="json")
        doc["owner_id"] = manager_id
        existing = await db.accommodations.find_one({"name.en": model.name.en}, {"_id": 1})
        if existing:
            await db.accommodations.update_one({"_id": existing["_id"]}, {"$set": doc})
        else:
            await db.accommodations.insert_one({**doc, "created_at": now})

    print(f"Seeded {len(PROPERTIES)} properties")
    print(f"Manager: {MANAGER[0]} / {MANAGER[1]}")
    print(f"Admin:   {ADMIN[0]} / {ADMIN[1]}")


if __name__ == "__main__":
    asyncio.run(main())