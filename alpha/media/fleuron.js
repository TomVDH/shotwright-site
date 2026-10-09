;(() => {
  const f = document.querySelector('.fleuron')
  if (!f || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const img = f.firstElementChild
  f.classList.add('live')
  let pull = 0,
    x = 0,
    v = 0,
    spin = 0,
    raf = 0,
    seen = false,
    wheelT = 0,
    touchY = null,
    t = 0
  const root = document.documentElement
  const atBottom = () => innerHeight + scrollY >= root.scrollHeight - 2
  const tick = (now) => {
    raf = 0
    if (touchY === null && now - wheelT > 160) pull *= 0.8
    v += (Math.min(1.2, pull) - x) * 0.16
    v *= 0.74
    x += v
    t += 1
    spin += 1 / 6 + Math.max(0, x) * 2.2
    const frame = Math.floor(spin) % 36
    img.style.backgroundPosition = `${((frame * 100) / 35).toFixed(3)}% 0`
    const up = Math.max(0, x),
      dn = Math.min(0, x)
    const wob = up > 0.8 ? Math.sin(t * 0.9) * 10 * (up - 0.8) * 5 : 0
    img.style.transform = `translateY(${(-up * 30).toFixed(2)}px) rotate(${wob.toFixed(2)}deg) scale(${(1 - up * 0.16 - dn * 0.45).toFixed(3)}, ${(1 + up * 0.34 + dn * 0.6).toFixed(3)})`
    if (seen || Math.abs(x) > 2e-3 || Math.abs(v) > 2e-3) raf = requestAnimationFrame(tick)
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick)
  }
  new IntersectionObserver(([e]) => {
    seen = e.isIntersecting
    if (seen) kick()
  }).observe(f)
  addEventListener(
    'wheel',
    (e) => {
      if (e.deltaY <= 0 || !atBottom()) return
      pull = Math.min(1.4, pull + Math.min(e.deltaY, 120) / 500)
      wheelT = performance.now()
      kick()
    },
    { passive: true }
  )
  addEventListener(
    'touchstart',
    (e) => {
      touchY = atBottom() && e.touches.length === 1 ? e.touches[0].clientY : null
    },
    { passive: true }
  )
  addEventListener(
    'touchmove',
    (e) => {
      if (touchY === null) return
      if (!atBottom()) {
        touchY = e.touches[0].clientY
        return
      }
      pull = Math.max(0, touchY - e.touches[0].clientY) / 200
      kick()
    },
    { passive: true }
  )
  const letGo = () => {
    touchY = null
    kick()
  }
  addEventListener('touchend', letGo, { passive: true })
  addEventListener('touchcancel', letGo, { passive: true })
})()
