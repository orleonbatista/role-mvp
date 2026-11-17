// Gateway do LLM para testes: expõe SÓ a extração de critérios, com origem permitida,
// limite de uso e fila de 1 por vez na GPU. Fica entre o túnel (cloudflared) e o Ollama.
//   node llm-gateway/server.mjs        (ou llm-gateway\start.cmd, que também abre o túnel)
import http from 'node:http'
import { ollamaBody } from '../src/mocks/llmPrompt.ts'

const PORT = Number(process.env.PORT ?? 8787)
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
const MODEL = process.env.LLM_MODEL ?? 'qwen2.5:7b'
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'https://orleonbatista.github.io,http://localhost:5173,http://localhost:4173')
  .split(',').map((s) => s.trim())
const MAX_TEXT = 400
const PER_MIN = 20
const PER_DAY = 400

const hits = new Map() // ip -> timestamps (ms)
let queue = Promise.resolve()
const stats = { ok: 0, fail: 0, limited: 0, since: new Date().toISOString() }

function allowedOrigin(origin) {
  if (!origin) return null
  if (ORIGINS.includes(origin)) return origin
  // celulares na mesma rede rodando o dev server (http://192.168.x.x:5173)
  if (/^http:\/\/(192\.168|10)\.\d+\.\d+(\.\d+)?:51\d\d$/.test(origin)) return origin
  return null
}

function limited(ip) {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 86_400_000)
  const lastMin = arr.filter((t) => now - t < 60_000).length
  if (lastMin >= PER_MIN || arr.length >= PER_DAY) return true
  arr.push(now)
  hits.set(ip, arr)
  return false
}

function send(res, status, body, origin) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(body))
}

const server = http.createServer(async (req, res) => {
  const origin = allowedOrigin(req.headers.origin)
  if (req.method === 'OPTIONS') {
    res.writeHead(origin ? 204 : 403, origin ? {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin',
    } : {})
    return res.end()
  }
  if (req.method === 'GET' && req.url === '/health') {
    try {
      const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) })
      const tags = await r.json()
      const has = (tags.models ?? []).some((m) => m.name === MODEL || m.model === MODEL)
      return send(res, has ? 200 : 503, { ok: has, model: MODEL, stats }, origin)
    } catch {
      return send(res, 503, { ok: false, error: 'ollama_offline' }, origin)
    }
  }
  if (req.method !== 'POST' || req.url !== '/extract') return send(res, 404, { error: 'not_found' }, origin)
  if (!origin) return send(res, 403, { error: 'origin' }, null)

  const ip = String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '?')
  if (limited(ip)) { stats.limited++; return send(res, 429, { error: 'rate_limited' }, origin) }

  let raw = ''
  for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return send(res, 413, { error: 'too_large' }, origin) }
  let text
  try { text = String(JSON.parse(raw).text ?? '').trim() } catch { return send(res, 400, { error: 'bad_json' }, origin) }
  if (!text || text.length > MAX_TEXT) return send(res, 400, { error: 'bad_text' }, origin)

  // uma extração por vez: a GPU de 8 GB não ganha nada com paralelismo e o tempo fica previsível
  const job = queue.then(async () => {
    const t0 = Date.now()
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaBody(MODEL, text)), signal: AbortSignal.timeout(20_000),
    })
    if (!r.ok) throw new Error(`ollama ${r.status}`)
    const j = await r.json()
    return { raw: JSON.parse(j.message?.content ?? '{}'), model: MODEL, ms: Date.now() - t0 }
  })
  queue = job.catch(() => {})
  try {
    const out = await job
    stats.ok++
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ok ${out.ms}ms  ${ip}  "${text.slice(0, 60)}"`)
    send(res, 200, out, origin)
  } catch (e) {
    stats.fail++
    console.warn('falha:', e.message)
    send(res, 502, { error: 'llm_failed' }, origin)
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`gateway do LLM em http://127.0.0.1:${PORT}  (modelo ${MODEL}, origens: ${ORIGINS.join(', ')})`)
})
