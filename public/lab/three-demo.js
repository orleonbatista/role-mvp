// 3D: duas canecas de vidro com chope, brindando em loop. three.js + ambiente de estúdio pra reflexo.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

const cv = document.getElementById('three')
const status = document.getElementById('threeStatus')
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(2, devicePixelRatio))
renderer.toneMapping = THREE.ACESFilmicToneMapping
const scene = new THREE.Scene()
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)

function mug() {
  const g = new THREE.Group()
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.56, 1.6, 48, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 1, thickness: 0.15, ior: 1.5, transparent: true, opacity: 0.35, side: THREE.DoubleSide }))
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.14, 48), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 1, thickness: 0.5, transparent: true, opacity: 0.6 }))
  base.position.y = -0.8
  const beer = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.52, 1.3, 48), new THREE.MeshPhysicalMaterial({ color: 0xf5a524, roughness: 0.2, transmission: 0.35, thickness: 1, emissive: 0x7a3d00, emissiveIntensity: 0.25 }))
  beer.position.y = -0.08
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.9 })
  const foam = new THREE.Group()
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = 0.36 + (i % 3) * 0.08
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.2 + (i % 4) * 0.03, 20, 16), foamMat)
    b.position.set(Math.cos(a) * r, 0.62 + (i % 2) * 0.06, Math.sin(a) * r); foam.add(b)
  }
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), foamMat); top.position.y = 0.72; foam.add(top)
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.08, 16, 40, Math.PI), glass.material)
  handle.rotation.z = -Math.PI / 2; handle.position.set(0.66, 0, 0)
  g.add(glass, base, beer, foam, handle)
  return g
}
const L = mug(), R = mug()
L.rotation.y = Math.PI // alça pra fora
scene.add(L, R)
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.ShadowMaterial({ opacity: 0.35 }))
floor.rotation.x = -Math.PI / 2; floor.position.y = -0.88; scene.add(floor)
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 4, 3); scene.add(key)
scene.add(new THREE.AmbientLight(0xffffff, 0.3))

// gotas de espuma
const drops = Array.from({ length: 14 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfffaf0 })); m.visible = false; scene.add(m); return m })

let az = 0.35, el = 0.18, dragging = null
cv.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY, az, el }; cv.setPointerCapture(e.pointerId) })
cv.addEventListener('pointermove', (e) => { if (!dragging) return; az = dragging.az - (e.clientX - dragging.x) * 0.01; el = Math.max(-0.1, Math.min(0.8, dragging.el + (e.clientY - dragging.y) * 0.006)) })
cv.addEventListener('pointerup', () => { dragging = null })
cv.style.touchAction = 'none'

function size() {
  const w = cv.clientWidth, h = cv.clientHeight
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
}
size(); addEventListener('resize', size)

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const T = 2.6
function frame(ms) {
  const t = (ms / 1000) % T, p = t / T
  // 0–0.4 aproxima, 0.4 brinde, 0.4–0.55 recua com mola, depois volta
  let k = p < 0.4 ? ease(p / 0.4) : p < 0.55 ? 1 - Math.sin(((p - 0.4) / 0.15) * Math.PI) * 0.12 : 1 - ease((p - 0.55) / 0.45)
  const tilt = 0.08 + k * 0.32, gap = 1.9 - k * 0.68
  L.position.set(-gap / 2 - 0.1, 0, 0); L.rotation.z = -tilt
  R.position.set(gap / 2 + 0.1, 0, 0); R.rotation.z = tilt
  const sp = p >= 0.4 && p < 0.75 ? (p - 0.4) / 0.35 : -1
  drops.forEach((d, i) => {
    d.visible = sp >= 0
    if (sp < 0) return
    const a = (i / drops.length) * Math.PI * 2
    d.position.set(Math.cos(a) * sp * 0.9, 1.25 + sp * 1.1 - sp * sp * 1.4, Math.sin(a) * sp * 0.5)
  })
  const r = 6.2
  camera.position.set(Math.sin(az) * r * Math.cos(el), 0.9 + Math.sin(el) * r, Math.cos(az) * r * Math.cos(el))
  camera.lookAt(0, 0.35, 0)
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
status.textContent = 'three.js · arraste pra girar'
