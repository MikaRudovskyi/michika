import clsx from 'clsx'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../store/auth'

export default function StaffLayout() {
  const role = useAuth((s) => s.user?.role)

  const tabs = [
    { to: 'overview', label: 'Overview' },
    { to: 'bookings', label: 'Bookings' },
    { to: 'properties', label: 'Properties' },
    { to: 'sites', label: 'Cultural sites' },
    { to: 'media', label: 'Photos' },
    { to: 'routes', label: 'User routes' },
    ...(role === 'admin'
      ? [
          { to: 'places', label: 'Regions & cities' },
          { to: 'users', label: 'Users' },
          { to: 'logs', label: 'Audit log' },
        ]
      : []),
  ]

  return (
    <div className="mx-auto max-w-7xl px-6 pb-24">
      <header className="py-12">
        <p className="eyebrow mb-4">{role === 'admin' ? 'Administrator' : 'Manager'}</p>
        <h1 className="text-4xl sm:text-5xl">Back office</h1>
      </header>

      <nav className="flex flex-wrap gap-2 mb-10">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => clsx('chip', isActive && 'chip-active')}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}