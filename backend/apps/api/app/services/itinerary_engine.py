from __future__ import annotations

from datetime import date, timedelta
from typing import Protocol, Sequence

from app.models.itinerary import CostBreakdown, Itinerary, ItineraryDay, ItineraryParams, Stop
from app.models.site import CulturalSite
from app.services.cost_engine import compute_costs
from app.services.geo import LatLon, estimate_transit, haversine_km

MAX_STOPS_PER_DAY = 4
TRANSIT_BUFFER_MIN = 10
MIN_FILL_SCORE = 0.45
MAX_FIT_ITERATIONS = 60


# --------------------------------------------------------------------------- #
# Context (crowd / weather) — swap SeasonalContext for live providers later
# --------------------------------------------------------------------------- #
class ContextProvider(Protocol):
    def crowd_level(self, site: CulturalSite, when: date | None) -> float: ...
    def weather_fit(self, site: CulturalSite, when: date | None) -> float: ...


class SeasonalContext:
    """Statistics-only fallback: monthly crowd profile + rainy/typhoon/heat penalties."""

    OUTDOOR_PENALTY = {6: 0.7, 7: 0.85, 8: 0.8, 9: 0.75}

    def crowd_level(self, site: CulturalSite, when: date | None) -> float:
        months = site.crowd.by_month
        return months[when.month - 1] if when else sum(months) / 12

    def weather_fit(self, site: CulturalSite, when: date | None) -> float:
        if when is None or site.indoor:
            return 1.0
        return self.OUTDOOR_PENALTY.get(when.month, 1.0)


def _centroid(sites: Sequence[CulturalSite]) -> LatLon:
    return (
        sum(s.latlon[0] for s in sites) / len(sites),
        sum(s.latlon[1] for s in sites) / len(sites),
    )


# --------------------------------------------------------------------------- #
# Engine
# --------------------------------------------------------------------------- #
class ItineraryEngine:
    def __init__(self, sites: Sequence[CulturalSite], ctx: ContextProvider | None = None):
        self.sites: dict[str, CulturalSite] = {s.id: s for s in sites}
        self.ctx: ContextProvider = ctx or SeasonalContext()

    # ------------------------------ public ------------------------------- #
    def generate(self, params: ItineraryParams) -> Itinerary:
        warnings: list[str] = []
        pinned = set(params.pinned_site_ids)

        pool = [s for s in self.sites.values() if self._eligible(s, params)]
        scores = {s.id: self._score(s, params) for s in pool}
        pool.sort(key=lambda s: scores[s.id], reverse=True)

        pool_ids = {s.id for s in pool}
        for pid in params.pinned_site_ids:
            if pid not in pool_ids:
                warnings.append(f"Pinned site {pid} is unavailable or excluded and was skipped.")

        ordered = [s for s in pool if s.id in pinned] + [s for s in pool if s.id not in pinned]
        capacity = params.days * MAX_STOPS_PER_DAY
        chosen, leftovers = ordered[:capacity], ordered[capacity:]
        chosen.sort(key=lambda s: scores[s.id], reverse=True)

        # 1) cluster by geography -> 2) order days -> 3) pack by time windows
        plan = self._order_clusters(self._cluster(chosen, params.days), params)
        _, plan, dropped = self._materialize(plan, params)
        leftovers += dropped

        # 4) fit to budget (remove lowest value-per-yen), then 5) fill leftover budget
        plan, removed = self._fit_budget(plan, params, scores)
        plan = self._fill(plan, leftovers, params, scores)

        days, plan, _ = self._materialize(plan, params)
        cost = self._cost(days, params)

        planned = {s.id for sites in plan for s in sites}
        for pid in pinned & pool_ids:
            if pid not in planned:
                warnings.append(f"Pinned site {pid} could not be scheduled (time or budget).")
        if cost.total_jpy > params.budget_jpy:
            warnings.append(
                f"Estimated cost ¥{cost.total_jpy:,} exceeds budget ¥{params.budget_jpy:,}; "
                "lodging and daily extras alone may be above the budget."
            )
        for d in days:
            if not d.stops:
                warnings.append(f"Day {d.index + 1} has no stops: not enough suitable sites.")

        alt_pool = [s for s in leftovers + removed if s.id not in planned]
        alt_pool.sort(key=lambda s: scores.get(s.id, 0), reverse=True)

        return Itinerary(
            params=params,
            days=days,
            cost=cost,
            warnings=warnings,
            alternatives=[s.id for s in alt_pool[:5]],
        )

    @staticmethod
    def diff(old: Itinerary, new: Itinerary) -> dict:
        def where(it: Itinerary) -> dict[str, int]:
            return {st.site_id: d.index for d in it.days for st in d.stops}

        a, b = where(old), where(new)
        return {
            "added": sorted(b.keys() - a.keys()),
            "removed": sorted(a.keys() - b.keys()),
            "moved": [
                {"site_id": k, "from_day": a[k], "to_day": b[k]}
                for k in sorted(a.keys() & b.keys())
                if a[k] != b[k]
            ],
        }

    # ------------------------------ scoring ------------------------------ #
    def _eligible(self, s: CulturalSite, params: ItineraryParams) -> bool:
        if s.availability != "available" or s.id in params.excluded_site_ids:
            return False
        if params.region_ids and s.region_id not in params.region_ids:
            return False
        if s.id in params.pinned_site_ids:
            return True
        return self.ctx.crowd_level(s, params.start_date) <= params.max_crowd

    def _score(self, s: CulturalSite, params: ItineraryParams) -> float:
        when = params.start_date
        wanted = {i.lower() for i in params.interests}
        have = {s.type, *(t.lower() for t in s.tags)}
        interest = 0.5 if not wanted else min(1.0, len(wanted & have) / min(len(wanted), 2))
        crowd = self.ctx.crowd_level(s, when)
        weather = self.ctx.weather_fit(s, when)
        return round(0.5 * interest + 0.2 * s.popularity + 0.2 * (1 - crowd) + 0.1 * weather, 4)

    # ----------------------------- clustering ---------------------------- #
    @staticmethod
    def _cluster(sites: list[CulturalSite], k: int) -> list[list[CulturalSite]]:
        """Farthest-point seeding + a few k-means iterations on haversine distance."""
        if not sites:
            return []
        k = min(k, len(sites))
        seeds: list[LatLon] = [sites[0].latlon]  # sites[0] = best-scored
        while len(seeds) < k:
            far = max(sites, key=lambda s: min(haversine_km(s.latlon, c) for c in seeds))
            seeds.append(far.latlon)

        groups: list[list[CulturalSite]] = []
        for _ in range(4):
            groups = [[] for _ in range(k)]
            for s in sites:
                j = min(range(k), key=lambda i: haversine_km(s.latlon, seeds[i]))
                groups[j].append(s)
            seeds = [_centroid(g) if g else seeds[i] for i, g in enumerate(groups)]
        return [g for g in groups if g]

    def _order_clusters(
        self, groups: list[list[CulturalSite]], params: ItineraryParams
    ) -> list[list[CulturalSite]]:
        origin = params.start_location.latlon if params.start_location else None
        remaining = list(groups)
        ordered: list[list[CulturalSite]] = []
        cur = origin
        while remaining:
            if cur is None:
                idx = 0
            else:
                idx = min(range(len(remaining)), key=lambda i: haversine_km(cur, _centroid(remaining[i])))
            group = remaining.pop(idx)
            ordered.append(group)
            cur = _centroid(group)

        plan: list[list[CulturalSite]] = []
        cur = origin
        for g in ordered:
            seq = self._nn_order(g, cur)
            plan.append(seq)
            cur = seq[-1].latlon
        plan += [[] for _ in range(params.days - len(plan))]
        return plan

    @staticmethod
    def _nn_order(sites: list[CulturalSite], start: LatLon | None) -> list[CulturalSite]:
        todo = list(sites)
        out: list[CulturalSite] = []
        if start is None:
            first = todo.pop(0)
            out.append(first)
            cur = first.latlon
        else:
            cur = start
        while todo:
            i = min(range(len(todo)), key=lambda j: haversine_km(cur, todo[j].latlon))
            s = todo.pop(i)
            out.append(s)
            cur = s.latlon
        return out

    # ------------------------------ scheduling --------------------------- #
    def _schedule_day(
        self, index: int, when: date | None, sites: list[CulturalSite], params: ItineraryParams
    ) -> tuple[ItineraryDay, list[CulturalSite]]:
        t0 = params.day_start_hour * 60
        limit = t0 + int(params.daily_hours * 60)
        stops: list[Stop] = []
        dropped: list[CulturalSite] = []

        for s in sites:
            mode: str | None = None
            cost = 0
            transit = 0
            if stops:
                prev = self.sites[stops[-1].site_id]
                mode, cost, minutes = estimate_transit(haversine_km(prev.latlon, s.latlon))
                transit = minutes + TRANSIT_BUFFER_MIN

            ready = (stops[-1].end_min if stops else t0) + transit
            start = max(ready, s.open_hour * 60)
            end = start + s.avg_duration_min
            closed_today = when is not None and when.weekday() in s.closed_weekdays

            if closed_today or len(stops) >= MAX_STOPS_PER_DAY or end > min(limit, s.close_hour * 60):
                dropped.append(s)
                continue

            stops.append(
                Stop(
                    site_id=s.id,
                    start_min=start,
                    end_min=end,
                    transit_min=transit,
                    transit_mode=mode,
                    transit_cost_jpy=cost,
                    entry_fee_jpy=s.fee_jpy,
                    crowd=round(self.ctx.crowd_level(s, when), 3),
                )
            )
        return ItineraryDay(index=index, date=when, stops=stops), dropped

    def _materialize(
        self, plan: list[list[CulturalSite]], params: ItineraryParams
    ) -> tuple[list[ItineraryDay], list[list[CulturalSite]], list[CulturalSite]]:
        """Plan (ordered sites per day) -> timed days + pruned plan + dropped sites."""
        days: list[ItineraryDay] = []
        kept: list[list[CulturalSite]] = []
        dropped: list[CulturalSite] = []
        origin = params.start_location.latlon if params.start_location else None

        for i, sites in enumerate(plan):
            when = params.start_date + timedelta(days=i) if params.start_date else None
            day, dr = self._schedule_day(i, when, sites, params)
            if day.stops:
                first = self.sites[day.stops[0].site_id]
                if origin is not None:
                    _, cost, minutes = estimate_transit(haversine_km(origin, first.latlon))
                    day.transfer_cost_jpy, day.transfer_min = cost, minutes
                origin = self.sites[day.stops[-1].site_id].latlon
            days.append(day)
            kept.append([self.sites[s.site_id] for s in day.stops])
            dropped += dr
        return days, kept, dropped

    def _cost(self, days: list[ItineraryDay], params: ItineraryParams) -> CostBreakdown:
        return compute_costs(days, travelers=params.travelers, nightly_room_jpy=params.nightly_room_jpy)

    # --------------------------- budget fitting -------------------------- #
    def _fit_budget(
        self, plan: list[list[CulturalSite]], params: ItineraryParams, scores: dict[str, float]
    ) -> tuple[list[list[CulturalSite]], list[CulturalSite]]:
        """While over budget, remove the non-pinned stop with the lowest score per yen saved."""
        pinned = set(params.pinned_site_ids)
        removed: list[CulturalSite] = []

        for _ in range(MAX_FIT_ITERATIONS):
            days, plan, _dropped = self._materialize(plan, params)
            total = self._cost(days, params).total_jpy
            if total <= params.budget_jpy:
                break

            best: tuple[float, int, int] | None = None
            for di, sites in enumerate(plan):
                for si, s in enumerate(sites):
                    if s.id in pinned:
                        continue
                    trial = [list(x) for x in plan]
                    del trial[di][si]
                    t_days, _, _ = self._materialize(trial, params)
                    saving = total - self._cost(t_days, params).total_jpy
                    if saving <= 0:
                        continue
                    ratio = scores.get(s.id, 0.0) / saving
                    if best is None or ratio < best[0]:
                        best = (ratio, di, si)
            if best is None:
                break
            _, di, si = best
            removed.append(plan[di].pop(si))
        return plan, removed

    def _fill(
        self,
        plan: list[list[CulturalSite]],
        leftovers: list[CulturalSite],
        params: ItineraryParams,
        scores: dict[str, float],
    ) -> list[list[CulturalSite]]:
        """Insert good leftover sites at the cheapest valid position while budget allows."""
        pinned = set(params.pinned_site_ids)
        in_plan = {s.id for sites in plan for s in sites}
        candidates = [
            s
            for s in leftovers
            if s.id not in in_plan and (s.id in pinned or scores.get(s.id, 0) >= MIN_FILL_SCORE)
        ]
        candidates.sort(key=lambda s: (s.id not in pinned, -scores.get(s.id, 0)))
        candidates = candidates[: params.days * MAX_STOPS_PER_DAY]

        for s in candidates:
            best: tuple[int, list[list[CulturalSite]]] | None = None
            for di in range(len(plan)):
                if len(plan[di]) >= MAX_STOPS_PER_DAY:
                    continue
                for pos in range(len(plan[di]) + 1):
                    trial = [list(x) for x in plan]
                    trial[di].insert(pos, s)
                    days, _, dropped = self._materialize(trial, params)
                    if dropped:
                        continue
                    total = self._cost(days, params).total_jpy
                    if total > params.budget_jpy:
                        continue
                    if best is None or total < best[0]:
                        best = (total, trial)
            if best is not None:
                plan = best[1]
        return plan