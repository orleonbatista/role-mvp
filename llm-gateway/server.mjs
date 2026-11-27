import { createReadStream } from 'node:fs'
// Gateway do rolê para testes: fica entre o túnel (cloudflared) e o PC.
//  - LLM: expõe SÓ /extract e /ask (nunca a API crua do Ollama), com origem permitida, limite e fila de 1 na GPU.
//  - Dados: /api/* (api.mjs, SQLite) com pedidos, votos, sugestões, curadoria e métricas compartilhados entre aparelhos.
//   node llm-gateway/server.mjs        (ou llm-gateway\start.cmd, que também abre o túnel)
import http from 'node:http'
import { screen } from '../src/lib/guard.ts'
import { DESTAQUES, askBody, moderateBody, moderationRules, ollamaBody, pickBody } from '../src/mocks/llmPrompt.ts'
import { deviceForLogin, isAdminReq, resolveSession, checkDeadlines, ogPage, photoFile, placePhotoFile, avatarFile, dropPushSub, hooks, pushSubsOf, adminKeyFile, similarExamples, googleLogin, insertReview, dataDir, handleApi, insertPlace, placeForModeration, purgeGoogleSnaps, validLatLng } from './api.mjs'
import { geoFromCep, geoReverse } from './geo.mjs'
import { createLLM } from './providers.mjs'
import { createPush } from './push.mjs'

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

const llm = createLLM({ dataDir, ollamaModel: MODEL })
const push = createPush(dataDir)
// avisos: no máximo 1 por pedido e tipo a cada 2 min por aparelho (votos em sequência viram 1 aviso)
const lastPush = new Map()
// nota de foto de lugar pela IA de visão (Gemini): o que vale mostrar no carrossel
const PHOTO_SYSTEM = `Você avalia fotos enviadas para a ficha de um bar/restaurante/balada no app rolê.
Dê "nota" de 0 a 10 para o quanto a foto ajuda alguém a decidir ir: ambiente, fachada, mesas, balcão, drinks e pratos bem fotografados valem mais;
nitidez e luz contam. "serve"=false se for cardápio/print/meme/documento, se não for de um lugar, se tiver conteúdo impróprio,
ou se o foco for o rosto de pessoas identificáveis. "motivo": até 8 palavras em português.`
const PHOTO_SCHEMA = { type: 'object', properties: { nota: { type: 'number' }, serve: { type: 'boolean' }, motivo: { type: 'string' } }, required: ['nota', 'serve', 'motivo'] }
hooks.scorePhoto = (dataUrl) => llm.vision(PHOTO_SYSTEM, dataUrl, PHOTO_SCHEMA, 25_000)
hooks.notify = (e) => {
  const now = Date.now()
  for (const s of pushSubsOf(e.to)) {
    const k = `${e.key}|${s.device}`
    if (!e.key.startsWith('d-') && now - (lastPush.get(k) ?? 0) < 120_000) continue
    lastPush.set(k, now)
    void push.send(s, { title: e.title, body: e.body, url: `/role-mvp/${e.url}`, tag: e.key }).then((st) => {
      console.log(`[${new Date().toLocaleTimeString('pt-BR')}] push ${e.key} → ${st}`)
      if (st === 'gone') dropPushSub(s.endpoint)
    })
  }
}
const hits = new Map() // ip -> timestamps (ms)
const stats = { ok: 0, fail: 0, limited: 0, since: new Date().toISOString() }

function allowedOrigin(origin) {
  if (!origin) return null
  if (ORIGINS.includes(origin)) return origin
  // celulares na mesma rede rodando o dev server (http://192.168.x.x:5173)
  if (/^http:\/\/(192\.168|10)\.\d+\.\d+(\.\d+)?:51\d\d$/.test(origin)) return origin
  return null
}

// limites por aparelho (sessão/X-Device) e, bem mais folgado, por IP: no Brasil a operadora põe muita gente atrás do
// mesmo IP (CGNAT) e a turma toda costuma estar no mesmo Wi-Fi; limitar só por IP barrava gente de verdade
const who = (req, ip) => { const k = String(req.headers['x-session'] || req.headers['x-device'] || ''); return k ? `k:${k.slice(0, 64)}` : `ip:${ip}` }
function limitedKey(key, perMin, perDay) {
  const now = Date.now()
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 86_400_000)
  const lastMin = arr.filter((t) => now - t < 60_000).length
  if (lastMin >= perMin || arr.length >= perDay) return true
  arr.push(now)
  hits.set(key, arr)
  return false
}
const limited = (req, ip) => limitedKey(`ip:${ip}`, PER_MIN * 6, PER_DAY * 6) || (who(req, ip) !== `ip:${ip}` && limitedKey(who(req, ip), PER_MIN, PER_DAY))

// limite separado pra API de dados (bem mais folgado que o do LLM)
const apiHits = new Map()
const strikes = new Map()
function apiLimitedKey(key, max) {
  const now = Date.now()
  const arr = (apiHits.get(key) ?? []).filter((t) => now - t < 60_000)
  if (arr.length >= max) return true
  arr.push(now)
  apiHits.set(key, arr)
  return false
}
function apiLimited(req, ip, write) {
  const w = write ? 'w' : 'r', k = who(req, ip)
  if (apiLimitedKey(`ip:${ip}:${w}`, write ? 540 : 2400)) return true
  return k !== `ip:${ip}` && apiLimitedKey(`${k}:${w}`, write ? 90 : 400)
}

/** moderação pela LLM (fila de 1 na GPU, 8s); se falhar, deixa passar — as regras já pegaram o óbvio */
async function moderateLLM(name, comment) {
  try {
    const j = JSON.parse((await llm.chat(moderateBody(MODEL, name, comment), 8000)).content || '{}')
    return { ok: j.ok !== false, motivo: j.ok === false ? String(j.motivo ?? 'conteúdo suspeito').slice(0, 60) : '' }
  } catch { return { ok: true, motivo: '' } }
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
      'Access-Control-Allow-Headers': 'Content-Type, X-Device, X-Admin-Key, X-Session', 'Access-Control-Max-Age': '600', Vary: 'Origin',
    } : {})
    return res.end()
  }
  const path = (req.url ?? '').split('?')[0]
  // fotos do rolê: públicas mas com endereço impossível de adivinhar; <img> não manda Origin, por isso fora de /api/
  let mm
  if (req.method === 'GET' && (mm = path.match(/^\/media\/(r-[a-z0-9-]{1,24})\/(ph-[a-f0-9]{12}\.jpg)$/))) {
    const f = photoFile(mm[1], mm[2])
    if (!f) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })
    return createReadStream(f).pipe(res)
  }
  if (req.method === 'GET' && (mm = path.match(/^\/media\/a\/(u-[a-f0-9]{16})\.jpg$/))) {
    const f = avatarFile(mm[1])
    if (!f) return send(res, 404, { error: 'not_found' }, origin)
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' })
    return createReadStream(f).pipe(res)
  }
  if (req.method === 'GET' && (mm = path.match(/^\/media\/p\/([A-Za-z0-9_-]{4,120})\/(pp-[a-f0-9]{12}\.jpg)$/))) {
    const f = placePhotoFile(mm[1], mm[2])
    if (!f) { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' })
    return createReadStream(f).pipe(res)
  }
  // prévia dinâmica do link de votação (título com as opções); pessoas seguem pro app. Ligar quando houver domínio fixo
  if (req.method === 'GET' && (mm = path.match(/^\/og\/r\/(r-[a-z0-9-]{1,24})$/))) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' })
    return res.end(ogPage(mm[1], new URL(req.url, 'http://x').search))
  }
  if (path.startsWith('/api/')) {
    if (!origin) return send(res, 403, { error: 'origin' }, null)
    const ip = String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '?')
    const write = req.method === 'POST'
    if (apiLimited(req, ip, write)) return send(res, 429, { error: 'rate_limited' }, origin)
    const sessErr = resolveSession(req, path)
    if (sessErr) return send(res, 401, sessErr, origin)
    // teste de avisos (admin): manda um aviso pros aparelhos do próprio admin e devolve o resultado de cada envio
    if (req.method === 'POST' && path === '/api/admin/push-test') {
      if (!isAdminReq(req)) return send(res, 401, { error: 'admin' }, origin)
      const subs = pushSubsOf([String(req.headers['x-device'] ?? '')])
      const results = await Promise.all(subs.map((s) => push.send(s, { title: 'Teste de aviso do rolê', body: 'Se você está vendo isto, os avisos funcionam.', url: '/role-mvp/testes', tag: 'teste' }).catch((e) => `erro: ${e.message}`)))
      return send(res, 200, { subs: subs.length, results }, origin)
    }
    let body = {}
    if (write) {
      let raw = ''
      const limit = /\/photos?$/.test(path) ? 2_400_000 : 16_000 // foto (base64, já reduzida no celular) cabe; o resto é pequeno
      for await (const chunk of req) { raw += chunk; if (raw.length > limit) return send(res, 413, { error: 'too_large' }, origin) }
      try { body = JSON.parse(raw || '{}') } catch { return send(res, 400, { error: 'bad_json' }, origin) }
    }
    if (req.method === 'GET' && path === '/api/push/key') return send(res, 200, { key: push.publicKey }, origin)
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
        const [status, out] = googleLogin(String(t.sub), String(t.email ?? '').slice(0, 120), String(t.given_name ?? t.name ?? ''), deviceForLogin(req))
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
    // ok se houver ao menos um provedor de nuvem configurado ou a GPU local com o modelo
    const providers = llm.status()
    let gpu = false
    try {
      const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(3000) })
      gpu = ((await r.json()).models ?? []).some((m) => m.name === MODEL || m.model === MODEL)
    } catch { /* PC sem Ollama */ }
    const cloud = providers.filter((p) => p.provider !== 'ollama' && p.configured && !p.coolingDown)
    const ok = gpu || cloud.length > 0
    const model = cloud[0] ? `${cloud[0].model} (${cloud[0].provider})` : MODEL
    return send(res, ok ? 200 : 503, { ok, model, gpu, providers, stats }, origin)
  }
  if (req.method !== 'POST' || (req.url !== '/extract' && req.url !== '/ask' && req.url !== '/pick')) return send(res, 404, { error: 'not_found' }, origin)
  if (!origin) return send(res, 403, { error: 'origin' }, null)

  const ip = String(req.headers['cf-connecting-ip'] ?? req.socket.remoteAddress ?? '?')
  if (limited(req, ip)) { stats.limited++; return send(res, 429, { error: 'rate_limited' }, origin) }

  let raw = ''
  for await (const chunk of req) { raw += chunk; if (raw.length > 12_000) return send(res, 413, { error: 'too_large' }, origin) }
  let body
  try { body = JSON.parse(raw) } catch { return send(res, 400, { error: 'bad_json' }, origin) }

  // filtro antes da IA: tentativa de injeção ou assunto fora do rolê não chega no modelo (zero token gasto);
  // quem insiste (3 em 10 min) fica 15 min sem IA
  const key = who(req, ip)
  if ((strikes.get(key)?.until ?? 0) > Date.now()) { stats.limited++; return send(res, 429, { error: 'guard_cooldown' }, origin) }
  const userText = req.url === '/ask' ? body.question : req.url === '/pick' ? body.pedido : body.text
  const g = screen(userText, req.url === '/ask' ? 200 : MAX_TEXT)
  if (!g.ok) {
    if (g.reason === 'injecao' || g.reason === 'fora') {
      const st = strikes.get(key) ?? { at: [], until: 0 }
      st.at = [...st.at.filter((t) => Date.now() - t < 600_000), Date.now()]
      if (st.at.length >= 3) st.until = Date.now() + 15 * 60_000
      strikes.set(key, st)
      console.warn(`[guard] ${g.reason} ${key.slice(0, 14)} "${String(userText).slice(0, 60)}"`)
    }
    stats.guarded = (stats.guarded ?? 0) + 1
    return send(res, 422, { error: 'guard', reason: g.reason }, origin)
  }

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
    const job = (async () => {
      const t0 = Date.now()
      const out = await llm.chat(pickBody(MODEL, pedido, clean), 20_000)
      const j = JSON.parse(out.content || '{}')
      const seen = new Set()
      const escolhas = (Array.isArray(j.escolhas) ? j.escolhas : [])
        .filter((e) => Number.isInteger(e?.i) && e.i >= 0 && e.i < clean.length && !seen.has(e.i) && seen.add(e.i))
        .slice(0, 5).map((e) => ({ i: e.i, destaques: (Array.isArray(e.destaques) ? e.destaques : []).filter((d) => DESTAQUES.includes(d)).slice(0, 2) }))
      return { escolhas, model: out.model, via: out.via, ms: Date.now() - t0 }
    })()
    try {
      const out = await job
      stats.ok++
      console.log(`[${new Date().toLocaleTimeString('pt-BR')}] pick ${out.via} ${out.ms}ms  ${ip}  ${out.escolhas.length}/${clean.length}  "${pedido.slice(0, 50)}"`)
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
    const job = (async () => {
      const t0 = Date.now()
      const out = await llm.chat(askBody(MODEL, question, pedido, facts), 25_000)
      return { answer: out.content.trim().slice(0, 600), model: out.model, via: out.via, ms: Date.now() - t0 }
    })()
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
  const job = (async () => {
    const t0 = Date.now()
    const out = await llm.chat(ollamaBody(MODEL, text, similarExamples(text)), 20_000)
    return { raw: JSON.parse(out.content || '{}'), model: out.model, via: out.via, ms: Date.now() - t0 }
  })()
  try {
    const out = await job
    stats.ok++
    console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ok ${out.via} ${out.ms}ms  ${ip}  "${text.slice(0, 60)}"`)
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
setInterval(checkDeadlines, 5 * 60_000).unref()

server.listen(PORT, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`gateway do rolê em http://127.0.0.1:${PORT}  (modelo ${MODEL}, origens: ${ORIGINS.join(', ')})`)
  console.log(`dados: SQLite em ${dataDir} · chave da curadoria em ${adminKeyFile}`)
})
