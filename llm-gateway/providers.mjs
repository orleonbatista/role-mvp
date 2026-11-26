// LLM do rolê: provedores na nuvem (API compatível com OpenAI) em cadeia, com a GPU do PC (Ollama) como último recurso.
// Ordem padrão: Gemini → Groq → OpenRouter → Ollama. Quem falhar (limite do plano grátis, fora do ar, JSON inválido)
// fica 2 min de castigo e a chamada segue pro próximo.
// Chaves: llm-gateway/data/llm-keys.json (fora do git) ou variáveis de ambiente GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY.
//   { "gemini": "...", "groq": "...", "openrouter": "...", "order": ["gemini", "groq", "openrouter", "ollama"],
//     "models": { "gemini": "gemini-3.5-flash-lite" } }   ← opcional: troca o modelo sem mexer no código
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'

const CATALOG = {
  gemini: { name: 'Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite', env: 'GEMINI_API_KEY', extra: {} },
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1', model: process.env.GROQ_MODEL ?? 'openai/gpt-oss-20b', env: 'GROQ_API_KEY', extra: { reasoning_effort: 'low' } },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-oss-20b:free', env: 'OPENROUTER_API_KEY', extra: {} },
}

export function createLLM({ dataDir, ollamaModel }) {
  const file = join(dataDir, 'llm-keys.json')
  let cfg = { order: ['gemini', 'groq', 'openrouter', 'ollama'] }
  let cfgAt = 0
  const load = () => {
    // relê o arquivo a cada 30 s: dá pra colar uma chave nova sem reiniciar o gateway
    if (Date.now() - cfgAt < 30_000) return cfg
    cfgAt = Date.now()
    try { if (existsSync(file)) cfg = { ...cfg, ...JSON.parse(readFileSync(file, 'utf8')) } } catch (e) { console.warn('llm-keys.json inválido:', e.message) }
    return cfg
  }
  const keyOf = (p) => process.env[CATALOG[p].env] || load()[p] || ''
  const cooldown = new Map() // provedor -> até quando fica de fora
  const stats = {} // provedor -> { ok, fail }
  let gpu = Promise.resolve() // fila de 1 só pra GPU local
  const bump = (p, k) => { (stats[p] ??= { ok: 0, fail: 0 })[k]++ }

  async function cloud(p, body, timeout) {
    const c = { ...CATALOG[p], model: load().models?.[p] ?? CATALOG[p].model }
    const json = !!body.format
    const messages = json
      ? [{ ...body.messages[0], content: `${body.messages[0].content}\n\nResponda SOMENTE com um JSON válido neste schema: ${JSON.stringify(body.format)}` }, ...body.messages.slice(1)]
      : body.messages
    const r = await fetch(`${c.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyOf(p)}`, ...(p === 'openrouter' ? { 'HTTP-Referer': 'https://orleonbatista.github.io/role-mvp/', 'X-Title': 'rolê' } : {}) },
      body: JSON.stringify({
        model: c.model, messages, temperature: body.options?.temperature ?? 0,
        max_tokens: Math.max(600, (body.options?.num_predict ?? 300) * 3), // folga pro raciocínio dos modelos que pensam
        ...(json ? { response_format: { type: 'json_object' } } : {}), ...c.extra,
      }),
      signal: AbortSignal.timeout(timeout),
    })
    if (!r.ok) throw Object.assign(new Error(`${p} ${r.status} ${(await r.text()).slice(0, 120)}`), { status: r.status })
    const j = await r.json()
    const content = String(j.choices?.[0]?.message?.content ?? '').trim()
    if (!content) throw new Error(`${p} resposta vazia`)
    if (json) JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')) // valida: se não for JSON, tenta o próximo
    return { content: content.replace(/^```(?:json)?\s*|\s*```$/g, ''), model: j.model ?? c.model, via: c.name }
  }

  function local(body, timeout) {
    const job = gpu.then(async () => {
      const r = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, model: ollamaModel }), signal: AbortSignal.timeout(timeout),
      })
      if (!r.ok) throw new Error(`ollama ${r.status}`)
      const j = await r.json()
      return { content: String(j.message?.content ?? ''), model: ollamaModel, via: 'GPU do Orleon' }
    })
    gpu = job.catch(() => {})
    return job
  }

  /** body no formato do Ollama (messages, format = schema JSON, options); devolve { content, model, via } */
  async function chat(body, timeout = 20_000) {
    const order = load().order ?? []
    let last
    for (const p of order) {
      if (p !== 'ollama' && (!CATALOG[p] || !keyOf(p))) continue
      if ((cooldown.get(p) ?? 0) > Date.now()) continue
      try {
        const out = p === 'ollama' ? await local(body, timeout) : await cloud(p, body, Math.min(timeout, 15_000))
        bump(p, 'ok')
        return out
      } catch (e) {
        bump(p, 'fail')
        last = e
        console.warn(`llm ${p}: ${e.message}`)
        if (p !== 'ollama') cooldown.set(p, Date.now() + (e.status === 429 ? 120_000 : 60_000))
      }
    }
    throw last ?? new Error('nenhum provedor de LLM disponível')
  }

  function status() {
    const order = load().order ?? []
    return order.map((p) => ({
      provider: p, configured: p === 'ollama' || !!(CATALOG[p] && keyOf(p)), model: p === 'ollama' ? ollamaModel : load().models?.[p] ?? CATALOG[p]?.model,
      coolingDown: (cooldown.get(p) ?? 0) > Date.now(), ...(stats[p] ?? { ok: 0, fail: 0 }),
    }))
  }
  return { chat, status }
}
