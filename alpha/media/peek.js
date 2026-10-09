;(() => {
  const WORD = 'suzanne'
  const EDGES = ['bottom', 'left', 'top', 'right']
  const TURN = { bottom: 0, left: 90, top: 180, right: -90 }
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches
  let typed = '',
    out = false,
    last = null,
    box = null,
    head = null,
    face = null
  const build = () => {
    box = document.createElement('div')
    box.className = 'peek'
    box.setAttribute('aria-hidden', 'true')
    head = document.createElement('div')
    head.className = 'peek-head'
    face = document.createElement('i')
    head.append(face)
    box.append(head)
    document.body.append(box)
  }
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)
  const frameAt = (t) => {
    const keys = [
      [0, 0],
      [700, 0],
      [950, 3],
      [1450, 3],
      [1650, 0],
      [1800, -3],
      [2250, -3],
      [2450, 0]
    ]
    let f = 0
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, a] = keys[i],
        [t1, b] = keys[i + 1]
      if (t >= t0 && t <= t1) f = a + (b - a) * ((t - t0) / (t1 - t0))
    }
    return (Math.round(f) + 36) % 36
  }
  const peek = () => {
    if (!box) build()
    const pick = EDGES.filter((e) => e !== last)
    const edge = pick[Math.floor(Math.random() * pick.length)]
    last = edge
    const W = innerWidth,
      H = innerHeight,
      s = 72
    const along = 0.15 + Math.random() * 0.7
    const x = edge === 'left' ? 0 : edge === 'right' ? W : along * W
    const y = edge === 'top' ? 0 : edge === 'bottom' ? H : along * H
    head.style.left = `${(x - s / 2).toFixed(1)}px`
    head.style.top = `${(y - s / 2).toFixed(1)}px`
    const rot = TURN[edge]
    const place = (dy, tilt, f) => {
      head.style.transform = `rotate(${rot}deg) translateY(${dy.toFixed(2)}px) rotate(${tilt.toFixed(2)}deg)`
      face.style.backgroundPosition = `${((f * 100) / 35).toFixed(3)}% 0`
    }
    out = true
    box.hidden = false
    if (still()) {
      place(-18, 0, 0)
      setTimeout(() => {
        box.hidden = true
        out = false
      }, 2200)
      return
    }
    const hide = s,
      show = -18,
      T = 3100
    const t0 = performance.now()
    const tick = (now) => {
      const t = now - t0
      let dy = show
      if (t < 550) dy = hide + (show - hide) * ease(t / 550)
      else if (t > T - 450) dy = show + (hide - show) * ease(Math.min(1, (t - (T - 450)) / 450))
      const tilt = t > 2500 && t < T - 300 ? Math.sin(((t - 2500) / 300) * Math.PI) * 9 : 0
      place(dy, tilt, frameAt(t))
      if (t < T) requestAnimationFrame(tick)
      else {
        box.hidden = true
        out = false
      }
    }
    place(hide, 0, 0)
    requestAnimationFrame(tick)
  }
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing || e.key.length !== 1) return
    const t = e.target
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
    typed = (typed + e.key.toLowerCase()).slice(-WORD.length)
    if (typed !== WORD) return
    typed = ''
    if (!out) peek()
  })
})()
