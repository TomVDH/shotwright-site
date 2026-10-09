;(() => {
  if (!window.THREE) return
  const D = 180 / Math.PI
  const AXES = {
    yaw: { c: '#3d8bff', l: 'Z', key: 'KeyY', r: 0.78, at: 0.25 },
    tilt: { c: '#ff4757', l: 'X', key: 'KeyT', r: 0.62, at: 1.6 },
    roll: { c: '#2ee59d', l: 'Y', key: 'KeyR', r: 0.94, at: 1.15 }
  }
  const HOME = { x: 0.2, z: 2.6, h: 1.5, yaw: Math.PI, pitch: -0.08, roll: 0, focal: 35 }
  const r1 = (v) => Math.round(v * 10) / 10
  const sgn = (d) => (r1(d) < 0 ? '−' : '+') + Math.abs(r1(d)).toFixed(1)
  const fmt = (d) => (r1(d) < 0 ? '−' : '') + Math.abs(r1(d)).toFixed(1)
  const wrap180 = (d) => 180 - ((((180 - d) % 360) + 360) % 360)
  const el = (tag, cls, parent) => {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    parent?.append(e)
    return e
  }
  function mount(host, opts = {}) {
    const reduce = !!opts.reduce
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace
    else renderer.outputEncoding = THREE.sRGBEncoding
    host.append(renderer.domElement)
    const ui = el('div', 'gz-ui', host)
    const guide = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    guide.setAttribute('class', 'gz-guide')
    guide.setAttribute('aria-hidden', 'true')
    ui.append(guide)
    const big = el('div', 'gz-big', ui)
    big.setAttribute('aria-live', 'polite')
    const vals = el('div', 'gz-vals', ui)
    const mon = el('div', 'gz-mon', ui)
    const monT = el('span', '', mon)
    const plabs = [0, 90, 180, -90].map((d) => {
      const s = el('span', 'gz-plab', ui)
      s.textContent = (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d) + '°'
      return s
    })
    const pips = {}
    for (const a in AXES) {
      const p = el('span', 'gz-pip', ui)
      p.dataset.axis = a
      p.style.setProperty('--c', AXES[a].c)
      el('i', '', p).textContent = AXES[a].l
      pips[a] = p
    }
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#18181b')
    scene.add(new THREE.HemisphereLight('#f4f1ea', '#2a2a30', 0.85))
    const sun = new THREE.DirectionalLight('#ffffff', 0.55)
    sun.position.set(4, 8, 3)
    scene.add(sun)
    scene.add(new THREE.GridHelper(20, 20, '#3a3a40', '#2a2a2f'))
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshLambertMaterial({ color: '#202024' }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -1e-3
    scene.add(floor)
    const box = (w, h, d, x, y, z, c) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }))
      m.position.set(x, y, z)
      scene.add(m)
      return m
    }
    const actor = (x, z, c) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.2, 6, 16), new THREE.MeshLambertMaterial({ color: c }))
      m.position.set(x, 0.82, z)
      scene.add(m)
    }
    actor(-0.7, -1, '#a78bfa')
    actor(0.8, -1.3, '#f5a524')
    box(1, 0.75, 0.7, 0.05, 0.375, -1.15, '#d9c8ad')
    box(6, 2.6, 0.15, 0, 1.3, -3, '#cfc9be')
    const fan = new THREE.Group()
    fan.position.set(0.75, 0.295 * 0.3, 3.25)
    fan.rotation.y = Math.PI
    fan.scale.setScalar(0.3)
    scene.add(fan)
    const fanQ0 = fan.quaternion.clone(),
      fanQ1 = new THREE.Quaternion(),
      fanTilt = new THREE.Quaternion()
    let fanState = 0,
      fanT = 0
    const fanLoad = () => {
      if (fanState || !THREE.GLTFLoader) return
      fanState = 1
      new THREE.GLTFLoader().load(
        'media/props/suzanne.glb',
        (g) => {
          g.scene.traverse((o) => {
            if (o.isMesh) o.material = new THREE.MeshLambertMaterial({ color: '#a8865c' })
          })
          fan.add(g.scene)
          fanState = 2
          kick()
        },
        void 0,
        () => {}
      )
    }
    const fanLook = (now) => {
      if (fanState === 2) {
        const c = fan.position.clone().project(lensCam)
        const dist = fan.position.distanceTo(lensCam.position)
        const frac = (0.41 * 0.3) / (dist * Math.tan((lensCam.fov * Math.PI) / 360))
        const inside = c.z < 1 && Math.abs(c.x) < 0.7 && Math.abs(c.y) < 0.7
        if (inside && frac > 0.22 && !reduce) {
          fanState = 3
          fanT = now
          tmp.position.copy(fan.position)
          tmp.quaternion.identity()
          tmp.lookAt(lensCam.position)
          fanQ1.copy(tmp.quaternion)
        }
      }
      if (fanState !== 3) return
      const k = Math.min(1, (now - fanT) / 800),
        e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      const w = Math.min(1, Math.max(0, (now - fanT - 900) / 500))
      fan.quaternion.copy(fanQ0).slerp(fanQ1, e * 0.92)
      fanTilt.setFromAxisAngle(ZV, 0.22 * Math.sin(w * Math.PI * 0.5))
      fan.quaternion.multiply(fanTilt)
      if (w < 1) need = Math.max(need, 2)
      else fanState = 4
    }
    const view = new THREE.PerspectiveCamera(42, 1, 0.05, 100)
    const cam = { ...HOME }
    const dirOf = () =>
      new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch))
    const posOf = () => new THREE.Vector3(cam.x, cam.h, cam.z)
    const lensCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 100)
    const rig = new THREE.Group()
    scene.add(rig)
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.46), new THREE.MeshLambertMaterial({ color: '#9ca3af' }))
    rig.add(body)
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 20), new THREE.MeshLambertMaterial({ color: '#3f3f46' }))
    lens.rotation.x = Math.PI / 2
    lens.position.z = 0.29
    rig.add(lens)
    const hull = new THREE.Mesh(body.geometry, new THREE.MeshBasicMaterial({ color: '#ff9f1c', side: THREE.BackSide }))
    hull.raycast = () => {}
    rig.add(hull)
    const cone = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#a1a1aa', transparent: true, opacity: 0.7 })
    )
    scene.add(cone)
    const rings = {}
    const ZV = new THREE.Vector3(0, 0, 1)
    for (const a in AXES) {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.014, 6, 160),
        new THREE.MeshBasicMaterial({ color: AXES[a].c, depthTest: false, transparent: true, opacity: 0.8 })
      )
      const hit = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 6, 96), new THREE.MeshBasicMaterial({ visible: false }))
      hit.userData.axis = a
      m.add(hit)
      m.renderOrder = 11
      m.scale.setScalar(AXES[a].r)
      scene.add(m)
      rings[a] = { m, hit, cur: 0.8 }
    }
    const prot = new THREE.Group()
    prot.visible = false
    scene.add(prot)
    const protTicks = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#e4e4e7', transparent: true, opacity: 0.6, depthTest: false })
    )
    const protFan = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
      })
    )
    const protLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false })
    )
    for (const o of [protFan, protTicks, protLines]) {
      o.renderOrder = 12
      prot.add(o)
    }
    let W = 1,
      H = 1
    const place = () => {
      const near = W < 600
      const r = near ? 6.4 : 8.4 * Math.max(1, 1.5 / view.aspect)
      const az = 0.75,
        elv = 0.62,
        t = near ? [0.2, 1.1, 1.7] : [0.15, 0.8, 0.9]
      view.position.set(t[0] + r * Math.cos(elv) * Math.sin(az), t[1] + r * Math.sin(elv), t[2] + r * Math.cos(elv) * Math.cos(az))
      view.lookAt(t[0], t[1], t[2])
    }
    const size = () => {
      W = host.clientWidth || 1
      H = host.clientHeight || 1
      renderer.setSize(W, H)
      view.aspect = W / H
      view.updateProjectionMatrix()
      place()
      kick()
    }
    const scr = (v) => {
      const p = v.clone().project(view)
      return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H, p.z]
    }
    const axisVec = (a) => {
      if (a === 'yaw') return new THREE.Vector3(0, 1, 0)
      if (a === 'tilt')
        return new THREE.Vector3()
          .crossVectors(new THREE.Vector3(Math.sin(cam.yaw), 0, Math.cos(cam.yaw)), new THREE.Vector3(0, 1, 0))
          .normalize()
      return dirOf()
    }
    const tmp = new THREE.Object3D()
    const quatOf = () => {
      tmp.position.set(0, 0, 0)
      tmp.quaternion.identity()
      tmp.updateMatrixWorld()
      tmp.lookAt(dirOf())
      tmp.rotateZ(cam.roll)
      return tmp.quaternion.clone()
    }
    let op = null,
      hover = null,
      flashT = reduce ? -1e9 : 0,
      hideT = 0,
      need = 0,
      raf = 0,
      seen = false,
      ret = null
    const vals0 = () => ({ yaw: wrap180(cam.yaw * D), tilt: cam.pitch * D, roll: wrap180(cam.roll * D) })
    const showBig = () => {
      const a = op.axis
      clearTimeout(hideT)
      big.innerHTML = `<span class="ax" style="color:${AXES[a].c}">Δ ${a}</span><span class="num">${sgn(op.total)}°</span>`
      big.classList.add('on')
    }
    const hideBig = () => {
      clearTimeout(hideT)
      hideT = setTimeout(() => big.classList.remove('on'), 700)
    }
    const apply = () => {
      let d = op.ang * op.sign
      if (op.ctrl) {
        const st = op.shift ? 1 : 5
        d = Math.round(d / st) * st
      }
      op.total = d
      cam.yaw = op.base.yaw
      cam.pitch = op.base.pitch
      cam.roll = op.base.roll
      if (op.axis === 'yaw') cam.yaw += d / D
      if (op.axis === 'tilt') cam.pitch = Math.max(-1.55, Math.min(1.55, op.base.pitch + d / D))
      if (op.axis === 'roll') cam.roll += d / D
      showBig()
      kick()
    }
    const centre = () => scr(posOf())
    const start = (axis, how, x, y) => {
      ret = null
      const [cx, cy] = centre()
      if (Math.hypot(x - cx, y - cy) < 40) {
        x = cx + 90
        y = cy
      }
      const toView = view.position.clone().sub(posOf())
      op = {
        axis,
        how,
        base: { yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll },
        vx: x,
        vy: y,
        phi: Math.atan2(-(y - cy), x - cx),
        ang: 0,
        total: 0,
        sign: axisVec(axis).dot(toView) >= 0 ? 1 : -1,
        shift: false,
        ctrl: false,
        touch: how === 'touch',
        moved: 0,
        t0: performance.now()
      }
      const ax = axisVec(axis)
      let ref = (axis === 'roll' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)).applyQuaternion(quatOf())
      ref.addScaledVector(ax, -ref.dot(ax))
      if (ref.lengthSq() < 1e-6) ref = new THREE.Vector3(1, 0, 0).applyQuaternion(quatOf())
      op.pAxis = ax
      op.pRef = ref.normalize()
      host.classList.add('turning')
      apply()
    }
    const move = (x, y, f) => {
      if (!op) return
      const [cx, cy] = centre()
      op.moved += Math.abs(x - op.vx) + Math.abs(y - op.vy)
      op.vx = x
      op.vy = y
      const phi = Math.atan2(-(y - cy), x - cx)
      const dphi = Math.atan2(Math.sin(phi - op.phi), Math.cos(phi - op.phi))
      op.phi = phi
      op.ang += dphi * D * f
      apply()
    }
    const finish = (keep) => {
      if (!op) return
      if (!keep) Object.assign(cam, op.base)
      op = null
      host.classList.remove('turning')
      if (document.pointerLockElement === host) document.exitPointerLock()
      hideBig()
      kick()
    }
    const ray = new THREE.Raycaster(),
      ndc = new THREE.Vector2()
    const pick = (x, y) => {
      ndc.set((x / W) * 2 - 1, -(y / H) * 2 + 1)
      ray.setFromCamera(ndc, view)
      const hits = ray.intersectObjects([body, ...Object.values(rings).map((r) => r.hit)], false)
      if (!hits[0]) return null
      return hits[0].object === body ? 'body' : hits[0].object.userData.axis
    }
    const local = (e) => {
      const r = host.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }
    const target = (e, x, y) => e.target.closest?.('.gz-pip')?.dataset.axis || pick(x, y)
    const flash = () => {
      if (!reduce) flashT = performance.now()
      kick()
    }
    let last = null
    host.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return
      const [x, y] = local(e)
      if (op) {
        finish(e.button !== 2)
        return
      }
      if (e.button !== 0) return
      const t = target(e, x, y)
      if (!t) return
      if (t === 'body') {
        flash()
        return
      }
      e.preventDefault()
      host.focus({ preventScroll: true })
      try {
        host.setPointerCapture(e.pointerId)
      } catch (err) {}
      start(t, 'drag', x, y)
      if (e.pointerType === 'mouse' && host.requestPointerLock && !opts.noLock) {
        try {
          const p = host.requestPointerLock()
          if (p && p.catch) p.catch(() => {})
        } catch (err) {}
      }
    })
    host.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return
      const [x, y] = local(e)
      if (op) {
        if (op.how === 'drag' && !e.buttons) return
        op.shift = e.shiftKey
        op.ctrl = e.ctrlKey
        const f = e.shiftKey ? 0.1 : 1
        if (document.pointerLockElement === host) move(op.vx + e.movementX, op.vy + e.movementY, f)
        else move(x, y, f)
        return
      }
      last = [x, y]
      const t = target(e, x, y)
      const h = t && t !== 'body' ? t : null
      host.style.cursor = t ? (t === 'body' ? 'pointer' : 'grab') : ''
      if (h !== hover) {
        hover = h
        kick()
      }
    })
    const up = (e) => {
      if (e.pointerType === 'touch' || !op || op.how !== 'drag') return
      finish(true)
    }
    host.addEventListener('pointerup', up)
    host.addEventListener('pointercancel', up)
    host.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse' || op) return
      hover = null
      kick()
    })
    host.addEventListener('contextmenu', (e) => {
      if (op) e.preventDefault()
    })
    let tid = null
    host.addEventListener(
      'touchstart',
      (e) => {
        if (op || e.touches.length !== 1) return
        const t0 = e.touches[0]
        const [x, y] = local(t0)
        const t = target(e, x, y)
        if (t === 'body') {
          flash()
          return
        }
        if (!t) return
        e.preventDefault()
        tid = t0.identifier
        start(t, 'touch', x, y)
      },
      { passive: false }
    )
    host.addEventListener(
      'touchmove',
      (e) => {
        if (!op || tid === null) return
        const t = [...e.changedTouches].find((q) => q.identifier === tid)
        if (!t) return
        e.preventDefault()
        const [x, y] = local(t)
        move(x, y, 1)
      },
      { passive: false }
    )
    const tend = (e) => {
      if (tid === null || ![...e.changedTouches].some((q) => q.identifier === tid)) return
      tid = null
      finish(e.type === 'touchend')
    }
    host.addEventListener('touchend', tend)
    host.addEventListener('touchcancel', tend)
    const KEYS = { KeyR: 'roll', KeyT: 'tilt', KeyY: 'yaw' }
    host.addEventListener('keydown', (e) => {
      if (op) {
        if (e.key === 'Shift' || e.key === 'Control') {
          op.shift = e.shiftKey
          op.ctrl = e.ctrlKey
          apply()
          return
        }
        if (e.code === 'Escape') {
          e.preventDefault()
          finish(false)
          return
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault()
          finish(true)
          return
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          op.moved += 10
          op.ang += (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1) * (e.shiftKey ? 1 : 5) * op.sign
          op.shift = e.shiftKey
          apply()
          return
        }
        if (KEYS[e.code] && !e.repeat) e.preventDefault()
        return
      }
      const a = KEYS[e.code]
      if (!a || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault()
      const [x, y] = last || [centre()[0] + 90, centre()[1]]
      start(a, 'key', x, y)
      flash()
    })
    host.addEventListener('keyup', (e) => {
      if (!op) return
      if (e.key === 'Shift' || e.key === 'Control') {
        op.shift = e.shiftKey
        op.ctrl = e.ctrlKey
        apply()
        return
      }
      if (op.how !== 'key' || KEYS[e.code] !== op.axis) return
      if (performance.now() - op.t0 < 250 && op.moved < 6) {
        op.how = 'tap'
        return
      }
      finish(true)
    })
    host.addEventListener('blur', () => finish(true))
    const protA = { v: 0 }
    const drawProt = () => {
      const want = op && (op.shift || op.ctrl || op.touch) ? 1 : 0
      protA.v += (want - protA.v) * (reduce ? 1 : 0.25)
      if (Math.abs(want - protA.v) > 0.01) need = Math.max(need, 2)
      if (!op || protA.v < 0.02) {
        prot.visible = false
        for (const l of plabs) l.style.display = 'none'
        return
      }
      const u = op.pRef,
        v = new THREE.Vector3().crossVectors(op.pAxis, u)
      const p = posOf(),
        R = AXES[op.axis].r
      const pt = (deg, r) =>
        p
          .clone()
          .addScaledVector(u, Math.cos(deg / D) * r)
          .addScaledVector(v, Math.sin(deg / D) * r)
      const tk = []
      for (let i = 0; i < 72; i++) {
        const L = i % 18 === 0 ? 1.26 : i % 3 === 0 ? 1.15 : 1.08
        tk.push(pt(i * 5, R * 1.04), pt(i * 5, R * L))
      }
      protTicks.geometry.setFromPoints(tk)
      const n = Math.max(2, Math.ceil(Math.abs(op.total) / 3)),
        fan2 = []
      for (let i = 0; i < n; i++) fan2.push(p.clone(), pt((op.total * i) / n, R * 0.97), pt((op.total * (i + 1)) / n, R * 0.97))
      protFan.geometry.setFromPoints(fan2)
      protLines.geometry.setFromPoints([p, pt(0, R * 1.26), p, pt(op.total, R * 1.34)])
      protFan.material.color.set(AXES[op.axis].c)
      protLines.material.color.set(AXES[op.axis].c)
      protTicks.material.opacity = 0.6 * protA.v
      protFan.material.opacity = 0.22 * protA.v
      protLines.material.transparent = true
      protLines.material.opacity = protA.v
      prot.visible = true
      ;[0, 90, 180, -90].forEach((d, i) => {
        const [x, y, z] = scr(pt(d, R * 1.45))
        plabs[i].style.display = z > 1 ? 'none' : 'block'
        plabs[i].style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`
        plabs[i].style.opacity = protA.v
      })
    }
    const drawGuide = () => {
      if (!op) {
        guide.innerHTML = ''
        return
      }
      const [cx, cy] = centre()
      const x = Math.max(8, Math.min(W - 8, op.vx)),
        y = Math.max(8, Math.min(H - 8, op.vy))
      const c = AXES[op.axis].c
      guide.innerHTML = `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="${c}" stroke-width="1.5" stroke-dasharray="5 5" opacity=".8"/><circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${c}" stroke-width="2"/><circle cx="${cx}" cy="${cy}" r="3" fill="${c}"/>`
    }
    const update = (now) => {
      if (ret) {
        const k2 = Math.min(1, (now - ret.t0) / 600),
          e = k2 < 0.5 ? 2 * k2 * k2 : 1 - Math.pow(-2 * k2 + 2, 2) / 2
        for (const q2 of ['yaw', 'pitch', 'roll']) cam[q2] = ret.from[q2] + (HOME[q2] - ret.from[q2]) * e
        if (k2 >= 1) ret = null
        else need = Math.max(need, 2)
      }
      const p = posOf(),
        d = dirOf()
      rig.position.copy(p)
      rig.lookAt(p.clone().add(d))
      rig.rotateZ(cam.roll)
      const reach = 2.2,
        hw = Math.tan(Math.atan(18 / cam.focal)) * reach,
        hh = (hw * 9) / 16
      const right = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize(),
        upv = new THREE.Vector3().crossVectors(right, d).normalize()
      right.applyAxisAngle(d, cam.roll)
      upv.applyAxisAngle(d, cam.roll)
      const c = p.clone().addScaledVector(d, reach)
      const q = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ].map(([x, y]) =>
        c
          .clone()
          .addScaledVector(right, x * hw)
          .addScaledVector(upv, y * hh)
      )
      cone.geometry.setFromPoints([p, q[0], p, q[1], p, q[2], p, q[3], q[0], q[1], q[1], q[2], q[2], q[3], q[3], q[0]])
      const ft = now - flashT
      const env = ft < 0 || ft > 900 ? 0 : Math.sin((Math.min(1, ft / 900) * Math.PI) / 1)
      for (const a in rings) {
        const r = rings[a]
        const on = op && op.axis === a
        const goal = op ? (on ? 1 : 0.12) : hover === a ? 1 : 0.75
        r.cur += (goal - r.cur) * (reduce ? 1 : 0.22)
        if (Math.abs(goal - r.cur) > 0.01) need = Math.max(need, 2)
        r.m.material.opacity = r.cur
        r.m.position.copy(p)
        r.m.quaternion.setFromUnitVectors(ZV, axisVec(a))
        r.m.scale.setScalar(AXES[a].r * (1 + env * 0.06))
      }
      const pulse = ft >= 0 && ft < 320 ? 1 + 1.6 * Math.sin((ft / 320) * Math.PI) : 1
      if (ft >= 0 && ft < 900) need = Math.max(need, 2)
      const ow = 0.016 * pulse
      hull.scale.set(1 + (2 * ow) / 0.34, 1 + (2 * ow) / 0.24, 1 + (2 * ow) / 0.46)
      const [cx, cy] = scr(p)
      for (const a in pips) {
        const r = rings[a]
        const w = r.m.localToWorld(new THREE.Vector3(Math.cos(Math.PI * AXES[a].at), Math.sin(Math.PI * AXES[a].at), 0))
        const [hx, hy, z] = scr(w)
        let ux = hx - cx,
          uy = hy - cy
        const n = Math.hypot(ux, uy) || 1
        const x = hx + (ux / n) * 16,
          y = hy + (uy / n) * 16
        const pip = pips[a]
        pip.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`
        pip.style.visibility = z > 1 ? 'hidden' : ''
        pip.style.opacity = Math.min(1, r.cur * 1.4).toFixed(2)
        pip.classList.toggle('hot', !!((op && op.axis === a) || hover === a))
      }
      drawProt()
      drawGuide()
      const aim = p.clone().addScaledVector(d, 4)
      lensCam.position.copy(p)
      lensCam.up.set(0, 1, 0)
      lensCam.lookAt(aim)
      lensCam.rotateZ(-cam.roll)
      lensCam.fov = (2 * Math.atan(Math.tan(Math.atan(18 / cam.focal)) / (16 / 9)) * 180) / Math.PI
      lensCam.updateProjectionMatrix()
      lensCam.updateMatrixWorld()
      fanLook(now)
      monT.textContent = `CAM 1 · ${Math.round(cam.focal)} mm`
      const v = vals0()
      vals.textContent = `yaw ${fmt(v.yaw)}° · tilt ${fmt(v.tilt)}° · roll ${fmt(v.roll)}°`
    }
    const frame = (now) => {
      raf = 0
      update(now)
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, W, H)
      renderer.render(scene, view)
      const hr = host.getBoundingClientRect(),
        mr = mon.getBoundingClientRect()
      if (mr.width > 0) {
        const hide = [rig, cone, prot, ...Object.values(rings).map((r) => r.m)]
        const was = hide.map((o) => o.visible)
        hide.forEach((o) => (o.visible = false))
        const x = mr.left - hr.left,
          y = hr.bottom - mr.bottom
        renderer.setScissorTest(true)
        renderer.setScissor(x, y, mr.width, mr.height)
        renderer.setViewport(x, y, mr.width, mr.height)
        renderer.render(scene, lensCam)
        renderer.setScissorTest(false)
        hide.forEach((o, i) => (o.visible = was[i]))
      }
      if (need > 0) need--
      if (need > 0 && seen) raf = requestAnimationFrame(frame)
    }
    function kick() {
      need = Math.max(need, 2)
      if (!raf && seen) raf = requestAnimationFrame(frame)
    }
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting
      if (seen) {
        fanLoad()
        kick()
        if (!reduce && flashT === 0) flash()
      }
    })
    io.observe(host)
    const ro = new ResizeObserver(size)
    ro.observe(host)
    size()
    host.classList.add('on')
    return {
      reset() {
        finish(false)
        hover = null
        if (reduce) Object.assign(cam, HOME)
        else ret = { t0: performance.now(), from: { yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll } }
        kick()
      },
      dispose() {
        io.disconnect()
        ro.disconnect()
        cancelAnimationFrame(raf)
        renderer.dispose()
      }
    }
  }
  window.ShotwrightGizmo = { mount }
})()
