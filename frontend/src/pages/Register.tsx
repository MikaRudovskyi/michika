import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import InterestPicker from '../components/InterestPicker'
import { useLang } from '../hooks/useLang'
import { api } from '../lib/api'
import { formatYen } from '../lib/format'
import { useAuth } from '../store/auth'

export default function Register() {
  const { t } = useTranslation()
  const lang = useLang()
  const navigate = useNavigate()
  const setSession = useAuth((s) => s.setSession)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [budget, setBudget] = useState(150_000)
  const [days, setDays] = useState(5)

  const register = useMutation({
    mutationFn: async () => {
      await api.register({
        email,
        password,
        name,
        locale: lang,
        prefs: { interests, budget_jpy: budget, trip_days: days },
      })
      const { access_token } = await api.login(email, password)
      const user = await api.me(access_token)
      setSession(access_token, user)
    },
    onSuccess: () => navigate('/planner', { replace: true }),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    register.mutate()
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-4xl mb-3">{t('auth.registerTitle')}</h1>
      <p className="text-mist text-sm mb-10">{t('auth.registerSub')}</p>

      <form onSubmit={submit} className="glass p-8 flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <input className="input" required placeholder={t('auth.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" type="email" required placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="input"
            type="password"
            required
            minLength={8}
            placeholder={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div>
          <p className="text-xs text-mist mb-3">{t('auth.interests')}</p>
          <InterestPicker value={interests} onChange={setInterests} />
        </div>

        <div>
          <p className="text-xs text-mist mb-3 flex justify-between">
            <span>{t('auth.budget')}</span>
            <span className="text-washi">{formatYen(budget)}</span>
          </p>
          <input type="range" min={30_000} max={1_000_000} step={10_000} value={budget} onChange={(e) => setBudget(+e.target.value)} />
        </div>

        <div>
          <p className="text-xs text-mist mb-3 flex justify-between">
            <span>{t('auth.tripDays')}</span>
            <span className="text-washi">{days}</span>
          </p>
          <input type="range" min={1} max={21} value={days} onChange={(e) => setDays(+e.target.value)} />
        </div>

        {register.isError && <p className="text-sm text-red-300/80">{register.error.message}</p>}
        <button className="btn btn-primary" disabled={register.isPending}>
          {register.isPending ? t('common.loading') : t('auth.signUp')}
        </button>
      </form>

      <p className="text-sm text-mist mt-6 text-center">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="text-gold hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  )
}