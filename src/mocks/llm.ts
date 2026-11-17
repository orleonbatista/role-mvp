import type { Criteria, Occasion, Tag } from '../lib/types'
import { ALL, NICHES, OCCS, TAGS, VIBES, askBody, ollamaBody, type PlaceFact } from './llmPrompt'

/**
 * IA híbrida OPCIONAL: um LLM extrai critérios estruturados do texto; o ranking continua
 * determinístico e explicável (ranker.ts). Dois modos:
 *
 * 1) DEV (seu PC): .env.local com VITE_OLLAMA_MODEL=qwen2.5:7b → chama /ollama/* e o proxy
 *    do Vite repassa ao Ollama local (vite.config.ts).
 * 2) GATEWAY (site publicado): o app lê um JSON de configuração (VITE_LLM_CONFIG_URL, ex.:
 *    llm.json no repo) com a URL do túnel até llm-gateway/server.mjs no seu PC. O gateway só
 *    aceita o texto do pedido e monta o prompt no servidor. Override por aparelho em /testes.
 *
 * Extração ANCORADA: cada critério cita o trecho do pedido que o justifica; o que não aparece
 * no texto é descartado. Se nada responder a tempo, fica só o parser por regras.
 */
const DEV_MODEL = import.meta.env.VITE_OLLAMA_MODEL as string | undefined
const DEV_URL = DEV_MODEL ? ((import.meta.env.VITE_OLLAMA_URL as string | undefined) ?? `${import.meta.env.BASE_URL.replace(/\/$/, '')}/ollama`) : undefined
const CONFIG_URL = import.meta.env.VITE_LLM_CONFIG_URL as string | undefined
const OVERRIDE_KEY = 'role.llmUrl'

export interface GatewayConfig { enabled: boolean; url?: string; model?: string; owner?: string }
let cfg: { at: number; value: GatewayConfig | null } | null = null
let downUntil = 0

export async function gatewayConfig(force = false): Promise<GatewayConfig | null> {
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem(OVERRIDE_KEY) : null
  if (override) return { enabled: true, url: override.replace(/\/$/, ''), owner: 'override' }
  if (!CONFIG_URL) return null
  if (!force && cfg && Date.now() - cfg.at < 120_000) return cfg.value
  try {
    const r = await fetch(`${CONFIG_URL}?t=${Math.floor(Date.now() / 60_000)}`, { signal: AbortSignal.timeout(4000) })
    const value = r.ok ? ((await r.json()) as GatewayConfig) : null
    cfg = { at: Date.now(), value }
    return value
  } catch {
    cfg = { at: Date.now(), value: null }
    return null
  }
}

export const setLLMOverride = (url: string | null) => (url ? localStorage.setItem(OVERRIDE_KEY, url) : localStorage.removeItem(OVERRIDE_KEY))
export const getLLMOverride = () => localStorage.getItem(OVERRIDE_KEY)

export async function llmStatus(): Promise<{ mode: 'dev' | 'gateway' | 'off'; ok: boolean; detail: string }> {
  if (DEV_URL) {
    try {
      const r = await fetch(`${DEV_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
      return { mode: 'dev', ok: r.ok, detail: `Ollama local (${DEV_MODEL})` }
    } catch { return { mode: 'dev', ok: false, detail: 'Ollama local não respondeu' } }
  }
  const c = await gatewayConfig(true)
  if (!c?.enabled || !c.url) return { mode: 'off', ok: false, detail: 'Sem LLM configurado: usando só regras' }
  try {
    const r = await fetch(`${c.url}/health`, { signal: AbortSignal.timeout(5000) })
    const j = await r.json()
    return { mode: 'gateway', ok: !!j.ok, detail: j.ok ? `${j.model} em ${c.url}` : `gateway respondeu, mas o modelo está fora (${c.url})` }
  } catch { return { mode: 'gateway', ok: false, detail: `PC/túnel fora do ar (${c.url})` } }
}

/* ---------- validação ancorada ---------- */
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

/** pergunta ao LLM disponível (dev direto ou gateway); null se não houver nenhum */
export async function askLLM(text: string, signal?: AbortSignal): Promise<{ raw: LLMRaw; model: string; via: string } | null> {
  if (DEV_URL) {
    const res = await fetch(`${DEV_URL}/api/chat`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ollamaBody(DEV_MODEL!, text)) })
    if (!res.ok) throw new Error(`ollama ${res.status}`)
    const json = await res.json()
    return { raw: JSON.parse(json.message?.content ?? '{}'), model: DEV_MODEL!, via: 'sua GPU' }
  }
  if (Date.now() < downUntil) return null
  const c = await gatewayConfig()
  if (!c?.enabled || !c.url) return null
  try {
    const res = await fetch(`${c.url}/extract`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
    if (!res.ok) throw new Error(`gateway ${res.status}`)
    const j = await res.json()
    return { raw: j.raw ?? {}, model: j.model ?? c.model ?? 'LLM', via: c.owner && c.owner !== 'override' ? `GPU do ${c.owner}` : 'GPU remota' }
  } catch (e) {
    downUntil = Date.now() + 60_000 // fora do ar: não fica esperando a cada pedido
    throw e
  }
}

export async function refineWithLLM(text: string, base: Criteria): Promise<Criteria> {
  if (!DEV_URL && !CONFIG_URL && !getLLMOverrideSafe()) return base
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), DEV_URL ? 15000 : 9000)
  const t0 = performance.now()
  try {
    const got = await askLLM(text, ctrl.signal)
    if (!got) return base
    const out = got.raw
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
      source: { engine: 'llm', model: got.model, ms: Math.round(performance.now() - t0), via: got.via },
    }
  } catch (e) {
    console.warn('[rolê] LLM indisponível, usando só regras:', e)
    return base
  } finally {
    clearTimeout(timer)
  }
}

function getLLMOverrideSafe() {
  try { return localStorage.getItem(OVERRIDE_KEY) } catch { return null }
}

/** pergunta livre sobre as opções de uma votação; null se não houver LLM disponível */
export async function askPollLLM(question: string, pedido: string, facts: PlaceFact[]): Promise<{ answer: string; model: string; via: string; ms: number } | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  const t0 = performance.now()
  try {
    if (DEV_URL) {
      const res = await fetch(`${DEV_URL}/api/chat`, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(askBody(DEV_MODEL!, question, pedido, facts)) })
      if (!res.ok) throw new Error(`ollama ${res.status}`)
      const j = await res.json()
      return { answer: String(j.message?.content ?? '').trim(), model: DEV_MODEL!, via: 'sua GPU', ms: Math.round(performance.now() - t0) }
    }
    if (Date.now() < downUntil) return null
    const c = await gatewayConfig()
    if (!c?.enabled || !c.url) return null
    const res = await fetch(`${c.url}/ask`, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, pedido, facts }) })
    if (!res.ok) throw new Error(`gateway ${res.status}`)
    const j = await res.json()
    return { answer: j.answer, model: j.model, via: c.owner && c.owner !== 'override' ? `GPU do ${c.owner}` : 'GPU remota', ms: Math.round(performance.now() - t0) }
  } catch (e) {
    if (!DEV_URL) downUntil = Date.now() + 60_000
    console.warn('[rolê] pergunta sem LLM, usando regras:', e)
    return null
  } finally {
    clearTimeout(timer)
  }
}
