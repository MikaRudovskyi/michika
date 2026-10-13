import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../store/auth'

const RANK = { user: 1, manager: 2, admin: 3 } as const

export default function RequireRole({
  min,
  children,
}: {
  min: 'manager' | 'admin'
  children: ReactNode
}) {
  const token = useAuth((s) => s.token)
  const user = useAuth((s) => s.user)
  if (!token) return <Navigate to="/login" replace />
  if (!user || RANK[user.role] < RANK[min]) return <Navigate to="/" replace />
  return <>{children}</>
}