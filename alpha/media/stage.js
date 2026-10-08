// Live stage: draws a Shotwright scene with three.js from the real evaluator.
// Needs the THREE and ShotwrightCore globals. Shotwright is Z-up; three is Y-up.
(() => {
  const FILM_MM = 36
  // Shotwright (x, y, z) maps to three (x, z, -y).
  const v3 = (p) => new THREE.Vector3(p[0], p[2], -p[1])
  const facing = (yaw) => [-Math.sin((yaw * Math.PI) / 180), Math.cos((yaw * Math.PI) / 180)]

  // r147 needs colour management and physical lights switched on to match newer three.
  if (THREE.ColorManagement && 'legacyMode' in THREE.ColorManagement) THREE.ColorManagement.legacyMode = false

  function mount(host, data, opts = {}) {
    const { project, scene } = data
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    // 1.5x is sharp enough for a moving greybox and keeps the GPU calm.
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace
    else { renderer.outputEncoding = THREE.sRGBEncoding; renderer.physicallyCorrectLights = true }
    host.appendChild(renderer.domElement)
    const world = new THREE.Scene()
    world.background = new THREE.Color('#18181b')
    const view = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, opts.overview ? 600 : 100)

    const legacy = !('outputColorSpace' in renderer)
    world.add(new THREE.HemisphereLight('#f4f1ea', '#2a2a30', legacy ? 1.1 * Math.PI : 1.1))
    const sun = new THREE.DirectionalLight('#ffffff', legacy ? 1.4 * Math.PI : 1.4)
    sun.position.set(4, 8, 3)
    world.add(sun)

    // Floor and a 1 m grid, like the app's stage.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshLambertMaterial({ color: '#232327' }))
    floor.rotation.x = -Math.PI / 2
    world.add(floor)
    const grid = new THREE.GridHelper(14, 14, '#34343a', '#2c2c31')
    grid.position.y = 0.002
    world.add(grid)

    // Walls: each wall splits into solid pieces around its openings.
    const wallMat = new THREE.MeshLambertMaterial({ color: '#cfc9be' })
    const ev0 = ShotwrightCore.evaluate(project, scene, 0)
    for (const w of ev0.walls) {
      const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1]
      const len = Math.hypot(dx, dy)
      const ang = Math.atan2(dy, dx)
      const piece = (from, to, z0, z1) => {
        if (to - from < 0.01 || z1 - z0 < 0.01) return
        const m = new THREE.Mesh(new THREE.BoxGeometry(to - from, z1 - z0, w.thickness), wallMat)
        const mid = (from + to) / 2
        m.position.copy(v3([w.a[0] + (dx / len) * mid, w.a[1] + (dy / len) * mid, (z0 + z1) / 2]))
        m.rotation.y = ang
        world.add(m)
      }
      const ops = [...w.openings].sort((p, q) => p.at - q.at)
      let x = 0
      for (const o of ops) {
        const l = o.at - o.width / 2, r = o.at + o.width / 2
        piece(x, l, 0, w.height)
        piece(l, r, 0, o.sill)
        piece(l, r, o.sill + o.height, w.height)
        x = r
      }
      piece(x, len, 0, w.height)
    }

    const follow = new THREE.Vector3()
    // Iso-on-dialogue: the first cut whose action quotes a speaker turns the view isometric.
    const talkCut = opts.isoOnDialogue ? scene.cuts.find((c) => /[A-Z][a-z]+: "/.test(c.action || '')) : null
    let isoNow = false
    // A shot plan: timed views (top, iso, cam, persp), each aimed at an actor, the pair, or the live subject.
    const plan = opts.plan || null
    let seg = null, camMode = false, distGoal = null
    const camPos = new THREE.Vector3(), camAim = new THREE.Vector3(), lookAt = new THREE.Vector3()
    let camFov = 35
    // Boxes, actors, lights and cameras move; each gets a node to update.
    const boxMat = new THREE.MeshLambertMaterial({ color: '#d9c8ad' })
    // Huge flat boxes are ground, such as water; they read darker so set pieces stand out.
    const groundMat = new THREE.MeshLambertMaterial({ color: '#22384f' })
    const boxes = new Map(ev0.boxes.map((b) => {
      const flat = b.size[0] * b.size[1] > 400 && b.size[2] < 0.2
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.size[0], b.size[2], b.size[1]), flat ? groundMat : boxMat)
      world.add(m)
      return [b.id, m]
    }))
    const visorMat = new THREE.MeshLambertMaterial({ color: '#1d1d20' })
    const actors = new Map(ev0.actors.map((a) => {
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1, 6, 16), new THREE.MeshLambertMaterial({ color: a.color }))
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.12), visorMat)
      g.add(body, visor)
      world.add(g)
      return [a.id, { g, body, visor }]
    }))
    const lights = new Map(ev0.lights.map((l) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: l.color }))
      world.add(m)
      return [l.id, m]
    }))
    const cams = new Map(ev0.cameras.map((c) => {
      const g = new THREE.Group()
      const mat = new THREE.MeshLambertMaterial({ color: c.color, transparent: true })
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.24), mat)
      const lineMat = new THREE.LineBasicMaterial({ color: c.color, transparent: true })
      const cone = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat)
      const fillMat = new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
      const fill = new THREE.Mesh(new THREE.BufferGeometry(), fillMat)
      g.add(body)
      world.add(g, cone, fill)
      return [c.id, { g, body, mat, cone, lineMat, fill, fillMat, rig: c.rig, prop: null }]
    }))

    // The 180 degree line between the two axis actors, in tape yellow.
    const lineGeo = new THREE.BufferGeometry()
    const axis = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: '#f2c230', dashSize: 0.18, gapSize: 0.12 }))
    world.add(axis)

    // Frustum of a camera pose: apex plus four corners at a fixed reach.
    const frustum = (pose, reach) => {
      const o = v3(pose.pos), at = v3(pose.aim)
      const fwd = at.clone().sub(o).normalize()
      const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize()
      const hw = (FILM_MM / 2 / pose.focal) * reach, hh = hw * (9 / 16)
      const c = fwd.clone().multiplyScalar(reach).add(o)
      const k = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => c.clone().addScaledVector(right, x * hw).addScaledVector(up, y * hh))
      return { o, k, fwd }
    }

    let t = 0
    const update = (time) => {
      t = time
      const ev = ShotwrightCore.evaluate(project, scene, t)
      const liveCam = scene.cuts[ev.cutIndex]?.camId
      if (plan) {
        const s1 = [...plan].reverse().find((p) => t >= p.t) || plan[0]
        const pos = (id) => ev.actors.find((a) => a.id === id)?.pos
        const at = s1.on === 'pair' ? ev.actors.map((a) => a.pos).reduce((m, q, i, all) => [m[0] + q[0] / all.length, m[1] + q[1] / all.length], [0, 0]) : pos(s1.on)
        if (at) follow.copy(v3([at[0], at[1], 0]))
        const live = ev.cameras.find((x) => x.id === liveCam)
        if (live) {
          camPos.copy(v3(live.pose.pos))
          camAim.copy(v3(live.pose.aim))
          const hf = 2 * Math.atan(FILM_MM / 2 / live.pose.focal)
          camFov = (2 * Math.atan(Math.tan(hf / 2) / view.aspect) * 180) / Math.PI
        }
        if (s1 !== seg) {
          seg = s1
          camMode = s1.view === 'cam'
          if (!camMode) {
            snap(s1.az ?? 0, s1.view === 'top' ? 1.45 : s1.view === 'iso' ? 0.6155 : s1.el ?? 0.35)
            distGoal = s1.dist ?? null
          }
        }
      }
      if (talkCut) {
        const iso = t >= talkCut.start
        if (iso !== isoNow) {
          isoNow = iso
          const c = ev.cameras.find((x) => x.id === liveCam)
          const aim = c ? c.pose.aim : [0, 0]
          const cast = ev.actors.map((x) => x.pos).filter((q) => Math.hypot(q[0] - aim[0], q[1] - aim[1]) < 12)
          const pts = cast.length ? cast : [aim]
          follow.copy(v3([pts.reduce((v, q) => v + q[0], 0) / pts.length, pts.reduce((v, q) => v + q[1], 0) / pts.length, 0]))
          snap(iso ? -Math.PI / 4 : 0, iso ? 0.6155 : 1.45)
        }
      }
      // A chase starts when an actor stands within 3 m of the chase box.
      if (opts.chase) {
        const box = ev.boxes.find((b) => b.id === opts.chase)
        chasing = !!box && ev.actors.some((a) => Math.hypot(a.pos[0] - box.pos[0], a.pos[1] - box.pos[1]) < 3)
        follow.copy(chasing ? v3([box.pos[0], box.pos[1], 0]) : home)
      }
      // Follow mode aims the orbit at the live camera's subject.
      if (opts.follow) {
        const c = ev.cameras.find((x) => x.id === liveCam)
        if (c) {
          const aim = c.pose.aim
          const cast = ev.actors.map((x) => x.pos).filter((q) => Math.hypot(q[0] - aim[0], q[1] - aim[1]) < 12)
          const pts = cast.length ? cast : [aim]
          const cx = pts.reduce((v, q) => v + q[0], 0) / pts.length, cy = pts.reduce((v, q) => v + q[1], 0) / pts.length
          follow.copy(v3([cx, cy, 0]))
        }
      }
      for (const b of ev.boxes) {
        const m = boxes.get(b.id)
        m.position.copy(v3([b.pos[0], b.pos[1], b.pos[2] + b.size[2] / 2]))
        m.rotation.y = (b.yaw * Math.PI) / 180
      }
      for (const a of ev.actors) {
        const n = actors.get(a.id)
        const h = a.pose === 'sit' ? a.height * 0.72 : a.pose === 'lie' ? 0.4 : a.height
        n.body.scale.set(1, Math.max(0.2, (h - 0.4) / 1), 1)
        n.body.position.y = h / 2
        const f = facing(a.yaw + (a.headYaw || 0))
        n.visor.position.set(f[0] * 0.17, h - 0.16, -f[1] * 0.17)
        n.visor.rotation.y = Math.atan2(f[0], -f[1]) + Math.PI / 2
        n.g.position.copy(v3([a.pos[0], a.pos[1], a.pos[2]]))
      }
      for (const l of ev.lights) lights.get(l.id).position.copy(v3(l.pos))
      for (const c of ev.cameras) {
        const n = cams.get(c.id)
        const live = c.id === liveCam
        const { o, k } = frustum(c.pose, live ? 2.2 : 0.9)
        n.g.position.copy(o)
        n.g.lookAt(v3(c.pose.aim))
        n.mat.opacity = live ? 1 : 0.06
        if (n.prop) n.prop.traverse((o) => { if (o.material) { o.material.transparent = true; o.material.opacity = live ? 1 : 0.06 } })
        n.lineMat.opacity = live ? 1 : 0.04
        n.cone.geometry.setFromPoints([o, k[0], o, k[1], o, k[2], o, k[3], k[0], k[1], k[1], k[2], k[2], k[3], k[3], k[0]])
        n.fillMat.opacity = live ? 0.12 : 0
        n.fill.geometry.setFromPoints([o, k[0], k[1], o, k[1], k[2], o, k[2], k[3], o, k[3], k[0]])
      }
      const [ia, ib] = scene.axis || []
      const A = ev.actors.find((a) => a.id === ia), B = ev.actors.find((a) => a.id === ib)
      if (A && B) {
        const d = [B.pos[0] - A.pos[0], B.pos[1] - A.pos[1]], L = Math.hypot(d[0], d[1]) || 1
        const e = 2.5
        lineGeo.setFromPoints([v3([A.pos[0] - (d[0] / L) * e, A.pos[1] - (d[1] / L) * e, 0.01]), v3([B.pos[0] + (d[0] / L) * e, B.pos[1] + (d[1] / L) * e, 0.01])])
        axis.computeLineDistances()
      }
    }

    // Orbit: drag to turn the set; it drifts slowly while left alone.
    // The orbit centres on the action: the two actors on the 180 line, else the whole cast.
    const pair = (scene.axis || []).map((id) => ev0.actors.find((a) => a.id === id)).filter(Boolean)
    const pts = pair.length === 2 ? pair.map((a) => a.pos) : ev0.actors.length ? ev0.actors.map((a) => a.pos) : ev0.boxes.map((b) => b.pos)
    const lo = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1]))]
    const hi = [Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]
    const mid = pts.length ? [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2] : [0, 0]
    const reach = pts.length ? Math.hypot(hi[0] - lo[0], hi[1] - lo[1]) / 2 : 0
    const target = v3([mid[0], mid[1], 0.8])
    let az = -0.9, el = 0.62, dist = Math.min(34, Math.max(7.2, reach * 2.4 + 2)), dragging = false, last = null, idle = 0
    // The start angle keeps walls out of the line of sight, nearest the default first.
    const cross = (p, q, r, t) => {
      const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      return d(p, q, r) * d(p, q, t) < 0 && d(r, t, p) * d(r, t, q) < 0
    }
    const blocked = (a) => {
      const h = dist * Math.cos(el), eye = [mid[0] + h * Math.sin(a), mid[1] - h * Math.cos(a)]
      return (scene.walls || []).filter((w) => w.a && w.b && cross(mid, eye, w.a, w.b)).length
    }
    az = Array.from({ length: 16 }, (_, i) => -0.9 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8))
      .reduce((best, a) => (blocked(a) < blocked(best) ? a : best), -0.9)
    // A top start looks straight down on the first cut's aim point: the action.
    if (opts.top) {
      const cam0 = ev0.cameras.find((c) => c.id === scene.cuts[0]?.camId)
      if (cam0) {
        // The cast near the aim point makes the frame; the aim alone stands in for an empty frame.
        const aim = cam0.pose.aim
        const cast = ev0.actors.map((x) => x.pos).filter((q) => Math.hypot(q[0] - aim[0], q[1] - aim[1]) < 12)
        const near = cast.length ? cast : [aim]
        const xs = near.map((q) => q[0]), ys = near.map((q) => q[1])
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
        const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
        target.copy(v3([cx, cy, 0]))
        dist = Math.min(28, Math.max(14, span * 1.5 + 8))
      }
      az = 0
      el = 1.45
    }
    // An overview holds one wide, still frame; a chase box takes over once someone boards it.
    const home = target.clone()
    let homeDist = dist, chasing = false
    if (opts.overview) {
      home.copy(v3([opts.overview.center[0], opts.overview.center[1], 0]))
      target.copy(home)
      dist = homeDist = opts.overview.dist
      az = opts.overview.az ?? 0
      el = 1.45
    }
    let snapTo = null
    // An overview never drifts.
    let drifting = opts.drift !== false && !opts.overview
    // Snaps ease the orbit to a preset view, the way the app's gizmo does.
    const snap = (a, e) => {
      const turn = ((a - az + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI
      snapTo = { from: [az, el], to: [az + turn, e], t0: performance.now() }
      idle = -6
    }
    const place = () => {
      view.position.set(target.x + dist * Math.cos(el) * Math.sin(az), target.y + dist * Math.sin(el), target.z + dist * Math.cos(el) * Math.cos(az))
      view.lookAt(target)
    }
    const el0 = renderer.domElement
    el0.style.touchAction = 'pan-y'
    el0.addEventListener('pointerdown', (e) => { dragging = true; last = [e.clientX, e.clientY]; el0.setPointerCapture(e.pointerId) })
    el0.addEventListener('pointermove', (e) => {
      if (!dragging) return
      orbitBy(e.clientX - last[0], e.clientY - last[1])
      last = [e.clientX, e.clientY]
    })
    const orbitBy = (dx, dy) => {
      az -= dx * 0.008
      el = Math.min(1.55, Math.max(-0.2, el + dy * 0.006))
      idle = 0
      snapTo = null
    }
    const gizmo = opts.gizmo ? makeGizmo(host, view, snap, orbitBy) : null
    const stop = () => { dragging = false }
    el0.addEventListener('pointerup', stop)
    el0.addEventListener('pointercancel', stop)

    const size = () => {
      const w = host.clientWidth, h = host.clientHeight
      renderer.setSize(w, h, false)
      view.aspect = w / h
      view.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(size)
    ro.observe(host)
    size()

    let visible = false, prev = 0
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting }, { threshold: 0.05 })
    io.observe(host)
    let dead = false
    const loop = (now) => {
      if (dead) return
      requestAnimationFrame(loop)
      if (!visible) { prev = now; return }
      const dt = Math.min(0.05, (now - prev) / 1000 || 0)
      prev = now
      idle += dt
      if (snapTo) {
        const k = Math.min(1, (now - snapTo.t0) / 700), q = 1 - Math.pow(1 - k, 3)
        az = snapTo.from[0] + (snapTo.to[0] - snapTo.from[0]) * q
        el = snapTo.from[1] + (snapTo.to[1] - snapTo.from[1]) * q
        if (k === 1) snapTo = null
      } else if (!dragging && !reduce && idle > 1.5 && drifting) az += dt * 0.05
      // The orbit glides toward the followed subject, about a second to settle.
      if ((opts.follow || opts.chase || talkCut || plan) && follow.lengthSq()) target.lerp(follow, reduce ? 1 : 1 - Math.exp(-dt * 3))
      if (plan && distGoal) dist += (distGoal - dist) * (reduce ? 1 : 1 - Math.exp(-dt * 2))
      if (opts.chase) dist += ((chasing ? 45 : homeDist) - dist) * (reduce ? 1 : 1 - Math.exp(-dt * 2))
      if (opts.play) update((now / 1000) % END_OF(scene))
      if (camMode) {
        // Cam mode rides the live camera, as the monitor sees it.
        const k = reduce ? 1 : 1 - Math.exp(-dt * 4)
        view.position.lerp(camPos, k)
        lookAt.lerp(camAim, k)
        view.lookAt(lookAt)
        view.fov += (camFov - view.fov) * k
        view.updateProjectionMatrix()
      } else {
        if (plan && Math.abs(view.fov - 35) > 0.01) { view.fov += (35 - view.fov) * Math.min(1, dt * 4); view.updateProjectionMatrix() }
        place()
        lookAt.copy(target)
      }
      if (gizmo) gizmo.draw()
      renderer.render(world, view)
    }
    // Kassa PS1 props: camera bodies by rig, and the diner's coffee cup.
    if (THREE.GLTFLoader) {
      const loader = new THREE.GLTFLoader()
      const base = opts.props || 'media/props/'
      const load = (f) => new Promise((res) => loader.load(base + f, (g) => res(g.scene), undefined, () => res(null)))
      const fit = (o, size) => {
        const b = new THREE.Box3().setFromObject(o), d = b.getSize(new THREE.Vector3())
        o.scale.setScalar(size / Math.max(d.x, d.y, d.z))
        const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3())
        o.position.sub(c)
        return o
      }
      Promise.all([load('camera.glb'), load('drone.glb')]).then(([camera, drone]) => {
        for (const n of cams.values()) {
          const src = n.rig === 'drone' ? drone : camera
          if (!src) continue
          const o = fit(src.clone(true), n.rig === 'drone' ? 0.42 : 0.3)
          o.traverse((m) => { if (m.material) m.material = m.material.clone() })
          // Kassa models face +Z; the body group already looks down the aim.
          const holder = new THREE.Group()
          holder.add(o)
          n.g.add(holder)
          n.body.visible = false
          n.prop = holder
        }
        update(t)
      })
    }
    // Chime set pieces wear their Kassa model, fitted inside the box as the app does.
    if (THREE.GLTFLoader) {
      const loader = new THREE.GLTFLoader()
      const chimes = opts.chimes || 'media/chimes/'
      for (const b of scene.boxes) {
        const box = boxes.get(b.id)
        if (!b.chime || !box) continue
        loader.load(chimes + b.chime.replace('/', '-') + '.glb', (g) => {
          const o = g.scene
          o.rotation.y = Math.PI
          const d = new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3())
          const k = Math.min(b.size[0] / d.x, b.size[2] / d.y, b.size[1] / d.z)
          o.scale.setScalar(k)
          const fit = new THREE.Box3().setFromObject(o), c = fit.getCenter(new THREE.Vector3())
          o.position.set(-c.x, -b.size[2] / 2 - fit.min.y, -c.z)
          box.material = new THREE.MeshBasicMaterial({ visible: false })
          box.add(o)
        })
      }
    }
    update(0)
    place()
    requestAnimationFrame(loop)
    // Dispose frees the GL context, so a scene switch can mount a fresh stage.
    const dispose = () => {
      dead = true
      ro.disconnect()
      io.disconnect()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    }
    return { update, snap, drift: (on) => { drifting = on && !opts.overview }, dispose }
  }

  const END_OF = (scene) => scene.duration || 40

  // Axis gizmo: balls follow the view; a click snaps, a drag orbits.
  function makeGizmo(host, view, snap, orbitBy) {
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('viewBox', '-40 -40 80 80')
    svg.setAttribute('class', 'gizmo')
    host.appendChild(svg)
    const ring = document.createElementNS(NS, 'circle')
    ring.setAttribute('r', '36')
    ring.setAttribute('class', 'gizmo-ring')
    svg.appendChild(ring)
    // Shotwright axes in three space: X right, Y into the set, Z up.
    const AX = [
      { k: 'X', v: [1, 0, 0], c: '#e5484d', view: [Math.PI / 2, 0.001] },
      { k: 'Y', v: [0, 0, -1], c: '#6bbf59', view: [Math.PI, 0.001] },
      { k: 'Z', v: [0, 1, 0], c: '#4c8ef7', view: [0, Math.PI / 2 - 0.02] }
    ]
    const items = []
    for (const a of AX) for (const sgn of [1, -1]) {
      const line = sgn > 0 ? document.createElementNS(NS, 'line') : null
      if (line) { line.setAttribute('stroke', a.c); line.setAttribute('stroke-width', '2.2'); svg.appendChild(line) }
      const ball = document.createElementNS(NS, 'circle')
      ball.setAttribute('r', sgn > 0 ? '7' : '5.5')
      ball.setAttribute('fill', sgn > 0 ? a.c : 'transparent')
      ball.setAttribute('stroke', a.c)
      ball.setAttribute('stroke-width', '1.6')
      ball.setAttribute('class', 'gizmo-ball')
      const label = sgn > 0 ? document.createElementNS(NS, 'text') : null
      if (label) { label.textContent = a.k; label.setAttribute('class', 'gizmo-label'); }
      const g = document.createElementNS(NS, 'g')
      g.append(ball)
      if (label) g.append(label)
      svg.appendChild(g)
      const [vaz, vel] = a.view
      g.addEventListener('click', (e) => { e.stopPropagation(); if (moved < 3) snap(sgn > 0 ? vaz : vaz + Math.PI, a.k === 'Z' ? (sgn > 0 ? vel : -vel) : vel) })
      items.push({ a, sgn, line, g })
    }
    let down = null, moved = 0
    // Capture starts only once the pointer drags, so a plain click reaches the ball.
    svg.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; moved = 0 })
    svg.addEventListener('pointermove', (e) => {
      if (!down) return
      moved += Math.abs(e.clientX - down[0]) + Math.abs(e.clientY - down[1])
      if (moved > 3 && !svg.hasPointerCapture(e.pointerId)) svg.setPointerCapture(e.pointerId)
      orbitBy(e.clientX - down[0], e.clientY - down[1])
      down = [e.clientX, e.clientY]
    })
    svg.addEventListener('pointerup', () => { down = null })
    const tmp = new THREE.Vector3()
    return {
      draw() {
        const m = view.matrixWorldInverse
        const placed = items.map((it) => {
          tmp.set(...it.a.v).multiplyScalar(it.sgn).transformDirection(m)
          return { it, x: tmp.x * 26, y: -tmp.y * 26, z: tmp.z }
        }).sort((p, q) => p.z - q.z)
        for (const p of placed) {
          p.it.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`)
          if (p.it.line) { p.it.line.setAttribute('x2', p.x.toFixed(1)); p.it.line.setAttribute('y2', p.y.toFixed(1)) }
          svg.appendChild(p.it.g)
        }
      }
    }
  }

  window.ShotwrightStage = { mount }
})()
