async def validate_place(db, region_key: str, city_key: str) -> str | None:
    """Returns an error message, or None when the region exists and the city belongs to it."""
    if not await db.regions.find_one({"key": region_key}, {"_id": 1}):
        return f"Unknown region '{region_key}'"
    city = await db.cities.find_one({"key": city_key}, {"region_key": 1})
    if not city:
        return f"Unknown city '{city_key}'"
    if city["region_key"] != region_key:
        return f"City '{city_key}' is not in region '{region_key}'"
    return None