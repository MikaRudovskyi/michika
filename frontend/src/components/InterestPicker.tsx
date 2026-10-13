import clsx from 'clsx'
import { useTranslation } from 'react-i18next'

export const INTERESTS = [
  'temple',
  'castle',
  'garden',
  'museum',
  'tea_ceremony',
  'zen',
  'samurai',
  'unesco',
  'history',
  'art',
]

interface Props {
  value: string[]
  onChange: (next: string[]) => void
}

export default function InterestPicker({ value, onChange }: Props) {
  const { t } = useTranslation()
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key])

  return (
    <div className="flex flex-wrap gap-2">
      {INTERESTS.map((key) => (
        <button
          type="button"
          key={key}
          onClick={() => toggle(key)}
          className={clsx('chip', value.includes(key) && 'chip-active')}
        >
          {t(`tag.${key}`)}
        </button>
      ))}
    </div>
  )
}