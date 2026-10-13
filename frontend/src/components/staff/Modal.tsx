import clsx from 'clsx'
import { motion } from 'framer-motion'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { EASE } from '../../lib/motion'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

export default function Modal({ title, onClose, children, wide }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-sumi/80 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      onClick={onClose}
    >
      <motion.div
        className={clsx(
          'glass !bg-charcoal/95 w-full p-8 max-h-[90vh] overflow-y-auto',
          wide ? 'max-w-3xl' : 'max-w-md',
        )}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <h2 className="text-2xl leading-snug">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-mist hover:text-gold transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}