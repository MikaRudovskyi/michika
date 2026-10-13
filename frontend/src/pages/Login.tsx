import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const setSession = useAuth((s) => s.setSession)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useMutation({
    mutationFn: async () => {
      const { access_token } = await api.login(email, password)
      const user = await api.me(access_token)
      setSession(access_token, user)
    },
    onSuccess: () => {
      const from = (location.state as { from?: string } | null)?.from ?? '/planner'
      navigate(from, { replace: true })
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate()
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-4xl mb-3">{t('auth.loginTitle')}</h1>
      <p className="text-mist text-sm mb-10">{t('auth.loginSub')}</p>

      <form onSubmit={submit} className="glass p-8 flex flex-col gap-4">
        <input
          className="input"
          type="email"
          required
          placeholder={t('auth.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="input"
          type="password"
          required
          placeholder={t('auth.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {login.isError && <p className="text-sm text-red-300/80">{login.error.message}</p>}
        <button className="btn btn-primary mt-2" disabled={login.isPending}>
          {login.isPending ? t('common.loading') : t('auth.signIn')}
        </button>
      </form>

      <p className="text-sm text-mist mt-6 text-center">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="text-gold hover:underline">
          {t('auth.signUp')}
        </Link>
      </p>
    </div>
  )
}