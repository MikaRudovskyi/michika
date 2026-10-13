import clsx from 'clsx'
import { useState } from 'react'
import Modal from './Modal'

interface Props {
  title: string
  message: string
  confirmLabel: string
  reasonLabel?: string
  danger?: boolean
  pending?: boolean
  error?: string | null
  onConfirm: (reason: string) => void
  onClose: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  reasonLabel,
  danger,
  pending,
  error,
  onConfirm,
  onClose,
}: Props) {
  const [reason, setReason] = useState('')

  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-mist leading-relaxed">{message}</p>

      {reasonLabel && (
        <textarea
          className="input mt-5"
          rows={2}
          maxLength={300}
          placeholder={reasonLabel}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}

      {error && <p className="text-sm text-red-300/80 mt-4">{error}</p>}

      <div className="flex justify-end gap-3 mt-8">
        <button className="btn btn-ghost" onClick={onClose} disabled={pending}>
          Back
        </button>
        <button
          className={clsx(
            'btn',
            danger ? 'bg-red-300/90 text-sumi font-medium hover:bg-red-200' : 'btn-primary',
          )}
          disabled={pending}
          onClick={() => onConfirm(reason.trim())}
        >
          {pending ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}