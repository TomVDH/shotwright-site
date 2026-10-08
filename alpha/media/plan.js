;(() => {
  if (!window.THREE) return
  const FILM_MM = 36
  const v3 = (x, y, z = 0) => new THREE.Vector3(x, z, -y)
  if (THREE.ColorManagement && 'legacyMode' in THREE.ColorManagement) THREE.ColorManagement.legacyMode = false
  function mount(host, data) {
    const { project, scene } = data
    const ev = ShotwrightCore.evaluate(project, scene, 0)
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace
    else {
      renderer.outputEncoding = THREE.sRGBEncoding
      renderer.physicallyCorrectLights = true
    }
    const k = 'outputColorSpace' in renderer ? 1 : Math.PI
    host.appendChild(renderer.domElement)
    const world = new THREE.Scene()
    world.background = new THREE.Color('#18181b')
    world.add(new THREE.HemisphereLight('#f4f1ea', '#2a2a30', 1.2 * k))
    const sun = new THREE.DirectionalLight('#ffffff', 1.1 * k)
    sun.position.set(3, 10, 4)
    world.add(sun)
    const solid = ev.boxes.filter((b) => !(b.size[0] * b.size[1] > 400 && b.size[2] < 0.2) && Math.max(b.size[0], b.size[1]) < 20)
    const pts = [...ev.actors.map((a) => a.pos), ...solid.map((b) => b.pos)]
    const xs = pts.map((p) => p[0]),
      ys = pts.map((p) => p[1])
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
      cy = (Math.min(...ys) + Math.max(...ys)) / 2
    const span = Math.min(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 8) * 1.35, 28)
    const home = v3(cx, cy)
    const view = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)
    view.up.set(0, 0, -1)
    view.position.set(home.x, 60, home.z)
    view.lookAt(home.x, 0, home.z)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(span * 4, span * 4), new THREE.MeshLambertMaterial({ color: '#232327' }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(home.x, 0, home.z)
    world.add(floor)
    const grid = new THREE.GridHelper(Math.ceil(span * 4), Math.ceil(span * 4), '#34343a', '#2c2c31')
    grid.position.set(Math.round(home.x), 2e-3, Math.round(home.z))
    world.add(grid)
    const wallMat = new THREE.MeshLambertMaterial({ color: '#cfc9be' })
    for (const w of scene.walls || []) {
      if (!w.a || !w.b) continue
      const dx = w.b[0] - w.a[0],
        dy = w.b[1] - w.a[1],
        len = Math.hypot(dx, dy)
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, w.height || 2.6, 0.16), wallMat)
      m.position.copy(v3((w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2, (w.height || 2.6) / 2))
      m.rotation.y = Math.atan2(dy, dx)
      world.add(m)
    }
    const items = []
    const boxMat = new THREE.MeshLambertMaterial({ color: '#d9c8ad' })
    for (const b of solid) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b.size[0], b.size[2], b.size[1]), boxMat)
      m.position.copy(v3(b.pos[0], b.pos[1], b.size[2] / 2))
      m.rotation.y = (b.yaw * Math.PI) / 180
      world.add(m)
      items.push({ obj: m, kind: 'box' })
    }
    const actors = ev.actors.map((a) => {
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, a.height, 24), new THREE.MeshLambertMaterial({ color: a.color })))
      g.children[0].position.y = a.height / 2
      g.position.copy(v3(a.pos[0], a.pos[1]))
      world.add(g)
      const it = { obj: g, kind: 'actor' }
      items.push(it)
      return it
    })
    const near = (p) => actors.reduce((best, a) => (a.obj.position.distanceTo(p) < best.obj.position.distanceTo(p) ? a : best), actors[0])
    const cams = ev.cameras.map((c) => {
      const g = new THREE.Group()
      const mat = new THREE.MeshLambertMaterial({ color: c.color })
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), mat))
      g.position.copy(v3(c.pose.pos[0], c.pose.pos[1], 0.6))
      const fill = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({ color: c.color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
      )
      const edge = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: c.color }))
      world.add(g, fill, edge)
      const it = {
        obj: g,
        kind: 'cam',
        fill,
        edge,
        half: Math.atan(FILM_MM / 2 / c.pose.focal),
        subject: actors.length ? near(v3(c.pose.aim[0], c.pose.aim[1])) : null
      }
      items.push(it)
      return it
    })
    const aim = () => {
      for (const c of cams) {
        if (!c.subject) continue
        const o = c.obj.position,
          s = c.subject.obj.position
        const ang = Math.atan2(s.z - o.z, s.x - o.x)
        c.obj.rotation.y = -ang
        const reach = Math.min(2.4, Math.max(1, Math.hypot(s.x - o.x, s.z - o.z)))
        const a = new THREE.Vector3(o.x + Math.cos(ang - c.half) * reach, 0.05, o.z + Math.sin(ang - c.half) * reach)
        const b = new THREE.Vector3(o.x + Math.cos(ang + c.half) * reach, 0.05, o.z + Math.sin(ang + c.half) * reach)
        const apex = new THREE.Vector3(o.x, 0.05, o.z)
        c.fill.geometry.setFromPoints([apex, a, b])
        c.edge.geometry.setFromPoints([apex, a, apex, b])
      }
    }
    aim()
    const size = () => {
      const w = host.clientWidth,
        h = host.clientHeight
      renderer.setSize(w, h, false)
      const a = w / h,
        half = span / 2
      view.left = -half * Math.max(1, a)
      view.right = half * Math.max(1, a)
      view.top = half * Math.max(1, 1 / a)
      view.bottom = -half * Math.max(1, 1 / a)
      view.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(size)
    ro.observe(host)
    size()
    const ray = new THREE.Raycaster(),
      ndc = new THREE.Vector2(),
      ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      hit = new THREE.Vector3()
    const at = (e) => {
      const r = renderer.domElement.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      ray.setFromCamera(ndc, view)
    }
    let drag = null,
      pan = null
    const el = renderer.domElement
    el.style.touchAction = 'none'
    el.addEventListener('pointerdown', (e) => {
      at(e)
      const found = ray.intersectObjects(
        items.map((i) => i.obj),
        true
      )[0]
      const it = found && items.find((i) => i.obj === found.object || i.obj.children.includes(found.object))
      el.setPointerCapture(e.pointerId)
      if (it) {
        ray.ray.intersectPlane(ground, hit)
        drag = { it, dx: it.obj.position.x - hit.x, dz: it.obj.position.z - hit.z }
        el.style.cursor = 'grabbing'
      } else pan = { x: e.clientX, y: e.clientY, from: view.position.clone() }
    })
    el.addEventListener('pointermove', (e) => {
      at(e)
      if (drag) {
        ray.ray.intersectPlane(ground, hit)
        drag.it.obj.position.x = hit.x + drag.dx
        drag.it.obj.position.z = hit.z + drag.dz
        aim()
      } else if (pan) {
        const r = el.getBoundingClientRect(),
          wu = (view.right - view.left) / r.width
        view.position.x = pan.from.x - (e.clientX - pan.x) * wu
        view.position.z = pan.from.z - (e.clientY - pan.y) * wu
      } else {
        const over = ray.intersectObjects(
          items.map((i) => i.obj),
          true
        ).length
        el.style.cursor = over ? 'grab' : 'move'
      }
    })
    const up = () => {
      drag = null
      pan = null
      el.style.cursor = ''
    }
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    let visible = false,
      dead = false,
      prev = 0
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
      },
      { threshold: 0.05 }
    )
    io.observe(host)
    const loop = (now) => {
      if (dead) return
      requestAnimationFrame(loop)
      if (!visible) {
        prev = now
        return
      }
      const dt = Math.min(0.05, (now - prev) / 1e3 || 0)
      prev = now
      if (!pan) {
        view.position.x += (home.x - view.position.x) * (1 - Math.exp(-dt * 3))
        view.position.z += (home.z - view.position.z) * (1 - Math.exp(-dt * 3))
      }
      renderer.render(world, view)
    }
    requestAnimationFrame(loop)
    return {
      dispose: () => {
        dead = true
        ro.disconnect()
        io.disconnect()
        renderer.dispose()
        renderer.forceContextLoss()
        el.remove()
      }
    }
  }
  window.ShotwrightPlan = { mount }
})()
