import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { EASE } from '../lib/motion'
import { useAuth } from '../store/auth'
import { usePlanner } from '../store/planner'

const LANGS = [
  { code: 'en', label: 'EN' },
  { code: 'uk', label: 'UA' },
  { code: 'ja', label: 'JP' },
]

function LangSwitch() {
  const { i18n } = useTranslation()
  return (
    <div className="flex items-center gap-1 text-xs">
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => i18n.changeLanguage(l.code)}
          className={clsx(
            'px-2 py-1 rounded-full transition-colors duration-500 ease-calm',
            i18n.resolvedLanguage === l.code ? 'text-gold' : 'text-mist hover:text-washi',
          )}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

function Navbar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { token, user, logout } = useAuth()
  const isStaff = user?.role === 'manager' || user?.role === 'admin'

  const link = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'text-sm tracking-wide transition-colors duration-500 ease-calm',
      isActive ? 'text-gold' : 'text-mist hover:text-washi',
    )

  const signOut = () => {
    logout()
    usePlanner.getState().reset()
    navigate('/')
  }

  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="mx-auto max-w-7xl px-6 pt-4">
        <nav className="glass flex items-center justify-between px-6 py-3">
          <Link to="/" className="font-serif text-xl tracking-wide">
            michika<span className="text-gold">.</span>
          </Link>

          <div className="hidden sm:flex items-center gap-8">
            <NavLink to="/discover" className={link}>
              {t('nav.discover')}
            </NavLink>
            <NavLink to="/planner" className={link}>
              {t('nav.planner')}
            </NavLink>
            {token && (
              <NavLink to="/bookings" className={link}>
                {t('bookings.nav')}
              </NavLink>
            )}
            {isStaff && (
              <NavLink to="/staff" className={link}>
                {t('staff.nav', { defaultValue: 'Back office' })}
              </NavLink>
            )}
          </div>

          <div className="flex items-center gap-5">
            <LangSwitch />
            {token ? (
              <div className="flex items-center gap-4">
                <span className="hidden md:block text-xs text-mist">{user?.name}</span>
                <button onClick={signOut} className="text-sm text-mist hover:text-gold transition-colors">
                  {t('nav.logout')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link to="/login" className="text-sm text-mist hover:text-washi transition-colors">
                  {t('nav.login')}
                </Link>
                <Link to="/register" className="btn btn-ghost !py-1.5 !px-4 text-xs">
                  {t('nav.register')}
                </Link>
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  )
}

export default function Layout() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <motion.main
        key={pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="flex-1 pt-24"
      >
        <Outlet />
      </motion.main>
      <footer className="py-10 text-center text-xs text-mist/70 tracking-wide">
        {t('common.footer')}
      </footer>
    </div>
  )
}