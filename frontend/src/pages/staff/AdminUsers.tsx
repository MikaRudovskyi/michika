import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { useDeferredValue, useState } from 'react'
import type { FormEvent } from 'react'
import ConfirmDialog from '../../components/staff/ConfirmDialog'
import Modal from '../../components/staff/Modal'
import { staffApi } from '../../lib/api'
import type { AdminUser, Role } from '../../lib/types.staff'
import { useAuth } from '../../store/auth'

type Kind = 'block' | 'unblock' | 'promote' | 'demote'
interface Action {
  kind: Kind
  user: AdminUser
}

const ROLE_STYLE: Record<Role, string> = {
  admin: 'text-gold border-gold/40',
  manager: 'text-emerald-300 border-emerald-300/30',
  user: 'text-mist border-white/15',
}

const COPY: Record<Kind, { title: string; message: (u: AdminUser) => string; confirm: string; reason?: boolean; danger?: boolean }> = {
  block: {
    title: 'Block account',
    message: (u) => `${u.email} will be signed out of every protected action immediately and cannot use the platform until unblocked.`,
    confirm: 'Block',
    reason: true,
    danger: true,
  },
  unblock: {
    title: 'Unblock account',
    message: (u) => `${u.email} will be able to use the platform again.`,
    confirm: 'Unblock',
  },
  promote: {
    title: 'Make manager',
    message: (u) => `${u.email} will get access to the back office: bookings and cultural sites.`,
    confirm: 'Make manager',
  },
  demote: {
    title: 'Remove manager rights',
    message: (u) => `${u.email} becomes a regular user. Properties they own stay in the system and remain visible to administrators.`,
    confirm: 'Remove rights',
    danger: true,
  },
}

export default function AdminUsers() {
  const qc = useQueryClient()
  const meId = useAuth((s) => s.user?.id)

  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const q = useDeferredValue(search)
  const [action, setAction] = useState<Action | null>(null)
  const [creating, setCreating] = useState(false)

  const users = useQuery({
    queryKey: ['admin', 'users', role, status, q],
    queryFn: () =>
      staffApi.users({ role: role || undefined, status: status || undefined, q: q.trim() || undefined }),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] })

  const act = useMutation({
    mutationFn: ({ kind, user, reason }: Action & { reason: string }) => {
      switch (kind) {
        case 'block':
          return staffApi.blockUser(user.id, reason)
        case 'unblock':
          return staffApi.unblockUser(user.id)
        case 'promote':
          return staffApi.setRole(user.id, 'manager')
        case 'demote':
          return staffApi.setRole(user.id, 'user')
      }
    },
    onSuccess: () => {
      setAction(null)
      refresh()
    },
  })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <input className="input !w-64" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input !w-40" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="" className="bg-charcoal">All roles</option>
          <option value="user" className="bg-charcoal">Users</option>
          <option value="manager" className="bg-charcoal">Managers</option>
          <option value="admin" className="bg-charcoal">Admins</option>
        </select>
        <select className="input !w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="" className="bg-charcoal">Any status</option>
          <option value="active" className="bg-charcoal">Active</option>
          <option value="blocked" className="bg-charcoal">Blocked</option>
        </select>
        <button className="btn btn-primary ml-auto" onClick={() => setCreating(true)}>
          New manager
        </button>
      </div>

      {users.isLoading && <p className="text-mist">Loading…</p>}
      {users.isError && <p className="text-red-300/80">{(users.error as Error).message}</p>}

      {users.data && (
        <>
          <p className="text-xs text-mist mb-4">{users.data.total} accounts</p>
          <div className="flex flex-col gap-3">
            {users.data.items.map((u) => {
              const locked = u.role === 'admin' || u.id === meId
              const blocked = u.status === 'blocked'
              return (
                <div key={u.id} className="glass p-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="min-w-[14rem] flex-1">
                    <p className="text-lg font-serif leading-snug">{u.name}</p>
                    <p className="text-xs text-mist mt-1">{u.email}</p>
                  </div>

                  <span className={clsx('text-xs border rounded-full px-3 py-1', ROLE_STYLE[u.role])}>{u.role}</span>
                  <span
                    className={clsx(
                      'text-xs border rounded-full px-3 py-1',
                      blocked ? 'text-red-300/80 border-red-300/20' : 'text-emerald-300 border-emerald-300/30',
                    )}
                  >
                    {u.status}
                  </span>

                  {!locked && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn btn-ghost !py-1.5 !px-4 text-xs"
                        onClick={() => setAction({ kind: u.role === 'manager' ? 'demote' : 'promote', user: u })}
                      >
                        {u.role === 'manager' ? 'Remove manager' : 'Make manager'}
                      </button>
                      <button
                        className="btn btn-ghost !py-1.5 !px-4 text-xs"
                        onClick={() => setAction({ kind: blocked ? 'unblock' : 'block', user: u })}
                      >
                        {blocked ? 'Unblock' : 'Block'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {users.data.items.length === 0 && (
              <div className="glass p-10 text-center text-sm text-mist">No accounts match.</div>
            )}
          </div>
        </>
      )}

      {action && (
        <ConfirmDialog
          title={COPY[action.kind].title}
          message={COPY[action.kind].message(action.user)}
          confirmLabel={COPY[action.kind].confirm}
          reasonLabel={COPY[action.kind].reason ? 'Reason (optional, kept in the audit log)' : undefined}
          danger={COPY[action.kind].danger}
          pending={act.isPending}
          error={act.error?.message ?? null}
          onConfirm={(reason) => act.mutate({ ...action, reason })}
          onClose={() => {
            act.reset()
            setAction(null)
          }}
        />
      )}

      {creating && (
        <NewManagerDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function NewManagerDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  const create = useMutation({
    mutationFn: () => staffApi.createManager({ email: email.trim(), name: name.trim(), password }),
    onSuccess: onCreated,
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    create.mutate()
  }

  return (
    <Modal title="New manager account" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <input className="input" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="input" required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input
          className="input"
          type="password"
          required
          minLength={8}
          placeholder="Temporary password (min. 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {create.isError && <p className="text-sm text-red-300/80">{create.error.message}</p>}
        <div className="flex justify-end gap-3 mt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={create.isPending}>
            Back
          </button>
          <button className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create manager'}
          </button>
        </div>
      </form>
    </Modal>
  )
}