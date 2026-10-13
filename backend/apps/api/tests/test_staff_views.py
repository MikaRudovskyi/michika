from app.models.itinerary import CostBreakdown, Itinerary, ItineraryDay, ItineraryParams, Stop
from app.services.staff_views import removed_room_ids, summarize


def stop(site_id: str, start: int) -> Stop:
    return Stop(site_id=site_id, start_min=start, end_min=start + 60)


def test_summarize_counts_days_stops_cost_and_warnings():
    route = Itinerary(
        params=ItineraryParams(budget_jpy=100_000, days=2),
        days=[
            ItineraryDay(index=0, stops=[stop("a", 540), stop("b", 660)]),
            ItineraryDay(index=1),
        ],
        cost=CostBreakdown(total_jpy=42_000),
        warnings=["over budget"],
    )
    assert summarize(route) == {"days": 2, "stops": 2, "total_jpy": 42_000, "warnings": 1}


def test_removed_room_ids_reports_only_missing_types():
    assert removed_room_ids(["twin", "family"], ["twin", "suite"]) == ["family"]
    assert removed_room_ids(["twin"], ["twin"]) == []
    assert removed_room_ids([], ["twin"]) == []