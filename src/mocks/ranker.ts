import type { Criteria, Niche, Occasion, Place, Profile, Ranked, Vibe } from '../lib/types'
import { HOODS, nicheLabel, occasionLabel, vibeLabel } from '../lib/labels'

/* "IA" mock: extração de intenção por palavras-chave + ranking determinístico.
   Mesma interface que um LLM real teria: texto livre -> critérios -> ranking explicado. */

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const NICHE_KW: Record<Niche, string[]> = {
  listening: ['listening', 'vinil', 'disco', 'som bom', 'hi-fi', 'hifi', 'audiofil'],
  eletronica: ['eletronica', 'techno', 'house', 'balada', 'pista', ' dj', 'rave', 'dancar'],
  boteco: ['boteco', 'buteco', 'acepipe', 'petisco', 'torresmo', 'pe-sujo', 'pe sujo', 'chopp', 'cerveja'],
  gastronomia: ['jantar', 'comer', 'restaurante', 'comida', 'almoco', 'omakase', 'cozinha', 'menu'],
  drinks: ['drink', 'coquetel', 'cocktail', 'vinho', 'rooftop', 'karaoke'],
  jazz: ['jazz', 'sax', 'ao vivo', 'blues', 'jam'],
  'ao-ar-livre': ['ar livre', 'quintal', 'laje', 'terraco', 'rooftop', 'por do sol', 'tarde', 'day party'],
}
const VIBE_KW: Record<Vibe, string[]> = {
  tranquilo: ['tranquilo', 'calmo', 'conversar', 'sossegado', 'silencio'],
  animado: ['animado', 'agitado', 'dancar', 'festa', 'lotado'],
  intimista: ['intimista', 'romantico', 'a dois', 'pequeno'],
  underground: ['underground', 'alternativo', 'escondido', 'secreto', 'de verdade'],
  descolado: ['descolado', 'moderno', 'hype', 'autoral'],
  raiz: ['raiz', 'simples', 'barato', 'tradicional'],
  sofisticado: ['sofisticado', 'chique', 'especial', 'elegante', 'fino'],
}
const OCC_KW: [Occasion, string[]][] = [
  ['aniversario', ['aniversario', 'niver', 'comemorar', 'comemoracao']],
  ['date', ['date', 'encontro', 'romantico', 'namorad', 'a dois']],
  ['trabalho', ['firma', 'trabalho', 'equipe', 'happy hour', 'happy']],
  ['esquenta', ['esquenta']],
  ['solo', ['sozinh', 'solo', 'so eu']],
  ['amigos', ['amigos', 'galera', 'turma', 'pais', 'familia']],
]
const HOOD_ALIAS: Record<string, string> = { paulista: 'Consolação', augusta: 'Consolação', 'bela vista': 'Bixiga', vila: '' }

export function parseRequest(text: string): Criteria {
  const t = ` ${norm(text)} `
  const niches = (Object.keys(NICHE_KW) as Niche[]).filter((n) => NICHE_KW[n].some((k) => t.includes(k)))
  const vibes = (Object.keys(VIBE_KW) as Vibe[]).filter((v) => VIBE_KW[v].some((k) => t.includes(k)))
  const occasion = OCC_KW.find(([, kws]) => kws.some((k) => t.includes(k)))?.[0]

  let budget: number | undefined
  const b = t.match(/r\$\s*(\d{2,4})/) ?? t.match(/(\d{2,4})\s*(reais|conto|pila)/) ?? t.match(/ate\s+(\d{2,4})\b/)
  if (b) budget = Number(b[1])
  if (!budget && /barat/.test(t)) budget = 55

  let groupSize: number | undefined
  const g = t.match(/(\d{1,3})\s*(pessoas|amigos|convidados|pax|amigas)/) ?? t.match(/(?:pra|para|somos)\s+(\d{1,3})\b(?!\s*(reais|conto|r\$))/)
  if (g) groupSize = Number(g[1])
  if (!groupSize) groupSize = occasion === 'solo' ? 1 : occasion === 'date' ? 2 : t.includes('pais') ? 3 : 4

  let hood = HOODS.find((h) => t.includes(norm(h)))
  if (!hood) for (const [alias, h] of Object.entries(HOOD_ALIAS)) if (h && t.includes(alias)) hood = h

  return { occasion, groupSize, budget, hood, niches, vibes }
}

export function rank(places: Place[], c: Criteria, profile?: Profile | null): Ranked[] {
  const out = places.map((place) => {
    let score = 0
    const why: [number, string][] = []

    for (const n of c.niches) if (place.niches.includes(n)) { score += 3; why.push([3, `É ${nicheLabel(n).toLowerCase()} de verdade`]) }
    if (!c.niches.length && profile) for (const n of profile.niches) if (place.niches.includes(n)) { score += 1.4; why.push([1.4, `Bate com seu gosto por ${nicheLabel(n).toLowerCase()}`]) }
    for (const v of c.vibes) if (place.vibes.includes(v)) { score += 1.6; why.push([1.6, `Clima ${vibeLabel(v).toLowerCase()}, como você pediu`]) }
    if (profile) for (const v of profile.vibes) if (place.vibes.includes(v)) score += 0.5

    if (c.occasion) {
      if (place.occasions.includes(c.occasion)) { score += 3; why.push([2.8, `Comunidade aprova pra ${occasionLabel(c.occasion).toLowerCase()}`]) }
      else score -= 1.5
    }

    if (c.groupSize > place.capacity) score -= 7
    else if (c.groupSize >= 8) { score += 2; why.push([2.6, `Cabe seu grupo de ${c.groupSize} (até ${place.capacity})`]) }

    if (c.budget) {
      if (place.price <= c.budget) { score += 1.5; why.push([1.5, place.price === 0 ? 'Grátis' : `~R$ ${place.price}/pessoa, dentro do orçamento`]) }
      else if (place.price > c.budget * 1.25) score -= 4
      else score -= 1
    }

    if (c.hood) {
      if (place.hood === c.hood) { score += 2.5; why.push([2.4, `Fica em ${place.hood}`]) }
      else score -= 0.5
    } else if (profile?.hood && place.hood === profile.hood) { score += 0.8; why.push([0.8, `Perto de você, em ${place.hood}`]) }

    score += (place.rating - 8) * 1.5
    if (place.rating >= 8.8) why.push([1.2, `Nota ${place.rating.toFixed(1)} na comunidade`])

    const reasons = why.sort((a, b) => b[0] - a[0]).map(([, s]) => s).filter((s, i, a) => a.indexOf(s) === i).slice(0, 3)
    if (!reasons.length) reasons.push(place.tagline)
    return { place, score, reasons, match: 0 }
  })

  out.sort((a, b) => b.score - a.score)
  const top = out[0]?.score ?? 1
  for (const r of out) r.match = Math.max(52, Math.min(98, Math.round(70 + (r.score / Math.max(top, 1)) * 27)))
  return out
}

export function introFor(c: Criteria, top: Ranked[]): string {
  const parts: string[] = []
  if (c.occasion) parts.push(occasionLabel(c.occasion).toLowerCase())
  if (c.groupSize > 2) parts.push(`${c.groupSize} pessoas`)
  if (c.hood) parts.push(`em ${c.hood}`)
  if (c.budget) parts.push(`até R$ ${c.budget}`)
  const what = parts.length ? parts.join(', ') : 'o que você descreveu'
  const best = top[0]?.place.name
  return `Entendi: ${what}. Cruzei ${c.niches.length ? c.niches.map((n) => nicheLabel(n).toLowerCase()).join(' + ') : 'seu gosto'} com capacidade, preço e o que a comunidade aprovou. ${best ? `${best} é a aposta mais segura.` : ''}`
}
