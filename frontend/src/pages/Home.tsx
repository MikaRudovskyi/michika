import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import background1x from '../assets/michika-bg-1000.png'
import background2x from '../assets/michika-bg-2000.png'
import { EASE, rise, stagger } from '../lib/motion'

export default function Home() {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const hero = useRef<HTMLElement>(null)

  // The logo drifts up slowly and fades out as the hero scrolls away.
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] })
  const drift = useTransform(scrollYProgress, [0, 1], [0, 90])
  const fade = useTransform(scrollYProgress, [0, 0.85], [1, 0])

  const features = [
    { t: t('home.f1t'), d: t('home.f1d') },
    { t: t('home.f2t'), d: t('home.f2d') },
    { t: t('home.f3t'), d: t('home.f3d') },
  ]

  return (
    <>
      <section
        ref={hero}
        className="relative overflow-hidden min-h-[calc(100vh-6rem)] flex items-center hero-bg"
      >
        {/* Brand mark as a background. Decorative, so it is hidden from assistive technology. */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center lg:justify-end"
          style={reduceMotion ? undefined : { y: drift, opacity: fade }}
        >
          <div className="relative w-[min(92vw,620px)] lg:w-[min(50vw,720px)] lg:mr-[3vw] opacity-[0.2] sm:opacity-[0.3] lg:opacity-[0.7]">
            <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(closest-side,rgba(212,175,55,0.12),transparent)]" />
            <motion.img
              src={background1x}
              srcSet={`${background1x} 1000w, ${background2x} 2000w`}
              sizes="(min-width: 1024px) min(50vw, 720px), min(92vw, 620px)"
              width={1000}
              height={1000}
              alt=""
              draggable={false}
              decoding="async"
              className="relative w-full h-auto select-none"
              initial={reduceMotion ? false : { opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 2.2, ease: EASE, delay: 0.2 }}
            />
          </div>
        </motion.div>

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="relative mx-auto max-w-7xl w-full px-6 py-20"
        >
          <motion.p variants={rise} className="eyebrow mb-8">
            {t('home.eyebrow')}
          </motion.p>
          <motion.h1 variants={rise} className="text-5xl sm:text-7xl leading-[1.1] font-medium">
            {t('home.title1')}
            <br />
            <span className="text-gold">{t('home.title2')}</span>
          </motion.h1>
          <motion.p variants={rise} className="mt-8 max-w-xl text-lg text-mist leading-relaxed">
            {t('home.subtitle')}
          </motion.p>
          <motion.div variants={rise} className="mt-12 flex flex-wrap gap-4">
            <Link to="/planner" className="btn btn-primary">
              {t('home.cta')}
            </Link>
            <Link to="/discover" className="btn btn-ghost">
              {t('home.ctaSecondary')}
            </Link>
          </motion.div>
        </motion.div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24">
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid gap-6 md:grid-cols-3"
        >
          {features.map((f, i) => (
            <motion.div key={f.t} variants={rise} className="glass p-8">
              <p className="font-serif text-gold text-sm mb-6">0{i + 1}</p>
              <h3 className="text-2xl mb-3">{f.t}</h3>
              <p className="text-sm text-mist leading-relaxed">{f.d}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </>
  )
}