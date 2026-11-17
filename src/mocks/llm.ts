import type { Criteria, Niche, Occasion, Tag, Vibe } from '../lib/types'

/**
 * IA híbrida OPCIONAL: um LLM local (Ollama) extrai critérios estruturados do texto;
 * o ranking continua determinístico e explicável (ranker.ts).
 *
 * Ativar: .env.local com  VITE_OLLAMA_MODEL=qwen2.5:7b  e rodar `npm run dev`.
 * O app chama /ollama/* e o proxy do Vite repassa ao Ollama local (vite.config.ts) —
 * funciona também do celular na mesma rede. No GitHub Pages não há proxy: vale só o parser por regras.
 *
 * Extração ANCORADA: cada critério precisa citar o trecho exato do pedido que o justifica;
 * o que não aparece no texto é descartado. Isso corta a alucinação típica de modelos pequenos.
 */
const MODEL = import.meta.env.VITE_OLLAMA_MODEL as string | undefined
const URL_ = MODEL ? ((import.meta.env.VITE_OLLAMA_URL as string | undefined) ?? `${import.meta.env.BASE_URL.replace(/\/$/, '')}/ollama`) : undefined

const NICHES: Niche[] = ['listening', 'eletronica', 'boteco', 'gastronomia', 'drinks', 'jazz', 'ao-ar-livre']
const VIBES: Vibe[] = ['tranquilo', 'animado', 'intimista', 'underground', 'descolado', 'raiz', 'sofisticado']
const OCCS: Occasion[] = ['aniversario', 'date', 'amigos', 'solo', 'trabalho', 'esquenta']
const TAGS: Tag[] = ['vegano', 'samba', 'pet', 'acessivel', 'karaoke', 'funk', 'sertanejo', 'open-bar']

export const llmEnabled = () => Boolean(URL_)
export const llmModel = () => MODEL

const SYSTEM = `Você extrai critérios de pedidos de rolê (bares, restaurantes, baladas, eventos em São Paulo).
Regras:
- Cada item precisa de "trecho": as palavras EXATAS do pedido que justificam o item (copie do texto).
- Só inclua o que o pedido diz ou implica claramente. Na dúvida, não inclua. Listas vazias são normais.
- Nunca repita itens. No máximo 5 itens.
- ocasiao "nenhuma", pessoas 0 e orcamento 0 quando não forem ditos.
Valores:
- nichos: listening (som/vinil), eletronica (balada, techno, dançar, pista), boteco (bar raiz, petisco, acepipe, cerveja, chopp),
  gastronomia (comer, jantar, almoçar, restaurante), drinks (drink, coquetel, vinho, rooftop), jazz (música ao vivo, jazz), ao-ar-livre (quintal, laje, céu aberto)
- vibes: tranquilo (dá pra conversar, calmo), animado (agitado, festa), intimista (romântico, a dois), underground, descolado, raiz (simples, barato), sofisticado (chique, especial)
- tags: vegano, samba (samba/pagode), pet (cachorro), acessivel (só cadeirante/mobilidade reduzida), karaoke, funk, sertanejo, open-bar
- ocasiao: aniversario, date (encontro, crush, namorada), amigos (galera, parças, família), trabalho (firma, equipe, expediente), esquenta, solo (sozinho)
- orcamento: valor máximo por pessoa em reais, só se houver número.`

const EXAMPLES: [string, unknown][] = [
  ['quero levar minha namorada pra jantar num lugar especial, até 200 conto', {
    ocasiao: { valor: 'date', trecho: 'minha namorada' }, pessoas: { valor: 2, trecho: 'levar minha namorada' }, orcamento: { valor: 200, trecho: 'até 200 conto' },
    itens: [{ valor: 'gastronomia', trecho: 'jantar' }, { valor: 'sofisticado', trecho: 'lugar especial' }],
  }],
  ['bora tomar uma com a galera depois do trampo', {
    ocasiao: { valor: 'amigos', trecho: 'com a galera' }, pessoas: { valor: 0, trecho: '' }, orcamento: { valor: 0, trecho: '' },
    itens: [{ valor: 'boteco', trecho: 'tomar uma' }],
  }],
]

const ALL = [...NICHES, ...VIBES, ...TAGS] as string[]
const SCHEMA = {
  type: 'object',
  properties: {
    ocasiao: { type: 'object', properties: { valor: { type: 'string', enum: [...OCCS, 'nenhuma'] }, trecho: { type: 'string' } }, required: ['valor', 'trecho'] },
    pessoas: { type: 'object', properties: { valor: { type: 'integer' }, trecho: { type: 'string' } }, required: ['valor', 'trecho'] },
    orcamento: { type: 'object', properties: { valor: { type: 'integer' }, trecho: { type: 'string' } }, required: ['valor', 'trecho'] },
    itens: {
      type: 'array', maxItems: 5,
      items: { type: 'object', properties: { valor: { type: 'string', enum: ALL }, trecho: { type: 'string' } }, required: ['valor', 'trecho'] },
    },
  },
  required: ['ocasiao', 'pessoas', 'orcamento', 'itens'],
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
function lev1(a: string, b: string) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}
/** palavras genéricas não justificam nada sozinhas */
const GENERIC = new Set(['role', 'lugar', 'algo', 'quero', 'um', 'uma', 'pra', 'para', 'com', 'de', 'tem', 'algum', 'bom', 'legal'])
/** o trecho citado existe no pedido? (tolera acento, pontuação e 1 letra trocada por palavra) */
function grounded(text: string, trecho: unknown) {
  if (typeof trecho !== 'string') return false
  const t = norm(trecho)
  if (!t || (t.length < 3 && !/\d/.test(t))) return false
  const words = t.split(' ')
  if (words.every((w) => GENERIC.has(w))) return false
  const src = norm(text).split(' ')
  return words.every((w) => src.some((s) => lev1(w, s)))
}

/** tags são atributos literais: o trecho precisa ter vocabulário da própria tag */
const TAG_GUARD: Record<Tag, RegExp> = {
  vegano: /vegan|vegetarian|plant/, samba: /samba|pagod/, pet: /pet|cachorr|dog|cao|caes|gato/,
  acessivel: /cadeir|rampa|acessib|mobilidade|deficien|pcd/, karaoke: /karaok|cantar/, funk: /funk|baile/,
  sertanejo: /sertanej|modao|moda de viola/, 'open-bar': /open ?bar|bebida liberada|open/,
}

export interface LLMRaw { ocasiao?: { valor: string; trecho: string }; pessoas?: { valor: number; trecho: string }; orcamento?: { valor: number; trecho: string }; itens?: { valor: string; trecho: string }[] }

export async function askLLM(text: string, signal?: AbortSignal): Promise<LLMRaw> {
  const res = await fetch(`${URL_}/api/chat`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      stream: false,
      format: SCHEMA,
      keep_alive: '30m',
      options: { temperature: 0, num_predict: 220, repeat_penalty: 1.15 },
      messages: [
        { role: 'system', content: SYSTEM },
        ...EXAMPLES.flatMap(([q, a]) => [{ role: 'user', content: q }, { role: 'assistant', content: JSON.stringify(a) }]),
        { role: 'user', content: text },
      ],
    }),
  })
  if (!res.ok) throw new Error(`ollama ${res.status}`)
  const json = await res.json()
  return JSON.parse(json.message?.content ?? '{}')
}

export async function refineWithLLM(text: string, base: Criteria): Promise<Criteria> {
  if (!URL_) return base
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000) // 1ª chamada carrega o modelo na GPU
  const t0 = performance.now()
  try {
    const out = await askLLM(text, ctrl.signal)
    const items = (out.itens ?? []).filter((i) =>
      ALL.includes(i.valor) && grounded(text, i.trecho) &&
      (!(TAGS as string[]).includes(i.valor) || TAG_GUARD[i.valor as Tag].test(norm(i.trecho))))
    const of = <T extends string>(allowed: readonly T[]) => [...new Set(items.map((i) => i.valor).filter((v): v is T => allowed.includes(v as T)))]
    const occ = out.ocasiao && OCCS.includes(out.ocasiao.valor as Occasion) && grounded(text, out.ocasiao.trecho) ? (out.ocasiao.valor as Occasion) : undefined
    const people = out.pessoas && out.pessoas.valor > 0 && out.pessoas.valor < 500 && grounded(text, out.pessoas.trecho) ? out.pessoas.valor : undefined
    const budget = out.orcamento && out.orcamento.valor > 0 && /\d/.test(out.orcamento.trecho ?? '') && grounded(text, out.orcamento.trecho) ? out.orcamento.valor : undefined
    // união: regras garantem números/bairro/dia; o LLM soma sinônimos e contexto ancorados no texto
    const occasion = base.occasion ?? occ
    const explicitNumber = /\d/.test(text)
    const groupSize = explicitNumber && base.groupSize !== 4 ? base.groupSize
      : people ?? (occasion === 'date' ? 2 : occasion === 'solo' ? 1 : base.groupSize)
    return {
      ...base,
      occasion,
      groupSize,
      budget: base.budget ?? budget,
      niches: [...new Set([...base.niches, ...of(NICHES)])],
      vibes: [...new Set([...base.vibes, ...of(VIBES)])],
      tags: [...new Set([...base.tags, ...of(TAGS)])],
      source: { engine: 'llm', model: MODEL, ms: Math.round(performance.now() - t0) },
    }
  } catch (e) {
    console.warn('[rolê] LLM indisponível, usando só regras:', e)
    return base
  } finally {
    clearTimeout(timer)
  }
}
