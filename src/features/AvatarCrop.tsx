import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/primitives'

/** Ajuste da foto de perfil: arrasta pra enquadrar, pinça ou controle pra aproximar; sai um JPG 400×400 do que
 *  aparece dentro do círculo. */
const VIEW = 260 // tamanho do círculo na tela (px)
const OUT = 400

export function AvatarCrop({ file, onCancel, onDone }: { file: File | null; onCancel: () => void; onDone: (dataUrl: string) => void }) {
  const [img, setImg] = useState<{ bmp: ImageBitmap; url: string } | null>(null)
  const [zoom, setZoom] = useState(1) // 1 = imagem cobre o círculo exatamente
  const [off, setOff] = useState({ x: 0, y: 0 }) // deslocamento do centro, em px de tela
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ d: number; z: number } | null>(null)

  useEffect(() => {
    if (!file) { setImg(null); return }
    let url = ''
    createImageBitmap(file).then((bmp) => { url = URL.createObjectURL(file); setImg({ bmp, url }); setZoom(1); setOff({ x: 0, y: 0 }) }).catch(() => onCancel())
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [file]) // eslint-disable-line react-hooks/exhaustive-deps

  const base = img ? VIEW / Math.min(img.bmp.width, img.bmp.height) : 1 // escala que cobre o círculo
  const w = img ? img.bmp.width * base * zoom : 0
  const h = img ? img.bmp.height * base * zoom : 0
  // não deixa sobrar buraco dentro do círculo
  const clamp = (o: { x: number; y: number }, z = zoom) => {
    if (!img) return o
    const mx = Math.max(0, (img.bmp.width * base * z - VIEW) / 2), my = Math.max(0, (img.bmp.height * base * z - VIEW) / 2)
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) }
  }
  const setZ = (z: number) => { const nz = Math.min(4, Math.max(1, z)); setZoom(nz); setOff((o) => clamp(o, nz)) }

  function down(e: React.PointerEvent) { (e.target as Element).setPointerCapture(e.pointerId); pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY }) }
  function move(e: React.PointerEvent) {
    const prev = pts.current.get(e.pointerId)
    if (!prev) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (!pinch.current) pinch.current = { d, z: zoom }
      else setZ(pinch.current.z * (d / pinch.current.d))
      return
    }
    setOff((o) => clamp({ x: o.x + e.clientX - prev.x, y: o.y + e.clientY - prev.y }))
  }
  function up(e: React.PointerEvent) { pts.current.delete(e.pointerId); if (pts.current.size < 2) pinch.current = null }

  function done() {
    if (!img) return
    const c = document.createElement('canvas'); c.width = c.height = OUT
    const k = OUT / VIEW
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#0a0a0b'; ctx.fillRect(0, 0, OUT, OUT)
    ctx.drawImage(img.bmp, (VIEW / 2 - w / 2 + off.x) * k, (VIEW / 2 - h / 2 + off.y) * k, w * k, h * k)
    onDone(c.toDataURL('image/jpeg', 0.85))
  }

  return (
    <Sheet open={!!file} onClose={onCancel}>
      <h3 className="font-serif text-[28px] leading-none">Ajustar foto</h3>
      <p className="mt-1 text-[13px] text-mute">Arraste pra enquadrar e use dois dedos ou o controle pra aproximar.</p>
      <div className="mt-5 flex justify-center">
        <div
          data-sheet-nodrag className="relative touch-none select-none overflow-hidden rounded-full bg-surface-2 ring-2 ring-accent/60"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          onWheel={(e) => setZ(zoom * (e.deltaY < 0 ? 1.08 : 0.93))}
        >
          {img && <img src={img.url} alt="" draggable={false} className="pointer-events-none absolute max-w-none"
            style={{ width: w, height: h, left: VIEW / 2 - w / 2 + off.x, top: VIEW / 2 - h / 2 + off.y }} />}
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <button aria-label="Afastar" onClick={() => setZ(zoom - 0.25)} className="grid size-9 place-items-center rounded-full bg-white/[0.06]"><Minus size={16} /></button>
        <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZ(Number(e.target.value))} aria-label="Zoom" className="flex-1 accent-[#c6ff3d]" />
        <button aria-label="Aproximar" onClick={() => setZ(zoom + 0.25)} className="grid size-9 place-items-center rounded-full bg-white/[0.06]"><Plus size={16} /></button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={onCancel}>Cancelar</Button>
        <Button onClick={done} disabled={!img}>Usar foto</Button>
      </div>
    </Sheet>
  )
}
