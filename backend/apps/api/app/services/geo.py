from math import asin, cos, radians, sin, sqrt

LatLon = tuple[float, float]


def haversine_km(a: LatLon, b: LatLon) -> float:
    lat1, lon1 = map(radians, a)
    lat2, lon2 = map(radians, b)
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371.0 * asin(sqrt(h))


def estimate_transit(km: float) -> tuple[str, int, int]:
    """Heuristic (mode, cost_jpy per person, minutes).

    Placeholder for a real TransportProvider adapter (Navitime / Jorudan / GTFS).
    """
    if km <= 1.5:
        return "walk", 0, max(1, round(km * 12))
    if km <= 25:
        return "local", round(180 + km * 12), round(10 + km * 2.5)
    return "express", round(1500 + km * 22), round(20 + km / 2.2)