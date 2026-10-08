// Chime spinners: Kassa models turning slowly.
// Fresh is sharp and neutral, with vertex snapping only.
// Classic is a full PS1 look: 64 px, wobble, affine warp, 15-bit dither, 14 fps.
// Hidden WebGL renderers draw every tile, so the page holds at most two GL contexts.
// Needs the THREE and THREE.GLTFLoader globals.
(() => {
  const LOOKS = {
    fresh: { res: 256, fps: 30, snap: 120, affine: 0, aa: true },
    classic: { res: 64, fps: 14, snap: 26, affine: 1, aa: false }
  }
  // One full turn takes this many seconds.
  const TURN = 11
  if (!window.THREE || !THREE.GLTFLoader) { window.PSX = { spin() {}, drop() {}, look() {}, mode: 'fresh' }; return }
  if (THREE.ColorManagement && 'legacyMode' in THREE.ColorManagement) THREE.ColorManagement.legacyMode = false

  // Every visit starts Fresh.
  let mode = 'fresh'
  const uSnap = { value: LOOKS.fresh.snap }
  const uAffine = { value: 0 }

  const renderers = {}
  const renderer = () => {
    if (renderers[mode]) return renderers[mode]
    const gl = new THREE.WebGLRenderer({ antialias: LOOKS[mode].aa, alpha: true, preserveDrawingBuffer: true })
    gl.setPixelRatio(1)
    gl.setSize(LOOKS[mode].res, LOOKS[mode].res, false)
    if ('outputColorSpace' in gl) gl.outputColorSpace = THREE.SRGBColorSpace
    else { gl.outputEncoding = THREE.sRGBEncoding; gl.physicallyCorrectLights = true }
    return (renderers[mode] = gl)
  }
  const k = 'outputColorSpace' in THREE.WebGLRenderer.prototype ? 1 : Math.PI
  const world = new THREE.Scene()
  const sky = new THREE.HemisphereLight('#ffffff', '#7a7a7a', 1)
  const sun = new THREE.DirectionalLight('#ffffff', 1)
  sun.position.set(2, 3, 4)
  world.add(sky, sun)
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 100)
  const loader = new THREE.GLTFLoader()
  const tiles = []
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

  // Fresh light is neutral grey; Classic keeps a cool ground bounce, a little darker.
  function light() {
    const classic = mode === 'classic'
    sky.groundColor.set(classic ? '#4a5468' : '#7a7a7a')
    sky.intensity = k * (classic ? 1.25 : 1.15)
    sun.intensity = k * (classic ? 0.75 : 0.85)
  }

  // Half-alpha shells are glows or glass.
  // Glows add light; glass blends softly; neither hides what sits behind.
  function prep(m) {
    if (m.transparent || m.opacity < 1) {
      m.depthWrite = false
      const c = m.color
      const glass = c && c.r + c.g + c.b > 1.8
      if (!glass) m.blending = THREE.AdditiveBlending
      else m.opacity = Math.min(m.opacity, 0.3)
    }
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSnap = uSnap
      sh.uniforms.uAffine = uAffine
      // Snap the vertex to a coarse screen grid: the PS1 wobble.
      // Scale UVs by w so the fragment stage undoes perspective: affine warp.
      sh.vertexShader = 'uniform float uSnap;\nuniform float uAffine;\nvarying float vAffW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  gl_Position.xy = floor(gl_Position.xy / gl_Position.w * uSnap + 0.5) / uSnap * gl_Position.w;
  vAffW = mix(1.0, gl_Position.w, uAffine);
  #ifdef USE_UV
  vUv *= vAffW;
  #endif`)
      sh.fragmentShader = 'varying float vAffW;\n' + sh.fragmentShader.replace('#include <map_fragment>',
        THREE.ShaderChunk.map_fragment.replace(/vUv/g, '(vUv / vAffW)'))
    }
  }

  // A tile is a 2D canvas the renderer copies into.
  function spin(canvas, url, opts = {}) {
    const tile = { canvas, ctx: canvas.getContext('2d', { willReadFrequently: true }), model: null, phase: Math.random() * Math.PI * 2, tilt: opts.tilt ?? 0.32, seen: false }
    size(tile)
    tiles.push(tile)
    io.observe(canvas)
    loader.load(url, (g) => {
      const holder = new THREE.Group()
      const o = g.scene
      o.traverse((m) => {
        if (!m.isMesh) return
        m.material = m.material.clone()
        prep(m.material)
        // Transparent parts draw after the solid ones.
        if (m.material.depthWrite === false) m.renderOrder = 1
      })
      const box = new THREE.Box3().setFromObject(o), c = box.getCenter(new THREE.Vector3())
      o.position.sub(c)
      holder.add(o)
      tile.model = holder
      tile.radius = box.getSize(new THREE.Vector3()).length() / 2
      draw(tile, performance.now())
    })
    return tile
  }

  function size(t) {
    t.canvas.width = t.canvas.height = LOOKS[mode].res
    t.canvas.classList.toggle('classic', mode === 'classic')
  }

  // A 4 x 4 Bayer matrix, scaled to one 5-bit step.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.5) * 8)

  // Reduce colour to 15 bits with ordered dither, as the PS1 framebuffer did.
  function crush(ctx, res) {
    const img = ctx.getImageData(0, 0, res, res), d = img.data
    for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
      const i = (y * res + x) * 4
      if (!d[i + 3]) continue
      const b = BAYER[(y & 3) * 4 + (x & 3)]
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] + b) / 8) * 8))
      d[i + 3] = d[i + 3] < 128 ? 0 : 255
    }
    ctx.putImageData(img, 0, 0)
  }

  function draw(t, now) {
    if (!t.model) return
    const look = LOOKS[mode], gl = renderer()
    const a = t.phase + (reduce ? 0 : (now / 1000 / TURN) * Math.PI * 2)
    t.model.rotation.y = a
    world.add(t.model)
    const d = t.radius / Math.sin((15 * Math.PI) / 180) * 1.02
    cam.position.set(0, d * Math.sin(t.tilt), d * Math.cos(t.tilt))
    cam.lookAt(0, 0, 0)
    gl.clear()
    gl.render(world, cam)
    world.remove(t.model)
    t.ctx.clearRect(0, 0, look.res, look.res)
    t.ctx.drawImage(gl.domElement, 0, 0)
    if (mode === 'classic') crush(t.ctx, look.res)
  }

  function look(next) {
    if (!LOOKS[next] || next === mode) return
    mode = next
    uSnap.value = LOOKS[mode].snap
    uAffine.value = LOOKS[mode].affine
    light()
    const now = performance.now()
    for (const t of tiles) { size(t); draw(t, now) }
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const t = tiles.find((x) => x.canvas === e.target)
      if (t) t.seen = e.isIntersecting
    }
  })

  // Each look draws at its own frame rate.
  let last = 0
  const loop = (now) => {
    requestAnimationFrame(loop)
    if (reduce || now - last < 1000 / LOOKS[mode].fps) return
    last = now
    for (const t of tiles) if (t.seen) draw(t, now)
  }
  light()
  requestAnimationFrame(loop)

  // A tile that leaves the page stops drawing.
  const drop = (canvas) => {
    const i = tiles.findIndex((x) => x.canvas === canvas)
    if (i >= 0) { io.unobserve(canvas); tiles.splice(i, 1) }
  }
  window.PSX = { spin, drop, look, get mode() { return mode } }
})()
