import type { Place } from './types'

/* Arte de Story (1080×1920) desenhada em canvas com as fontes do app.
   Deixa uma área vazia marcada para o sticker de link do Instagram. */

const W = 1080
const H = 1920
/* estilos da arte: a mesma composição com paletas e fundos diferentes */
export type StoryTheme = 'noite' | 'papel' | 'neon' | 'por-do-sol' | 'mono'
export const STORY_THEMES: { id: StoryTheme; label: string; swatch: [string, string] }[] = [
  { id: 'noite', label: 'Noite', swatch: ['#0a0a0b', '#c6ff3d'] },
  { id: 'papel', label: 'Papel', swatch: ['#f2ede3', '#ff5a1f'] },
  { id: 'neon', label: 'Neon', swatch: ['#c6ff3d', '#0b0d05'] },
  { id: 'por-do-sol', label: 'Pôr do sol', swatch: ['#ff6b3d', '#3b0a45'] },
  { id: 'mono', label: 'Mono', swatch: ['#ffffff', '#111111'] },
]
interface Pal { bg: string; ink: string; mute: string; accent: string; chip: string; card: string; line: string; slot: string; accentSoft: string; inkSoft: string; tileBase: string; bgKind: 'blobs' | 'paper' | 'solid' | 'gradient' | 'mono'; glow: boolean }
const PAL: Record<StoryTheme, Pal> = {
  noite: { bg: '#0a0a0b', ink: '#f4f4f2', mute: '#9a9aa3', accent: '#c6ff3d', chip: 'rgba(255,255,255,0.09)', card: 'rgba(19,19,22,0.82)', line: 'rgba(255,255,255,0.08)', slot: 'rgba(198,255,61,0.75)', accentSoft: 'rgba(198,255,61,0.14)', inkSoft: 'rgba(244,244,242,0.8)', tileBase: '#121214', bgKind: 'blobs', glow: true },
  papel: { bg: '#f2ede3', ink: '#151412', mute: '#6d675d', accent: '#ff5a1f', chip: 'rgba(21,20,18,0.07)', card: 'rgba(255,255,255,0.7)', line: 'rgba(21,20,18,0.1)', slot: 'rgba(255,90,31,0.8)', accentSoft: 'rgba(255,90,31,0.12)', inkSoft: 'rgba(21,20,18,0.75)', tileBase: '#e6dfd2', bgKind: 'paper', glow: false },
  neon: { bg: '#c6ff3d', ink: '#0b0d05', mute: '#3e4b17', accent: '#0b0d05', chip: 'rgba(11,13,5,0.1)', card: 'rgba(11,13,5,0.08)', line: 'rgba(11,13,5,0.18)', slot: 'rgba(11,13,5,0.7)', accentSoft: 'rgba(11,13,5,0.1)', inkSoft: 'rgba(11,13,5,0.78)', tileBase: '#0b0d05', bgKind: 'solid', glow: false },
  'por-do-sol': { bg: '#3b0a45', ink: '#ffffff', mute: 'rgba(255,255,255,0.72)', accent: '#ffe14d', chip: 'rgba(255,255,255,0.16)', card: 'rgba(30,6,36,0.55)', line: 'rgba(255,255,255,0.18)', slot: 'rgba(255,225,77,0.85)', accentSoft: 'rgba(255,225,77,0.18)', inkSoft: 'rgba(255,255,255,0.85)', tileBase: '#2a0832', bgKind: 'gradient', glow: false },
  mono: { bg: '#ffffff', ink: '#111111', mute: '#6b6b6b', accent: '#111111', chip: 'rgba(0,0,0,0.06)', card: '#f4f4f4', line: 'rgba(0,0,0,0.1)', slot: 'rgba(0,0,0,0.55)', accentSoft: 'rgba(0,0,0,0.06)', inkSoft: 'rgba(17,17,17,0.75)', tileBase: '#e9e9e9', bgKind: 'mono', glow: false },
}
let T: Pal = PAL.noite
let ACCENT = T.accent
let BG = T.bg
let INK = T.ink
let MUTE = T.mute
function applyTheme(t: StoryTheme) { T = PAL[t] ?? PAL.noite; ACCENT = T.accent; BG = T.bg; INK = T.ink; MUTE = T.mute }
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
export interface EventoCard {
  kind: 'evento'
  place: Place
  /** @handle de quem divulga */
  by?: string
}
export interface AvaliacaoCard {
  kind: 'avaliacao'
  place: Place
  verdict: string
  note?: string
  author: string
}
/** convite/flyer livre (caixa de ferramentas): story 1080×1920 ou post de feed 1080×1350 */
export interface ConviteCard {
  kind: 'convite'
  title: string
  when?: string
  where?: string
  note?: string
  author: string
  hue: number
  format?: 'story' | 'feed'
}
export type StoryCard = PedidoCard | FechadoCard | SugiraCard | EventoCard | AvaliacaoCard | ConviteCard

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
  if (T.bgKind === 'blobs') {
    blob(ctx, 180, 260, 760, `hsla(${a}, 90%, 58%, ALPHA)`, 0.38)
    blob(ctx, 980, 980, 820, `hsla(${b}, 85%, 55%, ALPHA)`, 0.3)
    blob(ctx, 220, 1700, 700, `hsla(${c}, 85%, 58%, ALPHA)`, 0.22)
  } else if (T.bgKind === 'paper') {
    blob(ctx, 960, 200, 620, 'hsla(18, 100%, 56%, ALPHA)', 0.16)
    blob(ctx, 120, 1760, 640, `hsla(${b}, 60%, 60%, ALPHA)`, 0.1)
  } else if (T.bgKind === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, W * 0.4, H)
    g.addColorStop(0, '#ff7a3d'); g.addColorStop(0.45, '#e0306a'); g.addColorStop(1, '#3b0a45')
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)
    blob(ctx, 860, 380, 520, 'hsla(48, 100%, 65%, ALPHA)', 0.35)
  } else if (T.bgKind === 'solid') {
    blob(ctx, 900, 300, 700, 'hsla(70, 100%, 80%, ALPHA)', 0.5)
  } else {
    // mono: moldura fina, estilo cartaz
    ctx.strokeStyle = '#111111'; ctx.lineWidth = 6
    ctx.strokeRect(40, 40, W - 80, ctx.canvas.height - 80)
    return
  }
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
  ctx.fillStyle = T.tileBase
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
  ctx.strokeStyle = T.slot
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
    ctx.fillStyle = T.chip
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
    ctx.fillStyle = T.card
    roundRect(ctx, 90, cy, W - 180, 176, 44); ctx.fill()
    ctx.strokeStyle = T.line; ctx.lineWidth = 2; ctx.stroke()
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
  if (T.glow) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'
    blob(ctx, W / 2, 550, 420, 'hsla(82, 100%, 60%, ALPHA)', 0.1)
    ctx.restore()
  }

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

function drawAvaliacao(ctx: CanvasRenderingContext2D, c: AvaliacaoCard) {
  background(ctx, [c.place.hue, 82, (c.place.hue + 200) % 360])
  brand(ctx)
  ctx.textAlign = 'center'
  label(ctx, `${c.author} foi e conta`, W / 2, 420)
  ctx.font = `italic 400 170px ${SERIF}`
  ctx.fillStyle = ACCENT
  ctx.fillText(c.verdict, W / 2, 640)
  ctx.font = `400 120px ${SERIF}`
  ctx.fillStyle = INK
  const lines = wrap(ctx, c.place.name, W - 160, 2)
  lines.forEach((l, i) => ctx.fillText(l, W / 2, 840 + i * 124))
  let y = 840 + (lines.length - 1) * 124 + 80
  ctx.font = `500 40px ${SANS}`
  ctx.fillStyle = MUTE
  ctx.fillText(c.place.hood, W / 2, y)
  if (c.note) {
    y += 110
    ctx.font = `italic 400 58px ${SERIF}`
    ctx.fillStyle = INK
    wrap(ctx, `“${c.note}”`, W - 200, 4).forEach((l, i) => ctx.fillText(l, W / 2, y + i * 72))
  }
  ctx.textAlign = 'left'
  stickerSlot(ctx, 1600, 'Descobre o seu rolê ↓')
  footer(ctx, 'curadoria de quem foi, no rolê.')
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
    ctx.fillStyle = T.accentSoft
    roundRect(ctx, x, y, w, 62, 31); ctx.fill()
    ctx.fillStyle = ACCENT
    ctx.fillText(chip, x + 26, y + 42)
    x += w + 14
  }
  y += 140
  if (c.current.length) {
    label(ctx, 'Já tenho na lista', 90, y, MUTE)
    ctx.font = `400 50px ${SERIF}`
    ctx.fillStyle = T.inkSoft
    wrap(ctx, c.current.slice(0, 4).join(' · '), W - 180, 2).forEach((l, i) => ctx.fillText(l, 90, y + 70 + i * 60))
  }

  stickerSlot(ctx, 1600, 'Sugere pelo link ↓')
  footer(ctx, 'quem indica bem ganha reputação no rolê.')
}

function drawEvento(ctx: CanvasRenderingContext2D, c: EventoCard) {
  const p = c.place
  background(ctx, [p.hue, (p.hue + 45) % 360, 82])
  brand(ctx)
  label(ctx, 'Bora nesse?', 90, 330)

  tile(ctx, 90, 380, 300, p.hue, 72)
  // data em destaque ao lado da capa
  const [day, hour] = (p.when ?? '').split(', ')
  ctx.font = `400 96px ${SERIF}`
  ctx.fillStyle = INK
  ctx.fillText(day ?? '', 440, 500)
  ctx.font = `italic 400 96px ${SERIF}`
  ctx.fillStyle = ACCENT
  ctx.fillText(hour ?? '', 440, 610)

  ctx.font = `400 136px ${SERIF}`
  ctx.fillStyle = INK
  const lines = wrap(ctx, p.name, W - 180, 3)
  lines.forEach((l, i) => ctx.fillText(l, 90, 850 + i * 136))
  let y = 850 + (lines.length - 1) * 136 + 84
  ctx.font = `500 38px ${SANS}`
  ctx.fillStyle = INK
  ctx.fillText([p.hood, p.price === 0 ? 'grátis' : `~R$ ${p.price}`].join('  ·  '), 90, y)
  y += 76
  ctx.font = `italic 400 54px ${SERIF}`
  ctx.fillStyle = T.inkSoft
  wrap(ctx, p.tagline, W - 180, 2).forEach((l, i) => ctx.fillText(l, 90, y + i * 62))
  y += 2 * 62 + 40
  ctx.font = `500 34px ${SANS}`
  for (const h of p.highlights.slice(0, 3)) {
    ctx.fillStyle = ACCENT
    ctx.beginPath(); ctx.arc(104, y - 11, 8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = INK
    ctx.fillText(wrap(ctx, h, W - 230, 1)[0], 132, y)
    y += 58
  }

  stickerSlot(ctx, 1600, 'Chama teu grupo pelo link ↓')
  footer(ctx, c.by ? `divulgado por ${c.by} no rolê.` : 'decidam juntos no rolê.')
}

function drawConvite(ctx: CanvasRenderingContext2D, c: ConviteCard) {
  const h = ctx.canvas.height
  const feed = h < H
  background(ctx, [c.hue, (c.hue + 60) % 360, 82])
  brand(ctx)
  ctx.textAlign = 'center'
  label(ctx, 'Você tá convidado', W / 2, feed ? 330 : 560)
  ctx.font = `400 ${feed ? 128 : 150}px ${SERIF}`
  ctx.fillStyle = INK
  const lh = feed ? 124 : 150
  const lines = wrap(ctx, c.title || 'Rolê', W - 160, 3)
  let y = (feed ? 480 : 740)
  lines.forEach((l, i) => ctx.fillText(l, W / 2, y + i * lh))
  y += (lines.length - 1) * lh + (feed ? 100 : 130)
  ctx.font = `500 ${feed ? 44 : 48}px ${SANS}`
  for (const [txt, color] of [[c.when, ACCENT], [c.where, INK]] as const) {
    if (!txt) continue
    wrap(ctx, txt, W - 200, 2).forEach((l) => { ctx.fillStyle = color; ctx.fillText(l, W / 2, y); y += feed ? 62 : 70 })
  }
  if (c.note) {
    y += 20
    ctx.font = `italic 400 ${feed ? 48 : 56}px ${SERIF}`
    ctx.fillStyle = MUTE
    wrap(ctx, c.note, W - 200, feed ? 2 : 3).forEach((l) => { ctx.fillText(l, W / 2, y); y += feed ? 60 : 68 })
  }
  ctx.textAlign = 'left'
  if (!feed) stickerSlot(ctx, 1600, 'Confirma pelo link ↓')
  ctx.font = `500 28px ${SANS}`
  ctx.fillStyle = MUTE
  ctx.textAlign = 'center'
  ctx.fillText(`${c.author ? `convite de ${c.author} · ` : ''}feito no rolê.`, W / 2, h - 70)
  ctx.textAlign = 'left'
}

export async function renderStory(card: StoryCard, theme: StoryTheme = 'noite'): Promise<Blob> {
  await fontsReady()
  applyTheme(theme)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = card.kind === 'convite' && card.format === 'feed' ? 1350 : H
  const ctx = canvas.getContext('2d')!
  if (card.kind === 'pedido') drawPedido(ctx, card)
  else if (card.kind === 'sugira') drawSugira(ctx, card)
  else if (card.kind === 'evento') drawEvento(ctx, card)
  else if (card.kind === 'avaliacao') drawAvaliacao(ctx, card)
  else if (card.kind === 'convite') drawConvite(ctx, card)
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
