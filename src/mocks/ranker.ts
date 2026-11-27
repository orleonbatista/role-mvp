import type { Criteria, Niche, Occasion, Place, Profile, Ranked, Tag, Vibe, When } from '../lib/types'
import { HOODS, nicheLabel, occasionLabel, vibeLabel } from '../lib/labels'
import { DAY_LONG, DAY_SHORT, distanceKm, isOpenAt, kmBetween } from '../lib/hours'

/* "IA" local: texto livre -> critérios estruturados -> ranking explicável.
   Casamento por palavra inteira (não por pedaço), tolerante a 1 erro de digitação,
   entende dia/horário e admite o que não sabe. */

export const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const tokenize = (s: string) => norm(s).replace(/[^a-z0-9$ ]+/g, ' ').split(/\s+/).filter(Boolean)

function lev(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return 2
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

/** kw pode ser frase ("ao vivo"), prefixo ("namorad*") ou palavra (tolera 1 erro se tiver 6+ letras) */
function has(tokens: string[], joined: string, kw: string) {
  if (kw.includes(' ')) return joined.includes(` ${kw} `)
  if (kw.endsWith('*')) return tokens.some((t) => t.startsWith(kw.slice(0, -1)))
  return tokens.some((t) => t === kw || (kw.length >= 6 && lev(t, kw) <= 1))
}

const NICHE_KW: Record<Niche, string[]> = {
  listening: ['listening', 'vinil', 'vinis', 'som bom', 'hifi', 'hi fi', 'audiofilo', 'discos'],
  eletronica: ['eletronica', 'techno', 'tecno', 'house', 'balada', 'pista', 'dj', 'rave', 'danca*', 'dancar'],
  boteco: ['boteco', 'buteco', 'acepipe*', 'petisco*', 'torresmo', 'pe sujo', 'chopp', 'chope', 'cerveja', 'cerva'],
  gastronomia: ['jantar', 'comer', 'restaurante', 'comida', 'almoco', 'almocar', 'omakase', 'cozinha', 'menu', 'degustacao'],
  drinks: ['drink*', 'coquetel*', 'cocktail*', 'vinho*', 'rooftop', 'bar de vinho'],
  jazz: ['jazz', 'sax', 'ao vivo', 'blues', 'jam', 'musica ao vivo'],
  'ao-ar-livre': ['ar livre', 'quintal', 'laje', 'terraco', 'rooftop', 'por do sol', 'day party'],
  cafe: ['cafe', 'cafes', 'cafeteria', 'cafezinho', 'padaria', 'confeitaria', 'doce*', 'brunch', 'cafe da manha', 'bolo*', 'sorvete*', 'trabalhar'],
}
const VIBE_KW: Record<Vibe, string[]> = {
  tranquilo: ['tranquilo', 'calmo', 'conversar', 'sossegado', 'silencio', 'ler', 'trabalhar'],
  animado: ['animado', 'agitado', 'lotado', 'animacao', 'festa'],
  intimista: ['intimista', 'romantico', 'romantica', 'a dois', 'pequeno', 'aconchegante'],
  underground: ['underground', 'alternativo', 'escondido', 'secreto', 'de verdade'],
  descolado: ['descolado', 'moderno', 'hype', 'autoral', 'diferente'],
  raiz: ['raiz', 'simples', 'barato', 'barata', 'tradicional', 'roots'],
  sofisticado: ['sofisticado', 'chique', 'especial', 'elegante', 'fino', 'requintado'],
}
const OCC_KW: [Occasion, string[]][] = [
  ['aniversario', ['aniversario', 'niver', 'comemorar', 'comemoracao', 'parabens']],
  ['date', ['date', 'encontro', 'namorad*', 'a dois', 'crush', 'romantico', 'romantica']],
  ['trabalho', ['firma', 'trabalho', 'equipe', 'happy hour', 'happy', 'empresa', 'time']],
  ['esquenta', ['esquenta', 'pre balada']],
  ['solo', ['sozinh*', 'solo', 'so eu']],
  ['amigos', ['amigos', 'amigas', 'galera', 'turma', 'pais', 'familia', 'mae', 'pai']],
]
const TAG_KW: Record<Tag, string[]> = {
  vegano: ['vegan*', 'vegetarian*', 'plant based'],
  samba: ['samba', 'pagode', 'roda de samba'],
  pet: ['pet', 'cachorro', 'dog', 'cachorra'],
  acessivel: ['acessivel', 'cadeirante', 'acessibilidade', 'cadeira de rodas'],
  karaoke: ['karaoke', 'cantar'],
  funk: ['funk', 'baile'],
  sertanejo: ['sertanejo', 'modao', 'sertaneja'],
  'open-bar': ['open bar', 'openbar'],
}
const TAG_LABEL: Record<Tag, string> = {
  vegano: 'opção vegana', samba: 'samba', pet: 'pet friendly', acessivel: 'acessibilidade',
  karaoke: 'karaokê', funk: 'funk', sertanejo: 'sertanejo', 'open-bar': 'open bar',
}
const HOOD_ALIAS: [string, string][] = [['paulista', 'Consolação'], ['augusta', 'Consolação'], ['bela vista', 'Bixiga'], ['vila madalena', 'Vila Madalena'], ['madalena', 'Vila Madalena'], ['vila mariana', 'Vila Mariana'], ['santa cecilia', 'Santa Cecília'], ['vila prudente', 'Vila Prudente'], ['barra funda', 'Barra Funda'], ['itaim bibi', 'Itaim']]

const DAYS_KW: [number, string[]][] = [
  [0, ['domingo']], [1, ['segunda']], [2, ['terca']], [3, ['quarta']],
  [4, ['quinta']], [5, ['sexta', 'sextou']], [6, ['sabado', 'sab', 'fim de semana', 'fds']],
]

function parseWhen(tokens: string[], joined: string): When | undefined {
  const today = new Date().getDay()
  let day: number | undefined
  if (tokens.includes('hoje') || tokens.includes('agora')) day = today
  else if (tokens.includes('amanha') && !joined.includes(' de manha ')) day = (today + 1) % 7
  else for (const [d, kws] of DAYS_KW) if (kws.some((k) => (k.length <= 3 ? tokens.includes(k) : has(tokens, joined, k)))) { day = d; break }

  let hour: number | undefined
  const m = joined.match(/ (\d{1,2}) ?h(?:rs?|oras?)? /) ?? joined.match(/ as (\d{1,2}) /)
  if (m) hour = Number(m[1])
  else if (has(tokens, joined, 'almoco') || has(tokens, joined, 'almocar')) hour = 12.5
  else if (has(tokens, joined, 'cafe da manha')) hour = 9
  else if (/ (fim|final) d[ae] tarde | happy hour | depois do (trampo|trabalho|expediente) /.test(joined)) hour = 18
  else if (has(tokens, joined, 'tarde') || has(tokens, joined, 'day party')) hour = 16
  else if (has(tokens, joined, 'madrugada') || joined.includes(' ate de manha ') || joined.includes(' amanhecer ')) hour = 2
  else if (has(tokens, joined, 'noite') || has(tokens, joined, 'jantar')) hour = 21

  if (day === undefined && hour === undefined) return undefined
  const dl = day === undefined ? '' : day === today ? 'hoje' : day === (today + 1) % 7 ? 'amanhã' : DAY_LONG[day]
  const hl = hour === undefined ? '' : hour === 12.5 ? 'no almoço' : hour === 16 ? 'à tarde' : hour === 18 && !m ? 'no fim de tarde' : hour === 2 ? 'de madrugada' : hour === 21 && !m ? 'à noite' : `às ${hour}h`
  return { day, hour, label: [dl, hl].filter(Boolean).join(' ') }
}

export function parseRequest(text: string): Criteria {
  const tokens = tokenize(text)
  const joined = ` ${tokens.join(' ')} `
  const niches = (Object.keys(NICHE_KW) as Niche[]).filter((n) => NICHE_KW[n].some((k) => has(tokens, joined, k)))
  const vibes = (Object.keys(VIBE_KW) as Vibe[]).filter((v) => VIBE_KW[v].some((k) => has(tokens, joined, k)))
  const occasion = OCC_KW.find(([, kws]) => kws.some((k) => has(tokens, joined, k)))?.[0]
  const tags = (Object.keys(TAG_KW) as Tag[]).filter((t) => TAG_KW[t].some((k) => has(tokens, joined, k)))

  let budget: number | undefined
  const raw = ` ${norm(text)} `
  const b = raw.match(/r\$\s*(\d{2,4})/) ?? raw.match(/(\d{2,4})\s*(reais|conto|pila)/) ?? raw.match(/ate\s+(\d{2,4})\b(?!\s*(km|quilometr|minuto|min\b|h\b))/)
  if (b) budget = Number(b[1])
  if (!budget && /\bbarat/.test(raw)) budget = 60
  if (/sem limite|tanto faz o preco|nao importa o preco/.test(raw)) budget = undefined

  let groupSize: number | undefined
  const g = raw.match(/(\d{1,3})\s*(pessoas|amigos|amigas|convidados|pax|pessoal)/) ?? raw.match(/(?:pra|para|somos|de)\s+(\d{1,3})\b(?!\s*(reais|conto|r\$|h\b|anos))/)
  if (g) groupSize = Number(g[1])
  if (!groupSize) groupSize = occasion === 'solo' ? 1 : occasion === 'date' ? 2 : /\bpais\b/.test(raw) ? 3 : 4

  let hood = HOODS.find((h) => joined.includes(` ${norm(h)} `))
  if (!hood) hood = HOOD_ALIAS.find(([a]) => joined.includes(` ${a} `))?.[1]

  const k = raw.match(/(?:ate|em|raio de|no maximo|max(?:imo)?|a)\s*(\d{1,2})\s*(?:km|quilometros?)\b/)
  const maxKm = k ? Math.min(30, Math.max(1, Number(k[1]))) : /minha regiao|perto de mim|perto de casa|aqui perto|perto daqui|do lado de casa/.test(raw) ? 5 : undefined

  return { occasion, groupSize, budget, hood, maxKm, niches, vibes, tags, when: parseWhen(tokens, joined), unmet: [] }
}

const NICHE_REASON: Record<Niche, string> = {
  listening: 'Listening bar de verdade', eletronica: 'Pista de eletrônica forte', boteco: 'Boteco com acepipe de respeito',
  gastronomia: 'Cozinha que vale a ida', drinks: 'Carta de drinks caprichada', jazz: 'Música ao vivo de qualidade',
  'ao-ar-livre': 'Espaço ao ar livre', cafe: 'Café e doces de respeito',
}

const OCC_PHRASE: Record<Occasion, string> = { aniversario: 'aniversário', date: 'date', amigos: 'ir com amigos', trabalho: 'happy hour', esquenta: 'esquenta', solo: 'ir sozinho' }

export const isVague = (c: Criteria) => !c.occasion && !c.niches.length && !c.vibes.length && !c.tags.length

export function rank(places: Place[], c: Criteria, profile?: Profile | null): Ranked[] {
  const bigGroup = c.groupSize >= 10 && (c.occasion === 'aniversario' || c.occasion === 'trabalho')
  // pontuação máxima possível para os critérios pedidos — base do match calibrado
  const max =
    c.niches.length * 3 + c.vibes.length * 1.6 + (c.occasion ? 3 : 0) + (c.groupSize >= 8 ? 2 : 0) + (bigGroup ? 2 : 0) +
    (c.niches.includes('ao-ar-livre') && places.some((p) => p.live) ? 1.5 : 0) + (places.some((p) => p.live?.rating) ? 2.2 : 0) +
    (c.budget ? 1.5 : 0) + (c.hood ? 2.5 : c.maxKm && profile?.home ? 1.2 : 0) + c.tags.length * 2.5 + (c.when ? 1.5 : 0) + 2 +
    (isVague(c) && profile ? profile.niches.length * 1.4 + profile.vibes.length * 0.5 + 0.8 : 0)

  const out = places.map((place) => {
    let score = 0
    const why: [number, string][] = []
    const warn: string[] = []

    // lugar sem curadoria: estilo veio do tipo do lugar no Google — o motivo diz isso, sem elogio inventado
    const base = place.curation === 'base'
    for (const n of c.niches) if (place.niches.includes(n)) {
      score += 3
      // lugar sem curadoria: o estilo veio da busca no Google; quando há confirmação ao vivo, o motivo vem dela
      if (base && place.live && ((n === 'ao-ar-livre' && place.live.outdoor !== undefined) || (n === 'boteco' && place.live.beer))) continue
      why.push([3, base ? `${nicheLabel(n)}, pela busca no Google` : NICHE_REASON[n]])
    }
    if (!c.niches.length && profile) for (const n of profile.niches) if (place.niches.includes(n)) { score += 1.4; why.push([1.4, `Bate com seu gosto por ${nicheLabel(n).toLowerCase()}`]) }
    for (const v of c.vibes) if (place.vibes.includes(v)) { score += 1.6; why.push([1.6, `Clima ${vibeLabel(v).toLowerCase()}, como você pediu`]) }
    if (profile && isVague(c)) for (const v of profile.vibes) if (place.vibes.includes(v)) score += 0.5

    for (const t of c.tags) {
      if (place.tags.includes(t)) { score += 2.5; why.push([2.7, `Tem ${TAG_LABEL[t]}`]) }
      else score -= 1
    }

    if (c.occasion) {
      if (place.occasions.includes(c.occasion)) { score += 3; if (!base) why.push([2.8, `Comunidade aprova pra ${OCC_PHRASE[c.occasion]}`]) }
      // lugar sem curadoria não tem ocasião marcada: não sabemos, então não pune (antes isso dava vantagem
      // artificial ao único lugar curado, mesmo longe)
      else if (!base) score -= 1.5
    }

    if (c.groupSize > place.capacity) { score -= 7; warn.push(`Comporta até ${place.capacity} pessoas`) }
    else if (c.groupSize >= 8) { score += 2; why.push([2.6, `Cabe seu grupo de ${c.groupSize} (até ${place.capacity})`]) }
    if (bigGroup) {
      if (place.kind === 'evento') { score -= 6; warn.push('Evento aberto: não reserva espaço pro grupo') }
      else if (place.privateSpace) { score += 2; why.push([2.9, 'Tem espaço reservável pro grupo']) }
    }

    if (c.budget) {
      if (place.price <= c.budget) { score += 1.5; why.push([1.5, place.price === 0 ? 'Grátis' : `~R$ ${place.price}/pessoa, dentro do orçamento`]) }
      else if (place.price > c.budget * 1.25) { score -= 4; warn.push(`~R$ ${place.price}/pessoa, acima do orçamento`) }
      else { score -= 1; warn.push(`~R$ ${place.price}/pessoa, um pouco acima`) }
    } else if (isVague(c) && place.price > 200) score -= 2

    if (c.hood) {
      if (place.hood === c.hood) { score += 2.5; why.push([2.4, `Fica em ${place.hood}`]) }
      else {
        // fora da região pedida: pesa pela distância até ela (perto ainda serve; do outro lado da cidade não)
        const km = distanceKm(c.hood, place.hood)
        if (km === undefined || km <= 2) score -= 0.5
        else if (km <= 4) { score += 0.5; why.push([1.2, `Perto de ${c.hood} (~${Math.round(km)} km)`]) }
        else { score -= Math.min(6, (km - 3) * 1.2); warn.push(`A ~${Math.round(km)} km de ${c.hood}`) }
      }
    } else if (c.maxKm && profile?.home && place.lat != null) {
      const km = kmBetween(profile.home, place) ?? 99
      if (km <= c.maxKm) { score += 1.2; why.push([1.6, `A ~${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km de você`]) }
      else { score -= 6; warn.push(`A ~${Math.round(km)} km, fora do raio pedido`) }
    } else if (profile?.hood) {
      const km = distanceKm(profile.hood, place.hood)
      if (km !== undefined && km < 3) { score += 0.8; why.push([0.8, `Perto de você (${place.hood})`]) }
    }

    // lugar real (Google/OSM) sem horário confirmado: não afirma "aberto" nem penaliza — a tela manda ver no Maps
    if (c.when && (!place.source || place.live?.hours)) {
      const d = c.when.day ?? 0
      const h = c.when.hour ?? 21
      const ok = c.when.day === undefined
        ? [0, 1, 2, 3, 4, 5, 6].some((x) => isOpenAt(place.periods, x, h)) // só horário: qualquer dia serve
        : c.when.hour === undefined
          ? [13, 19, 21, 23].some((x) => isOpenAt(place.periods, d, x)) || isOpenAt(place.periods, (d + 1) % 7, 1)
          : isOpenAt(place.periods, d, h)
      if (ok) { score += 1.5; why.push([2.2, place.kind === 'evento' && place.when ? `Acontece ${place.when?.toLowerCase()}` : `Aberto ${c.when.label}${place.live?.hours ? ' (horário do Google)' : ''}`]) }
      else { score -= 6; warn.push(place.kind === 'evento' ? `Só acontece ${place.when}` : c.when.day === undefined ? `Não abre ${c.when.label}` : `Fechado ${c.when.label}`) }
    }

    // confirmado ao vivo no Google pra este pedido (nada disso é salvo)
    const L = place.live
    if (L) {
      if (c.niches.includes('ao-ar-livre') && L.outdoor !== undefined) {
        if (L.outdoor) { score += 1.5; why.push([2.6, 'Área externa (confirmado no Google)']) }
        else { score -= 4; warn.push('Sem área externa, segundo o Google') }
      }
      if (c.niches.includes('boteco') && L.beer) why.push([1.4, 'Serve cerveja (Google)'])
      if (c.niches.includes('drinks') && L.cocktails) why.push([1.4, 'Tem drinks (Google)'])
      if (c.niches.includes('jazz') && L.music) { score += 1; why.push([1.8, 'Música ao vivo (Google)']) }
      if (c.groupSize >= 8 && L.groups) { score += 1; why.push([1.6, 'Bom pra grupo (Google)']) }
      if (L.rating) {
        const conf = Math.min(1, Math.log10((L.count ?? 0) + 1) / 3) // 1.000 avaliações = confiança cheia
        score += (L.rating - 4.2) * 3 * conf
        if (L.rating >= 4.5 && (L.count ?? 0) >= 100) why.push([1.7, `Nota ${L.rating.toFixed(1).replace('.', ',')} no Google (${(L.count ?? 0) >= 1000 ? `${((L.count ?? 0) / 1000).toFixed(1).replace('.', ',')} mil` : L.count})`])
      }
    }

    score += (place.rating - 8) * 1.5
    if (place.rating >= 8.8) why.push([1.2, place.source === 'google' ? `Nota ${(place.rating / 2).toFixed(1)} no Google (${place.ratingCount})` : `Nota ${place.rating.toFixed(1)} na comunidade`])

    const reasons = why.sort((a, b) => b[0] - a[0]).map(([, s]) => s).filter((s, i, a) => a.indexOf(s) === i).slice(0, 4)
    if (!reasons.length) reasons.push(place.tagline)
    if (base) reasons.push('Ninguém da comunidade avaliou ainda')
    for (const t of c.tags) if (!place.tags.includes(t)) warn.push(`Sem confirmação de ${TAG_LABEL[t]}`)
    return { place, score, reasons, warnings: warn.slice(0, 2), match: 0 }
  })

  out.sort((a, b) => b.score - a.score)
  for (const r of out) r.match = Math.max(15, Math.min(99, Math.round((r.score / Math.max(max, 1)) * 100)))
  return out
}

/** termos pedidos que nenhum lugar do catálogo cobre */
export function unmetFor(c: Criteria, places: Place[]) {
  return c.tags.filter((t) => !places.some((p) => p.tags.includes(t))).map((t) => TAG_LABEL[t])
}

export function confidenceOf(c: Criteria, top?: Ranked): 'alta' | 'media' | 'baixa' {
  if (!top || isVague(c) || top.match < 55) return 'baixa'
  return top.match >= 75 && !top.warnings.length ? 'alta' : 'media'
}

export function introFor(c: Criteria, top: Ranked[]): string {
  const parts: string[] = []
  if (c.occasion) parts.push(occasionLabel(c.occasion).toLowerCase())
  if (c.groupSize > 2) parts.push(`${c.groupSize} pessoas`)
  if (c.when) parts.push(c.when.label)
  if (c.hood) parts.push(`em ${c.hood}`)
  if (c.budget) parts.push(`até R$ ${c.budget}`)
  const what = parts.length ? parts.join(', ') : 'o que você descreveu'
  const unmet = c.unmet.length ? ` Ainda não tenho ${c.unmet.join(' nem ')} no catálogo, então trouxe o mais próximo.` : ''
  const conf = confidenceOf(c, top[0])
  const best = top[0]?.place.name
  if (conf === 'baixa' && isVague(c))
    return `Seu pedido ficou bem aberto, então usei seu gosto e o que está bem avaliado.${unmet} Se disser a ocasião ou o clima, eu acerto mais.`
  return `Entendi: ${what}. Cruzei ${c.niches.length ? c.niches.map((n) => nicheLabel(n).toLowerCase()).join(' + ') : 'seu gosto'} com capacidade, preço, horário e o que a comunidade aprovou.${unmet} ${best ? (conf === 'alta' ? `${best} é a aposta mais segura.` : `${best} é o que chega mais perto, mas vale olhar os alertas.`) : ''}`
}

/** opções de horário para votação, a partir do que foi pedido */
export function timeOptions(c: Criteria): string[] {
  const days = c.when?.day !== undefined ? [c.when.day] : [5, 6]
  const hours = c.when?.hour !== undefined
    ? [c.when.hour === 12.5 ? 12 : Math.floor(c.when.hour), Math.floor(c.when.hour) + 1].map((h) => h % 24)
    : c.occasion === 'trabalho' ? [18, 19] : c.niches.includes('eletronica') ? [23, 0] : [20, 21]
  const out: string[] = []
  for (const d of days) for (const h of hours) out.push(`${DAY_SHORT[d]} ${h}h`)
  if (days.length === 1 && out.length < 3) out.push(`${DAY_SHORT[(days[0] + 1) % 7]} ${hours[0]}h`)
  return out.slice(0, 3)
}

/* ---------- exemplo rotulado pro aprendizado da IA ----------
   Converte os critérios finais de um pedido no formato que a LLM devolve (com "trecho" = palavras exatas do pedido).
   Item sem trecho no texto (ex.: ocasião escolhida num chip) fica de fora: o exemplo só ensina o que está escrito. */
function anchor(text: string, kws: string[]): string | null {
  const orig = text.split(/\s+/).filter(Boolean)
  const normed = orig.map((w) => norm(w).replace(/[^a-z0-9$]/g, ''))
  for (const k of kws) {
    const star = k.endsWith('*')
    const kt = norm(k.replace('*', '')).split(' ').filter(Boolean)
    for (let i = 0; i + kt.length <= normed.length; i++) {
      let ok = true
      for (let j = 0; j < kt.length; j++) {
        const w = normed[i + j], t = kt[j]
        if (!(w === t || (star && j === kt.length - 1 && w.startsWith(t)))) { ok = false; break }
      }
      if (ok) return orig.slice(i, i + kt.length).join(' ').replace(/[.,!?;:]+$/, '')
    }
  }
  return null
}
export function toExample(text: string, c: Criteria) {
  const itens: { valor: string; trecho: string }[] = []
  const push = (valor: string, kws: string[] | undefined) => { const t = kws && anchor(text, kws); if (t) itens.push({ valor, trecho: t }) }
  for (const n of c.niches) push(n, NICHE_KW[n])
  for (const v of c.vibes) push(v, VIBE_KW[v])
  for (const t of c.tags) push(t, TAG_KW[t])
  const occ = c.occasion ? anchor(text, OCC_KW.find(([o]) => o === c.occasion)?.[1] ?? []) : null
  const ppl = text.match(/(?:pra|para|somos|de)?\s*\d{1,3}\s*(?:pessoas|amigos|amigas|convidados|pax)/i)?.[0]?.trim()
  const bud = c.budget ? text.match(/r\$\s*\d{2,4}|\d{2,4}\s*(?:reais|conto|pila)|at[eé]\s+\d{2,4}(?!\s*km)/i)?.[0] : undefined
  return {
    ocasiao: { valor: occ ? c.occasion : 'nenhuma', trecho: occ ?? '' },
    pessoas: { valor: ppl ? c.groupSize : 0, trecho: ppl ?? '' },
    orcamento: { valor: bud ? c.budget : 0, trecho: bud ?? '' },
    itens: itens.slice(0, 5),
  }
}
