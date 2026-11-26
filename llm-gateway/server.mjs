// Gateway do rolê para testes: fica entre o túnel (cloudflared) e o PC.
//  - LLM: expõe SÓ /extract e /ask (nunca a API crua do Ollama), com origem permitida, limite e fila de 1 na GPU.
//  - Dados: /api/* (api.mjs, SQLite) com pedidos, votos, sugestões, curadoria e métricas compartilhados entre aparelhos.
//   node llm-gateway/server.mjs        (ou llm-gateway\start.cmd, que também abre o túnel)
import http from 'node:http'
import { DESTAQUES, askBody, moderateBody, moderationRules, ollamaBody, pickBody } from '../src/mocks/llmPrompt.ts'
import { adminKeyFile, similarExamples, googleLogin, insertReview, dataDir, handleApi, insertPlace, placeForModeration, purgeGoogleSnaps, validLatLng } from './api.mjs'
import { geoFromCep, geoReverse } from './geo.mjs'

const PORT = Number(process.env.PORT ?? 8787)
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
const MODEL = process.env.LLM_MODEL ?? 'qwen2.5:7b'
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'https://orleonbatista.github.io,http://localhost:5173,http://localhost:4173')
  .split(',').map((s) => s.trim())
// ID do cliente do login com Google (público por natureza; o token só vale pra este app)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '235507423712-egg04ho66g7e4o8v552nrb4dck494opm.apps.googleusercontent.com'
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

// limite separado pra API de dados (bem mais folgado que o do LLM)
const apiHits = new Map()
function apiLimited(ip, write) {
  const now = Date.now()
  const key = `${ip}:${write ? 'w' : 'r'}`
  const arr = (apiHits.get(key) ?? []).filter((t) => now - t < 60_000)
  if (arr.length >= (write ? 90 : 400)) return true
  arr.push(now)
  apiHits.set(key, arr)
  return false
}

/** moderação pela LLM (fila de 1 na GPU, 8s); se falhar, deixa passar — as regras já pegaram o óbvio */
async function moderateLLM(name, comment) {
  const job = queue.then(async () => {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(moderateBody(MODEL, name, comment)), signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) throw new Error(`ollama ${r.status}`)
    const j = JSON.parse((await r.json()).message?.content ?? '{}')
    return { ok: j.ok !== false, motivo: j.ok === false ? String(j.motivo ?? 'conteúdo suspeito').slice(0, 60) : '' }
  })
  queue = job.catch(() => {})
  try { return await job } catch { return { ok: true, motivo: '' } }
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
      'Access-Control-Allow-Headers': 'Content-Type, X-Device, X-Admin-Key', 'Access-Control-Max-Age': '600', Vary: 'Origin',
    } : {})
    return res.end()
  }
  const path = (req.url ?? '').split('?')[0]
  if (path.startsWith('/api/')) {
    if (!origin) return send(res, 403, { error: 'origin' }, null)
    const ip = String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '?')
    const write = req.method === 'POST'
    if (apiLimited(ip, write)) return send(res, 429, { error: 'rate_limited' }, origin)
    let body = {}
    if (write) {
      let raw = ''
      for await (const chunk of req) { raw += chunk; if (raw.length > 16_000) return send(res, 413, { error: 'too_large' }, origin) }
      try { body = JSON.parse(raw || '{}') } catch { return send(res, 400, { error: 'bad_json' }, origin) }
    }
    // região de quem se cadastra: CEP ou GPS (arredondado a ~1 km) → nome da região
    let gm
    if (req.method === 'GET' && (gm = path.match(/^\/api\/geo\/cep\/(\d{8})$/))) {
      try { const g = await geoFromCep(gm[1]); return g ? send(res, 200, g, origin) : send(res, 404, { error: 'cep' }, origin) }
      catch (e) { console.warn('cep:', e.message); return send(res, 502, { error: 'geo' }, origin) }
    }
    if (req.method === 'GET' && path === '/api/geo/rev') {
      const u = new URL(req.url, 'http://x').searchParams
      const lat = Number(u.get('lat')), lng = Number(u.get('lng'))
      if (!validLatLng(lat, lng)) return send(res, 400, { error: 'coords' }, origin)
      try { return send(res, 200, await geoReverse(lat, lng), origin) }
      catch (e) { console.warn('rev:', e.message); return send(res, 502, { error: 'geo' }, origin) }
    }
    // login com Google: valida o ID token no Google (assinatura, validade, público = nosso app, e-mail verificado)
    if (write && path === '/api/auth/google') {
      const cred = String(body.credential ?? '')
      if (cred.length < 100 || cred.length > 4096) return send(res, 400, { error: 'credential' }, origin)
      try {
        const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(cred)}`, { signal: AbortSignal.timeout(8000) })
        const t = r.ok ? await r.json() : null
        const valid = t && t.aud === GOOGLE_CLIENT_ID && ['accounts.google.com', 'https://accounts.google.com'].includes(t.iss) &&
          Number(t.exp) * 1000 > Date.now() && (t.email_verified === 'true' || t.email_verified === true) && t.sub
        if (!valid) return send(res, 401, { error: 'google_token' }, origin)
        const [status, out] = googleLogin(String(t.sub), String(t.email ?? '').slice(0, 120), String(t.given_name ?? t.name ?? ''), String(req.headers['x-device'] ?? ''))
        console.log(`[${new Date().toLocaleTimeString('pt-BR')}] login google ${status} ${out.existing ? 'conta existente' : 'conta nova'}`)
        return send(res, status, out, origin)
      } catch (e) {
        console.warn('google:', e.message)
        return send(res, 502, { error: 'google' }, origin)
      }
    }
    // avaliação "Quem foi": comentário passa pelas mesmas regras + LLM do catálogo antes de ficar público
    if (write && path === '/api/reviews') {
      const note = String(body.note ?? '').slice(0, 400)
      let verdict = { ok: true, motivo: '' }
      const rule = note.trim() ? moderationRules(String(body.placeName ?? 'lugar'), note) : null
      if (rule) verdict = { ok: false, motivo: rule }
      else if (note.trim()) verdict = await moderateLLM(String(body.placeName ?? 'lugar'), note)
      const [status, out] = insertReview(body, String(req.headers['x-device'] ?? ''), verdict)
      console.log(`[${new Date().toLocaleTimeString('pt-BR')}] avaliação ${status} ${out.status ?? ''} ${verdict.motivo ? '(' + verdict.motivo + ')' : ''}`)
      return send(res, status, out, origin)
    }
    // catálogo comunitário: regras + LLM decidem se o lugar entra direto ou vai pra revisão da curadoria
    if (write && path === '/api/places') {
      const m = placeForModeration(body)
      if (!m) return send(res, 400, { error: 'place' }, origin)
      let verdict = { ok: true, motivo: '' }
      if (!m.exists) {
        const rule = moderationRules(m.name, m.comment)
        if (rule) verdict = { ok: false, motivo: rule }
        else if (m.comment.trim()) verdict = await moderateLLM(m.name, m.comment)
      }
      const [status, out] = insertPlace(body, String(req.headers['x-device'] ?? ''), verdict)
      console.log(`[${new Date().toLocaleTimeString('pt-BR')}] lugar ${status} ${out.status ?? ''} "${m.name}" ${verdict.motivo ? '(' + verdict.motivo + ')' : ''}`)
      return send(res, status, out, origin)
    }
    try {
      const [status, out] = handleApi(req.method, path, req, body)
      if (write) console.log(`[${new Date().toLocaleTimeString('pt-BR')}] api ${status} ${req.method} ${path}`)
      return send(res, status, out, origin)
    } catch (e) {
      console.warn('falha api:', e.message)
      return send(res, 500, { error: 'server' }, origin)
    }
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
  if (req.method !== 'POST' || (req.url !== '/extract' && req.url !== '/ask' && req.url !== '/pick')) return send(res, 404, { error: 'not_found' }, origin)
  if (!origin) return send(res, 403, { error: 'origin' }, null)

  const ip = String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '?')
  if (limited(ip)) { stats.limited++; return send(res, 429, { error: 'rate_limited' }, origin) }

  let raw = ''
  for await (const chunk of req) { raw += chunk; if (raw.length > 12_000) return send(res, 413, { error: 'too_large' }, origin) }
  let body
  try { body = JSON.parse(raw) } catch { return send(res, 400, { error: 'bad_json' }, origin) }

  if (req.url === '/pick') {
    // curadoria da IA sobre os candidatos da busca: escolhe e justifica com os fatos recebidos
    const pedido = String(body.pedido ?? '').trim().slice(0, MAX_TEXT)
    const cands = Array.isArray(body.cands) ? body.cands.slice(0, 10) : []
    if (!pedido || cands.length < 2) return send(res, 400, { error: 'bad_pick' }, origin)
    const clean = cands.map((c, i) => ({
      i, nome: String(c?.nome ?? '').slice(0, 60), tipo: String(c?.tipo ?? '').slice(0, 40),
      ...Object.fromEntries(['distancia_km', 'nota_google', 'avaliacoes_google', 'nota_comunidade'].map((k) => [k, Number.isFinite(Number(c?.[k])) && c?.[k] !== null ? Number(c[k]) : null])),
      ...(Number.isFinite(Number(c?.preco_estimado)) && c?.preco_estimado != null ? { preco_estimado: Number(c.preco_estimado) } : {}),
      ...Object.fromEntries(['area_externa', 'cerveja', 'drinks', 'musica_ao_vivo', 'bom_pra_grupo', 'aberto_no_horario_pedido'].map((k) => [k, typeof c?.[k] === 'boolean' ? c[k] : null])),
      curado_pela_comunidade: c?.curado_pela_comunidade === true,
    }))
    const job = queue.then(async () => {
      const t0 = Date.now()
      const r = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pickBody(MODEL, pedido, clean)), signal: AbortSignal.timeout(20_000),
      })
      if (!r.ok) throw new Error(`ollama ${r.status}`)
      const j = JSON.parse((await r.json()).message?.content ?? '{}')
      const seen = new Set()
      const escolhas = (Array.isArray(j.escolhas) ? j.escolhas : [])
        .filter((e) => Number.isInteger(e?.i) && e.i >= 0 && e.i < clean.length && !seen.has(e.i) && seen.add(e.i))
        .slice(0, 5).map((e) => ({ i: e.i, destaques: (Array.isArray(e.destaques) ? e.destaques : []).filter((d) => DESTAQUES.includes(d)).slice(0, 2) }))
      return { escolhas, model: MODEL, ms: Date.now() - t0 }
    })
    queue = job.catch(() => {})
    try {
      const out = await job
      stats.ok++
      console.log(`[${new Date().toLocaleTimeString('pt-BR')}] pick ${out.ms}ms  ${ip}  ${out.escolhas.length}/${clean.length}  "${pedido.slice(0, 50)}"`)
      return send(res, 200, out, origin)
    } catch (e) {
      stats.fail++
      console.warn('falha pick:', e.message)
      return send(res, 502, { error: 'llm_failed' }, origin)
    }
  }

  if (req.url === '/ask') {
    // pergunta sobre as opções de uma votação: só fatos de lugares (máx. 6), pergunta curta, resposta curta
    const question = String(body.question ?? '').trim()
    const pedido = String(body.pedido ?? '').trim().slice(0, MAX_TEXT)
    const facts = Array.isArray(body.facts) ? body.facts.slice(0, 6) : []
    if (!question || question.length > 200 || !facts.length) return send(res, 400, { error: 'bad_question' }, origin)
    const job = queue.then(async () => {
      const t0 = Date.now()
      const r = await fetch(`${OLLAMA}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(askBody(MODEL, question, pedido, facts)), signal: AbortSignal.timeout(25_000),
      })
      if (!r.ok) throw new Error(`ollama ${r.status}`)
      const j = await r.json()
      return { answer: String(j.message?.content ?? '').trim().slice(0, 600), model: MODEL, ms: Date.now() - t0 }
    })
    queue = job.catch(() => {})
    try {
      const out = await job
      stats.ok++
      console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ask ${out.ms}ms  ${ip}  "${question.slice(0, 60)}"`)
      return send(res, 200, out, origin)
    } catch (e) {
      stats.fail++
      console.warn('falha ask:', e.message)
      return send(res, 502, { error: 'llm_failed' }, origin)
    }
  }

  const text = String(body.text ?? '').trim()
  if (!text || text.length > MAX_TEXT) return send(res, 400, { error: 'bad_text' }, origin)

  // uma extração por vez: a GPU de 8 GB não ganha nada com paralelismo e o tempo fica previsível
  const job = queue.then(async () => {
    const t0 = Date.now()
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaBody(MODEL, text, similarExamples(text))), signal: AbortSignal.timeout(20_000),
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

// termos do Google: só o place_id pode ficar guardado. Nome/bairro de lugares do Google que entraram em pedidos
// (opções da votação) saem depois de 30 dias, a não ser que a comunidade tenha confirmado o lugar (catálogo).
purgeGoogleSnaps()
setInterval(purgeGoogleSnaps, 12 * 3600_000).unref()

server.listen(PORT, '127.0.0.1', () => {
  console.log(`gateway do rolê em http://127.0.0.1:${PORT}  (modelo ${MODEL}, origens: ${ORIGINS.join(', ')})`)
  console.log(`dados: SQLite em ${dataDir} · chave da curadoria em ${adminKeyFile}`)
})
