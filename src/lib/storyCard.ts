import type { Place } from './types'

/* Arte de Story (1080×1920) desenhada em canvas com as fontes do app.
   Deixa uma área vazia marcada para o sticker de link do Instagram. */

const W = 1080
const H = 1920
const ACCENT = '#c6ff3d'
const BG = '#0a0a0b'
const INK = '#f4f4f2'
const MUTE = '#9a9aa3'
const SERIF = '"Instrument Serif", Georgia, serif'
const SANS = '"Geist Variable", system-ui, sans-serif'

export interface PedidoCard {
  kind: 'pedido'
  text: string
  chips: string[]
  options: Place[]
  author: string
}
export interface FechadoCard {
  kind: 'fechado'
  place: Place
  time?: string
  people: number
  author: string
}
export interface SugiraCard {
  kind: 'sugira'
  text: string
  chips: string[]
  current: string[]
  author: string
}
export type StoryCard = PedidoCard | FechadoCard | SugiraCard

async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`400 120px ${SERIF}`),
      document.fonts.load(`italic 400 120px ${SERIF}`),
      document.fonts.load(`500 40px ${SANS}`),
      document.fonts.load(`600 40px ${SANS}`),
    ])
  } catch { /* usa fallback */ }
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, color.replace('ALPHA', String(alpha)))
  g.addColorStop(1, color.replace('ALPHA', '0'))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

function background(ctx: CanvasRenderingContext2D, hues: number[]) {
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  const [a = 82, b = 280, c = 330] = hues
  blob(ctx, 180, 260, 760, `hsla(${a}, 90%, 58%, ALPHA)`, 0.38)
  blob(ctx, 980, 980, 820, `hsla(${b}, 85%, 55%, ALPHA)`, 0.3)
  blob(ctx, 220, 1700, 700, `hsla(${c}, 85%, 58%, ALPHA)`, 0.22)
  // granulado leve
  const img = ctx.getImageData(0, 0, W, H)
  for (let i = 0; i < img.data.length; i += 4 * 3) {
    const n = (Math.random() - 0.5) * 14
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  // mantém "R$ 90", "16 pessoas" etc. na mesma linha (espaço inseparável) e quebra só em espaços comuns
  const words = text.replace(/(R\$|\d+)\s+(?=\S)/g, '$1\u00a0').split(/ +/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines)
    cut[maxLines - 1] = cut[maxLines - 1].replace(/\s+\S*$/, '') + '…'
    return cut
  }
  return lines
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function tile(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, hue: number, r = 32) {
  ctx.save()
  roundRect(ctx, x, y, s, s, r)
  ctx.clip()
  ctx.fillStyle = '#121214'
  ctx.fillRect(x, y, s, s)
  const g1 = ctx.createRadialGradient(x + s * 0.2, y + s * 0.25, 0, x + s * 0.2, y + s * 0.25, s * 0.9)
  g1.addColorStop(0, `hsla(${hue}, 90%, 62%, 0.95)`); g1.addColorStop(1, `hsla(${hue}, 90%, 62%, 0)`)
  ctx.fillStyle = g1; ctx.fillRect(x, y, s, s)
  const g2 = ctx.createRadialGradient(x + s * 0.85, y + s * 0.8, 0, x + s * 0.85, y + s * 0.8, s * 0.8)
  g2.addColorStop(0, `hsla(${(hue + 45) % 360}, 85%, 50%, 0.9)`); g2.addColorStop(1, `hsla(${(hue + 45) % 360}, 85%, 50%, 0)`)
  ctx.fillStyle = g2; ctx.fillRect(x, y, s, s)
  ctx.restore()
}

function brand(ctx: CanvasRenderingContext2D) {
  ctx.font = `italic 400 76px ${SERIF}`
  ctx.fillStyle = INK
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('rolê', 90, 190)
  const w = ctx.measureText('rolê').width
  ctx.fillStyle = ACCENT
  ctx.beginPath(); ctx.arc(90 + w + 14, 180, 11, 0, Math.PI * 2); ctx.fill()
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = ACCENT) {
  ctx.font = `600 32px ${SANS}`
  ctx.fillStyle = color
  ;(ctx as any).letterSpacing = '6px'
  ctx.fillText(text.toUpperCase(), x, y)
  ;(ctx as any).letterSpacing = '0px'
}

/** área tracejada onde a pessoa cola o sticker de link */
function stickerSlot(ctx: CanvasRenderingContext2D, y: number, caption: string) {
  ctx.font = `500 34px ${SANS}`
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.fillText(caption, W / 2, y)
  ctx.save()
  ctx.setLineDash([18, 14])
  ctx.lineWidth = 4
  ctx.strokeStyle = 'rgba(198,255,61,0.75)'
  roundRect(ctx, W / 2 - 330, y + 34, 660, 150, 75)
  ctx.stroke()
  ctx.restore()
  ctx.textAlign = 'left'
}

function footer(ctx: CanvasRenderingContext2D, text: string) {
  ctx.font = `500 28px ${SANS}`
  ctx.fillStyle = MUTE
  ctx.textAlign = 'center'
  ctx.fillText(text, W / 2, H - 70)
  ctx.textAlign = 'left'
}

function drawPedido(ctx: CanvasRenderingContext2D, c: PedidoCard) {
  background(ctx, [82, ...c.options.map((o) => o.hue)])
  brand(ctx)
  label(ctx, `${c.author} pediu ajuda`, 90, 330)

  ctx.font = `400 92px ${SERIF}`
  ctx.fillStyle = INK
  const lines = wrap(ctx, `“${c.text}”`, W - 180, 5)
  lines.forEach((l, i) => ctx.fillText(l, 90, 440 + i * 100))
  let y = 440 + lines.length * 100 + 10

  // chips
  ctx.font = `500 32px ${SANS}`
  let x = 90
  for (const chip of c.chips.slice(0, 4)) {
    const w = ctx.measureText(chip).width + 52
    if (x + w > W - 90) break
    ctx.fillStyle = 'rgba(255,255,255,0.09)'
    roundRect(ctx, x, y, w, 62, 31); ctx.fill()
    ctx.fillStyle = INK
    ctx.fillText(chip, x + 26, y + 42)
    x += w + 14
  }
  y += 130

  label(ctx, 'Onde vai ser?', 90, y)
  y += 36
  c.options.slice(0, 3).forEach((p, i) => {
    const cy = y + i * 200
    ctx.fillStyle = 'rgba(19,19,22,0.82)'
    roundRect(ctx, 90, cy, W - 180, 176, 44); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 2; ctx.stroke()
    tile(ctx, 118, cy + 28, 120, p.hue, 30)
    ctx.font = `italic 400 64px ${SERIF}`
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(String(i + 1), 160, cy + 112)
    ctx.font = `400 62px ${SERIF}`
    ctx.fillStyle = INK
    const name = wrap(ctx, p.name, W - 180 - 190 - 40, 1)[0]
    ctx.fillText(name, 268, cy + 86)
    ctx.font = `500 30px ${SANS}`
    ctx.fillStyle = MUTE
    ctx.fillText(`${p.hood} · ${p.price === 0 ? 'grátis' : `~R$ ${p.price}`}`, 268, cy + 132)
  })

  stickerSlot(ctx, 1600, 'Vota pelo link ↓')
  footer(ctx, 'decidam juntos no rolê.')
}

function drawFechado(ctx: CanvasRenderingContext2D, c: FechadoCard) {
  background(ctx, [c.place.hue, (c.place.hue + 45) % 360, 82])
  brand(ctx)
  tile(ctx, W / 2 - 210, 340, 420, c.place.hue, 96)
  // brilho
  ctx.save(); ctx.globalCompositeOperation = 'lighter'
  blob(ctx, W / 2, 550, 420, 'hsla(82, 100%, 60%, ALPHA)', 0.1)
  ctx.restore()

  ctx.textAlign = 'center'
  label(ctx, 'Rolê fechado', W / 2, 900)
  ctx.textAlign = 'center'
  ctx.font = `400 150px ${SERIF}`
  ctx.fillStyle = INK
  const lines = wrap(ctx, c.place.name, W - 160, 2)
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 1060 + i * 150))
  let y = 1060 + (lines.length - 1) * 150 + 90
  ctx.font = `500 40px ${SANS}`
  ctx.fillStyle = INK
  const meta = [c.time, `${c.people} ${c.people === 1 ? 'pessoa' : 'pessoas'}`, c.place.hood].filter(Boolean).join('  ·  ')
  ctx.fillText(meta, W / 2, y)
  y += 64
  ctx.font = `italic 400 52px ${SERIF}`
  ctx.fillStyle = MUTE
  ctx.fillText('decidido em grupo, sem 200 mensagens no zap', W / 2, y)
  ctx.textAlign = 'left'

  stickerSlot(ctx, 1600, 'Faz o seu também ↓')
  footer(ctx, `${c.author} no rolê.`)
}

function drawSugira(ctx: CanvasRenderingContext2D, c: SugiraCard) {
  background(ctx, [82, 330, 200])
  brand(ctx)
  label(ctx, `${c.author} quer indicações`, 90, 330)
  ctx.font = `400 120px ${SERIF}`
  ctx.fillStyle = INK
  ctx.fillText('Me indica', 90, 470)
  ctx.font = `italic 400 120px ${SERIF}`
  ctx.fillStyle = ACCENT
  ctx.fillText('um lugar?', 90, 590)

  ctx.font = `400 64px ${SERIF}`
  ctx.fillStyle = INK
  const lines = wrap(ctx, `“${c.text}”`, W - 180, 4)
  lines.forEach((l, i) => ctx.fillText(l, 90, 730 + i * 74))
  let y = 730 + lines.length * 74 + 20

  ctx.font = `500 32px ${SANS}`
  let x = 90
  for (const chip of c.chips.slice(0, 5)) {
    const w = ctx.measureText(chip).width + 52
    if (x + w > W - 90) { x = 90; y += 78 }
    ctx.fillStyle = 'rgba(198,255,61,0.14)'
    roundRect(ctx, x, y, w, 62, 31); ctx.fill()
    ctx.fillStyle = ACCENT
    ctx.fillText(chip, x + 26, y + 42)
    x += w + 14
  }
  y += 140
  if (c.current.length) {
    label(ctx, 'Já tenho na lista', 90, y, MUTE)
    ctx.font = `400 50px ${SERIF}`
    ctx.fillStyle = 'rgba(244,244,242,0.8)'
    wrap(ctx, c.current.slice(0, 4).join(' · '), W - 180, 2).forEach((l, i) => ctx.fillText(l, 90, y + 70 + i * 60))
  }

  stickerSlot(ctx, 1600, 'Sugere pelo link ↓')
  footer(ctx, 'quem indica bem ganha reputação no rolê.')
}

export async function renderStory(card: StoryCard): Promise<Blob> {
  await fontsReady()
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  if (card.kind === 'pedido') drawPedido(ctx, card)
  else if (card.kind === 'sugira') drawSugira(ctx, card)
  else drawFechado(ctx, card)
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas vazio'))), 'image/png'))
}

/** adiciona a origem (?src=ig) antes do fragmento #p= do link */
export function withSource(url: string, src: string) {
  const [base, hash] = url.split('#')
  const u = new URL(base)
  u.searchParams.set('src', src)
  return hash ? `${u.toString()}#${hash}` : u.toString()
}
