import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { staffApi } from '../../lib/api'
import { formatYen } from '../../lib/format'
import { EASE, rise, stagger } from '../../lib/motion'
import { useAuth } from '../../store/auth'

const STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'] as const
const LABEL: Record<(typeof STATUSES)[number], string> = {
  pending: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

function Card({
  label,
  value,
  hint,
  to,
}: {
  label: string
  value: ReactNode
  hint?: string
  to?: string
}) {
  return (
    <motion.div variants={rise} className="glass p-6 flex flex-col">
      <p className="text-xs text-mist mb-3">{label}</p>
      <p className="font-serif text-4xl text-gold">{value}</p>
      {hint && <p className="text-xs text-mist mt-2">{hint}</p>}
      {to && (
        <Link to={to} className="text-xs text-gold mt-4 hover:underline">
          Open →
        </Link>
      )}
    </motion.div>
  )
}

export default function StaffOverview() {
  const isAdmin = useAuth((s) => s.user?.role === 'admin')
  const stats = useQuery({ queryKey: ['staff', 'stats'], queryFn: staffApi.stats, refetchInterval: 60_000 })

  if (stats.isLoading) return <p className="text-mist">Loading…</p>
  if (stats.isError || !stats.data) {
    return <p className="text-red-300/80">{(stats.error as Error | null)?.message ?? 'Could not load statistics.'}</p>
  }

  const s = stats.data
  const total = STATUSES.reduce((n, k) => n + s.bookings[k].count, 0)
  const bookedValue = s.bookings.confirmed.value_jpy + s.bookings.completed.value_jpy

  return (
    <div className="flex flex-col gap-10">
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5"
      >
        <Card label="Awaiting confirmation" value={s.bookings.pending.count} to="/staff/bookings" />
        <Card label="Confirmed" value={s.bookings.confirmed.count} />
        <Card label="Check-ins in 7 days" value={s.upcoming_7d} hint="Pending and confirmed" />
        <Card label="Booked value" value={formatYen(bookedValue)} hint="Confirmed and completed, before payments exist" />
        <Card
          label="Properties"
          value={s.accommodations}
          hint={`${s.accommodations_hidden} hidden`}
          to="/staff/properties"
        />
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="glass p-6">
          <h2 className="text-xl mb-5">Bookings by status</h2>
          <div className="flex flex-col gap-4">
            {STATUSES.map((k) => {
              const n = s.bookings[k].count
              return (
                <div key={k}>
                  <div className="flex justify-between text-xs text-mist mb-2">
                    <span>{LABEL[k]}</span>
                    <span className="text-washi">
                      {n} · {formatYen(s.bookings[k].value_jpy)}
                    </span>
                  </div>
                  <div className="h-px bg-white/10 relative">
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-gold"
                      initial={{ width: 0 }}
                      animate={{ width: `${total ? (n / total) * 100 : 0}%` }}
                      transition={{ duration: 0.9, ease: EASE }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="glass p-6">
          <h2 className="text-xl mb-5">Top properties</h2>
          {s.top_properties.length === 0 ? (
            <p className="text-sm text-mist">Confirmed bookings will appear here.</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {s.top_properties.map((p, i) => (
                <li key={p.name} className="flex items-baseline justify-between gap-4">
                  <span className="text-sm">
                    <span className="text-mist mr-3">{i + 1}</span>
                    {p.name}
                  </span>
                  <span className="text-xs text-mist whitespace-nowrap">
                    {p.bookings} · <span className="text-washi">{formatYen(p.value_jpy)}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {isAdmin && s.admin && (
        <div>
          <h2 className="text-xl mb-5">Platform</h2>
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Card
              label="Accounts"
              value={s.admin.users}
              hint={`${s.admin.managers} managers · ${s.admin.blocked} blocked`}
              to="/staff/users"
            />
            <Card
              label="Cultural sites"
              value={s.admin.sites}
              hint={`${s.admin.sites_unavailable} temporarily unavailable`}
              to="/staff/sites"
            />
            <Card label="Saved routes" value={s.admin.itineraries} to="/staff/routes" />
            <Card
              label="Places"
              value={s.admin.cities}
              hint={`cities in ${s.admin.regions} region(s)`}
              to="/staff/places"
            />
          </motion.div>
        </div>
      )}
    </div>
  )
}