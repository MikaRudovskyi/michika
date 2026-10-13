import { create } from 'zustand'
import type { Diff, Itinerary, PlanForm, Prefs } from '../lib/types'

const DEFAULT_FORM: PlanForm = {
  days: 3,
  budget_jpy: 150_000,
  travelers: 1,
  interests: [],
  start_date: '',
}

interface PlannerState {
  form: PlanForm
  prefilled: boolean
  itinerary: Itinerary | null
  diff: Diff | null
  patch: (partial: Partial<PlanForm>) => void
  prefill: (prefs: Prefs) => void
  setResult: (itinerary: Itinerary, diff: Diff | null) => void
  reset: () => void
}

export const usePlanner = create<PlannerState>()((set, get) => ({
  form: DEFAULT_FORM,
  prefilled: false,
  itinerary: null,
  diff: null,
  patch: (partial) => set((s) => ({ form: { ...s.form, ...partial } })),
  prefill: (prefs) => {
    if (get().prefilled) return
    set({
      prefilled: true,
      form: {
        ...DEFAULT_FORM,
        days: prefs.trip_days,
        budget_jpy: prefs.budget_jpy,
        interests: prefs.interests,
      },
    })
  },
  setResult: (itinerary, diff) => set({ itinerary, diff }),
  reset: () => set({ form: DEFAULT_FORM, prefilled: false, itinerary: null, diff: null }),
}))