import type { Criteria, Place, VoteTally } from './types'
import type { PlaceFact } from '../mocks/llmPrompt'
import { KIND_LABEL, nicheLabel, vibeLabel } from './labels'
import { distanceKm, fmtKm, isOpenAt, openStatus } from './hours'
import { rank } from '../mocks/ranker'
import { askPollLLM } from '../mocks/llm'

export interface PollAnswer { text: string; highlight: string[]; engine: 'regras' | 'llm'; model?: string; via?: string; ms?: number }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const TAG_TXT: Record<string, string> = { vegano: 'opção vegana', samba: 'samba', pet: 'pet friendly', acessivel: 'acessível', karaoke: 'karaokê' }
const money = (p: Place) => (p.price === 0 ? 'grátis' : `~R$ ${p.price}`)
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

export function factsFor(options: Place[], tally: VoteTally[], hood?: string): PlaceFact[] {
  return options.map((p) => ({
    nome: p.name, bairro: p.hood, tipo: KIND_LABEL[p.kind], preco_pessoa: p.price, capacidade: p.capacity, nota: p.rating,
    estilos: p.niches.map(nicheLabel), clima: p.vibes.map(vibeLabel), extras: [...p.tags.map((t) => TAG_TXT[t] ?? t), ...(p.privateSpace ? ['espaço reservável para grupo'] : [])],
    horario: p.kind === 'evento' ? (p.when ?? '') : p.hours, destaques: p.highlights,
    distancia_km: distanceKm(hood, p.hood), votos: tally.find((t) => t.placeId === p.id)?.count ?? 0,
  }))
}

/** motor de regras: responde as perguntas mais comuns sem LLM, só com os dados do catálogo */
export function answerByRules(question: string, options: Place[], c: Criteria, tally: VoteTally[], hood?: string): PollAnswer {
  const q = ` ${norm(question)} `
  const has = (...k: string[]) => k.some((w) => q.includes(w))
  const out = (text: string, ps: Place[]) => ({ text, highlight: ps.map((p) => p.id), engine: 'regras' as const })
  if (!options.length) return out('Ainda não tem opções nessa votação.', [])

  if (has('barat', 'preco', 'caro', 'em conta', 'custa', 'grana', 'gastar')) {
    const s = [...options].sort((a, b) => a.price - b.price)
    return out(`Mais em conta: ${s[0].name} (${money(s[0])} por pessoa)${s[1] ? `, depois ${s[1].name} (${money(s[1])})` : ''}. O mais caro é ${s[s.length - 1].name} (${money(s[s.length - 1])}).`, [s[0]])
  }
  if (has('cabe', 'grupo', 'pessoas', 'capacidade', 'galera', 'todo mundo', 'lotad')) {
    const n = c.groupSize
    const fit = options.filter((p) => p.capacity >= n)
    const priv = fit.filter((p) => p.privateSpace)
    if (!fit.length) return out(`Nenhuma opção comporta bem ${n} pessoas; a maior é ${[...options].sort((a, b) => b.capacity - a.capacity)[0].name}.`, [])
    return out(`Pra ${n} pessoas cabem ${list(fit.map((p) => p.name))}.${priv.length ? ` ${list(priv.map((p) => p.name))} ${priv.length > 1 ? 'têm' : 'tem'} espaço reservável pro grupo.` : ''}`, priv.length ? priv : fit)
  }
  if (has('perto', 'longe', 'distanc', 'chegar', 'metro', 'uber')) {
    const base = c.hood ?? hood
    if (!base) return out('Não sei de onde vocês saem: me diga o bairro no pedido que eu comparo a distância.', [])
    const s = [...options].map((p) => ({ p, km: distanceKm(base, p.hood) ?? 99 })).sort((a, b) => a.km - b.km)
    return out(`A partir de ${base}, o mais perto é ${s[0].p.name} (${fmtKm(s[0].km)}, em ${s[0].p.hood}). O mais longe é ${s[s.length - 1].p.name} (${fmtKm(s[s.length - 1].km)}).`, [s[0].p])
  }
  if (has('abert', 'horario', 'abre', 'fecha', 'funciona', 'hoje', 'sabado', 'sexta', 'domingo', 'madrugada')) {
    if (c.when?.day !== undefined) {
      const d = c.when.day, h = c.when.hour ?? 21
      const ok = options.filter((p) => isOpenAt(p.periods, d, h))
      const no = options.filter((p) => !ok.includes(p))
      return out(`${c.when.label[0].toUpperCase()}${c.when.label.slice(1)}${c.when.hour === undefined ? ' à noite' : ''}: ${ok.length ? `abertos ${list(ok.map((p) => p.name))}` : 'nenhuma opção aberta'}.${no.length ? ` Fechados: ${list(no.map((p) => p.name))}.` : ''}`, ok)
    }
    return out(options.map((p) => `${p.name}: ${p.kind === 'evento' ? p.when : openStatus(p).label.toLowerCase()}`).join(' · '), options.filter((p) => openStatus(p).open))
  }
  if (has('nota', 'avalia', 'bem avaliad', 'melhor avaliad', 'reputa')) {
    const s = [...options].sort((a, b) => b.rating - a.rating)
    return out(`Melhor nota na comunidade: ${s[0].name} (${s[0].rating.toFixed(1)}, ${s[0].ratingCount} avaliações)${s[1] ? `, depois ${s[1].name} (${s[1].rating.toFixed(1)})` : ''}.`, [s[0]])
  }
  const tagAsk: [string[], string][] = [[['vegan', 'vegetarian'], 'vegano'], [['pet', 'cachorr', 'dog'], 'pet'], [['acessiv', 'cadeirante', 'rampa'], 'acessivel'], [['karaok', 'cantar'], 'karaoke'], [['samba', 'pagod'], 'samba']]
  for (const [kws, tag] of tagAsk) if (has(...kws)) {
    const ok = options.filter((p) => p.tags.includes(tag as never))
    return out(ok.length ? `Com ${TAG_TXT[tag]}: ${list(ok.map((p) => p.name))}.` : `Nenhuma opção tem ${TAG_TXT[tag]} confirmado no catálogo.`, ok)
  }
  if (has('musica', 'ao vivo', 'jazz', ' dj', 'danc', 'balada', 'som ')) {
    const ok = options.filter((p) => p.niches.some((n) => n === 'jazz' || n === 'eletronica' || n === 'listening'))
    return out(ok.length ? ok.map((p) => `${p.name}: ${p.niches.filter((n) => ['jazz', 'eletronica', 'listening'].includes(n)).map((n) => nicheLabel(n).toLowerCase()).join(', ')}`).join(' · ') : 'Nenhuma opção é focada em música; são mais pra comer e conversar.', ok)
  }
  if (has('ar livre', 'externa', 'terraco', 'rooftop', 'ceu', 'sol', 'fumar')) {
    const ok = options.filter((p) => p.niches.includes('ao-ar-livre'))
    return out(ok.length ? `Ao ar livre: ${list(ok.map((p) => p.name))}.` : 'Nenhuma opção tem área externa no catálogo.', ok)
  }
  if (has('conversar', 'tranquil', 'barulh', 'calmo', 'ouvir')) {
    const ok = options.filter((p) => p.vibes.some((v) => v === 'tranquilo' || v === 'intimista'))
    return out(ok.length ? `Pra conversar: ${list(ok.map((p) => p.name))} ${ok.length > 1 ? 'são' : 'é'} mais tranquilo${ok.length > 1 ? 's' : ''}.` : 'Todas são mais animadas; pra conversar, chegue cedo.', ok)
  }
  if (has('ganhando', 'votos', 'placar', 'lider', 'frente')) {
    const s = [...tally].sort((a, b) => b.count - a.count)
    const top = options.find((p) => p.id === s[0]?.placeId)
    return out(top && s[0].count ? `${top.name} está na frente com ${s[0].count} ${s[0].count === 1 ? 'voto' : 'votos'}.` : 'Ainda ninguém votou.', top ? [top] : [])
  }
  if (has('recomend', 'melhor', 'escolh', 'qual vai', 'indica', 'vale a pena', 'qual voce')) {
    const r = rank(options, c)[0]
    return out(`Pelo pedido, ${r.place.name} encaixa melhor: ${r.reasons.slice(0, 2).join('; ').toLowerCase()}.${r.warnings.length ? ` Atenção: ${r.warnings[0].toLowerCase()}.` : ''}`, [r.place])
  }
  return out('Posso comparar preço, se cabe o grupo, distância, horário, nota, música, área externa e extras como vegano, pet ou acessível. Pergunta de novo?', [])
}

/** tenta o LLM (se no ar); senão, regras. O LLM só recebe fatos do catálogo. */
export async function askPoll(question: string, pedido: string, options: Place[], c: Criteria, tally: VoteTally[], hood?: string): Promise<PollAnswer> {
  const llm = await askPollLLM(question, pedido, factsFor(options, tally, c.hood ?? hood))
  if (llm?.answer) {
    const a = norm(llm.answer)
    return { text: llm.answer, highlight: options.filter((p) => a.includes(norm(p.name))).map((p) => p.id), engine: 'llm', model: llm.model, via: llm.via, ms: llm.ms }
  }
  return answerByRules(question, options, c, tally, hood)
}
