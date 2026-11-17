import type { Criteria, Niche, Occasion, Tag, Vibe } from '../lib/types'

/**
 * IA híbrida OPCIONAL: um LLM local (Ollama) só extrai critérios estruturados do texto;
 * o ranking continua determinístico e explicável (ranker.ts).
 *
 * Ativar (.env.local):
 *   VITE_OLLAMA_URL=http://localhost:11434
 *   VITE_OLLAMA_MODEL=qwen2.5:7b
 * e iniciar o Ollama com OLLAMA_ORIGINS=* (libera CORS para o navegador).
 * Sem essas variáveis, ou se o modelo falhar/demorar, fica só o parser por regras.
 */
const URL_ = import.meta.env.VITE_OLLAMA_URL as string | undefined
const MODEL = (import.meta.env.VITE_OLLAMA_MODEL as string | undefined) ?? 'qwen2.5:7b'

const NICHES: Niche[] = ['listening', 'eletronica', 'boteco', 'gastronomia', 'drinks', 'jazz', 'ao-ar-livre']
const VIBES: Vibe[] = ['tranquilo', 'animado', 'intimista', 'underground', 'descolado', 'raiz', 'sofisticado']
const OCCS: Occasion[] = ['aniversario', 'date', 'amigos', 'solo', 'trabalho', 'esquenta']
const TAGS: Tag[] = ['vegano', 'samba', 'pet', 'acessivel', 'karaoke', 'funk', 'sertanejo', 'open-bar']

export const llmEnabled = () => Boolean(URL_)

export async function refineWithLLM(text: string, base: Criteria): Promise<Criteria> {
  if (!URL_) return base
  const schema = {
    type: 'object',
    properties: {
      occasion: { type: ['string', 'null'], enum: [...OCCS, null] },
      groupSize: { type: ['integer', 'null'] },
      budget: { type: ['integer', 'null'] },
      niches: { type: 'array', items: { type: 'string', enum: NICHES } },
      vibes: { type: 'array', items: { type: 'string', enum: VIBES } },
      tags: { type: 'array', items: { type: 'string', enum: TAGS } },
    },
    required: ['niches', 'vibes', 'tags'],
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(`${URL_}/api/chat`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        format: schema,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: 'Extraia critérios de um pedido de rolê (bar/restaurante/evento em São Paulo). Responda só JSON no schema. Use apenas os valores permitidos; deixe vazio o que não foi dito.' },
          { role: 'user', content: text },
        ],
      }),
    })
    const json = await res.json()
    const out = JSON.parse(json.message?.content ?? '{}')
    const pick = <T,>(arr: unknown, allowed: T[]) => (Array.isArray(arr) ? arr.filter((x): x is T => allowed.includes(x as T)) : [])
    // união: regras + LLM (o LLM pega sinônimos e contexto; as regras garantem números e bairro)
    return {
      ...base,
      occasion: base.occasion ?? (OCCS.includes(out.occasion) ? out.occasion : undefined),
      groupSize: base.groupSize !== 4 ? base.groupSize : Number.isInteger(out.groupSize) && out.groupSize > 0 ? out.groupSize : base.groupSize,
      budget: base.budget ?? (Number.isInteger(out.budget) ? out.budget : undefined),
      niches: [...new Set([...base.niches, ...pick(out.niches, NICHES)])],
      vibes: [...new Set([...base.vibes, ...pick(out.vibes, VIBES)])],
      tags: [...new Set([...base.tags, ...pick(out.tags, TAGS)])],
    }
  } catch {
    return base
  } finally {
    clearTimeout(timer)
  }
}
