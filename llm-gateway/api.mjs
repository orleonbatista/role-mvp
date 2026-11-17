// Backend de dados do rolê (testes com amigos): SQLite nativo do Node (node:sqlite, Node ≥ 22.13),
// servido pelo mesmo gateway/túnel do LLM em /api/*. Guarda só o que precisa ser COMPARTILHADO entre
// aparelhos: pedidos, votos, sugestões, decisão, eventos enviados/curadoria, métricas, feedback e leads.
// Catálogo, ranking e perfil continuam no aparelho (o app funciona sem backend e sincroniza quando ele está no ar).
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DATA = process.env.ROLE_DATA_DIR ?? join(dirname(fileURLToPath(import.meta.url)), 'data')
mkdirSync(DATA, { recursive: true })

/** chave da curadoria: gerada no 1º start, fica em data/admin-key.txt (nunca vai pro git) */
const KEY_FILE = join(DATA, 'admin-key.txt')
if (!existsSync(KEY_FILE)) writeFileSync(KEY_FILE, randomBytes(18).toString('base64url'))
const ADMIN_KEY = readFileSync(KEY_FILE, 'utf8').trim()
export const adminKeyFile = KEY_FILE
export const dataDir = DATA

const db = new DatabaseSync(join(DATA, 'role.db'))
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY, data TEXT NOT NULL, author_device TEXT NOT NULL, created_at INTEGER NOT NULL,
    decided_place TEXT, decided_time TEXT, decided_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS votes (
    request_id TEXT NOT NULL, device TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, voter TEXT NOT NULL, at INTEGER NOT NULL,
    PRIMARY KEY (request_id, device, kind)
  );
  CREATE TABLE IF NOT EXISTS suggestions (
    id TEXT PRIMARY KEY, request_id TEXT NOT NULL, place_id TEXT NOT NULL, by_name TEXT NOT NULL, comment TEXT NOT NULL,
    hue INTEGER, device TEXT NOT NULL, at INTEGER NOT NULL, place TEXT, UNIQUE (request_id, place_id, by_name)
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pendente', device TEXT NOT NULL, at INTEGER NOT NULL, reviewed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, device TEXT NOT NULL, name TEXT NOT NULL, src TEXT, path TEXT, props TEXT, at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS places (
    id TEXT PRIMARY KEY, snap TEXT NOT NULL, comment TEXT, status TEXT NOT NULL DEFAULT 'ok', motivo TEXT,
    device TEXT NOT NULL, at INTEGER NOT NULL, uses INTEGER NOT NULL DEFAULT 1, lat REAL, lng REAL, coords_at INTEGER, reviewed_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS feedback (id TEXT PRIMARY KEY, device TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, device TEXT NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS ix_votes_req ON votes(request_id);

  CREATE INDEX IF NOT EXISTS ix_sug_req ON suggestions(request_id);
  CREATE INDEX IF NOT EXISTS ix_events_at ON events(at);
`)

// migração: coluna com o resumo do lugar do Google na sugestão (bancos criados antes dela)
if (!db.prepare("SELECT 1 FROM pragma_table_info('suggestions') WHERE name = 'place'").get()) db.exec('ALTER TABLE suggestions ADD COLUMN place TEXT')

/* ---------- validação ---------- */
const RE = {
  request: /^r-[a-z0-9-]{1,24}$/,
  sub: /^ev-u-[a-z0-9-]{1,40}$/,
  device: /^[a-z0-9-]{8,40}$/,
  // catálogo (ex.: jazz-laje) ou Google Places (g-ChIJ...)
  place: /^(?:[a-z0-9-]{2,60}|g-[A-Za-z0-9_-]{5,120}|o-[nwr]\d{1,14})$/,
  evName: /^[a-z_]{2,40}$/,
}
const str = (v, n) => String(v ?? '').slice(0, n)
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d)
const json = (v, max) => { const s = JSON.stringify(v ?? null); return s.length <= max ? s : null }
const parse = (s) => { try { return JSON.parse(s) } catch { return null } }

/** lugar do catálogo comunitário: [id (g-<place_id>), nome, tipo, bairro, estilos, preço, vibes, ocasiões].
 *  Do Google só o place_id; o resto é o que a pessoa confirmou. */
const list = (v, n) => (Array.isArray(v) ? v : []).slice(0, n).map((x) => str(x, 20))
function snap(v) {
  if (!Array.isArray(v) || !/^(g-[A-Za-z0-9_-]{5,120}|o-[nwr]\d{1,14})$/.test(String(v[0]))) return null
  return [String(v[0]), str(v[1], 80), ['bar', 'restaurante', 'balada', 'evento'].includes(v[2]) ? v[2] : 'bar', str(v[3], 40), list(v[4], 3), int(v[5]), list(v[6], 2), list(v[7], 3)]
}

function isAdmin(req) {
  const k = Buffer.from(String(req.headers['x-admin-key'] ?? ''))
  const a = Buffer.from(ADMIN_KEY)
  return k.length === a.length && timingSafeEqual(k, a)
}

/* ---------- consultas ---------- */
const q = {
  getReq: db.prepare('SELECT * FROM requests WHERE id = ?'),
  insReq: db.prepare('INSERT OR IGNORE INTO requests (id, data, author_device, created_at) VALUES (?, ?, ?, ?)'),
  updReq: db.prepare('UPDATE requests SET data = ? WHERE id = ? AND author_device = ?'),
  decide: db.prepare('UPDATE requests SET decided_place = ?, decided_time = ?, decided_at = ? WHERE id = ? AND author_device = ?'),
  votes: db.prepare('SELECT device, kind, value, voter, at FROM votes WHERE request_id = ? ORDER BY at'),
  vote: db.prepare(`INSERT INTO votes (request_id, device, kind, value, voter, at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (request_id, device, kind) DO UPDATE SET value = excluded.value, voter = excluded.voter, at = excluded.at`),
  sugs: db.prepare('SELECT id, place_id AS placeId, by_name AS byName, comment, hue, device, at, place FROM suggestions WHERE request_id = ? ORDER BY at'),
  sug: db.prepare('INSERT OR IGNORE INTO suggestions (id, request_id, place_id, by_name, comment, hue, device, at, place) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  insSub: db.prepare('INSERT OR IGNORE INTO submissions (id, data, device, at) VALUES (?, ?, ?, ?)'),
  subs: db.prepare('SELECT * FROM submissions ORDER BY at DESC LIMIT 200'),
  mySubs: db.prepare('SELECT id, status, reviewed_at FROM submissions WHERE device = ?'),
  setSub: db.prepare('UPDATE submissions SET status = ?, reviewed_at = ? WHERE id = ?'),
  published: db.prepare("SELECT data, at FROM submissions WHERE status = 'aprovado' ORDER BY at"),
  insEv: db.prepare('INSERT OR IGNORE INTO events (id, device, name, src, path, props, at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  getPlace: db.prepare('SELECT * FROM places WHERE id = ?'),
  insPlace: db.prepare('INSERT INTO places (id, snap, comment, status, motivo, device, at, lat, lng, coords_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  usePlace: db.prepare('UPDATE places SET uses = uses + 1 WHERE id = ?'),
  okPlaces: db.prepare("SELECT snap FROM places WHERE status = 'ok' ORDER BY uses DESC, at DESC LIMIT 500"),
  reviewPlaces: db.prepare("SELECT * FROM places WHERE status != 'ok' OR motivo IS NOT NULL ORDER BY at DESC LIMIT 200"),
  setPlace: db.prepare('UPDATE places SET status = ?, reviewed_at = ? WHERE id = ?'),
  // termos do Google: coordenadas só por 30 dias
  expireCoords: db.prepare('UPDATE places SET lat = NULL, lng = NULL, coords_at = NULL WHERE coords_at < ?'),
  insFb: db.prepare('INSERT OR IGNORE INTO feedback (id, device, data, at) VALUES (?, ?, ?, ?)'),
  insLead: db.prepare('INSERT OR IGNORE INTO leads (id, device, data, at) VALUES (?, ?, ?, ?)'),
}

function requestState(id) {
  const r = q.getReq.get(id)
  if (!r) return null
  return {
    request: { ...parse(r.data), id: r.id, createdAt: r.created_at },
    authorDevice: r.author_device,
    decision: r.decided_place ? { placeId: r.decided_place, time: r.decided_time ?? undefined, at: r.decided_at } : null,
    votes: q.votes.all(id),
    suggestions: q.sugs.all(id).map((x) => ({ ...x, place: x.place ? parse(x.place) : undefined })),
  }
}

function stats() {
  const events = db.prepare('SELECT device, name, src, path, props, at FROM events ORDER BY at').all()
  const counts = {}
  const bySrc = {}
  for (const e of events) {
    counts[e.name] = (counts[e.name] ?? 0) + 1
    const row = (bySrc[e.src || 'direto'] ??= { app_open: 0, vote_cast: 0, onboarding_done: 0, request_created: 0, story_shared: 0, event_group_created: 0 })
    if (e.name in row) row[e.name]++
  }
  const devices = new Set(events.map((e) => e.device)).size
  return {
    counts, total: events.length, devices, bySrc,
    firstAt: events[0]?.at, lastAt: events[events.length - 1]?.at,
    recent: events.slice(-30).reverse().map((e) => ({ ...e, props: parse(e.props) ?? {} })),
    feedback: db.prepare('SELECT data, at FROM feedback ORDER BY at DESC LIMIT 100').all().map((f) => ({ ...parse(f.data), at: f.at })),
    leads: db.prepare('SELECT data, at FROM leads ORDER BY at DESC LIMIT 100').all().map((l) => ({ ...parse(l.data), at: l.at })),
    totals: {
      requests: db.prepare('SELECT COUNT(*) AS n FROM requests').get().n,
      votes: db.prepare('SELECT COUNT(*) AS n FROM votes').get().n,
      suggestions: db.prepare('SELECT COUNT(*) AS n FROM suggestions').get().n,
      decided: db.prepare('SELECT COUNT(*) AS n FROM requests WHERE decided_place IS NOT NULL').get().n,
    },
  }
}

/** catálogo comunitário: chamado pelo server.mjs depois da moderação (regras + LLM) */
export function insertPlace(body, device, verdict) {
  if (!RE.device.test(device)) return bad('device')
  const sp = snap(body.place)
  if (!sp) return bad('place')
  const existing = q.getPlace.get(sp[0])
  if (existing) { q.usePlace.run(sp[0]); return ok({ ok: true, status: existing.status, existing: true }) }
  const now = Date.now()
  const status = verdict.ok ? 'ok' : 'revisao'
  const lat = Number(body.lat), lng = Number(body.lng)
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
  q.insPlace.run(sp[0], JSON.stringify(sp), str(body.comment, 200), status, verdict.motivo || null, device, now, hasCoords ? lat : null, hasCoords ? lng : null, hasCoords ? now : null)
  return ok({ ok: true, status, motivo: verdict.motivo || undefined })
}
export const placeForModeration = (body) => {
  const sp = snap(body.place)
  return sp ? { name: sp[1], comment: str(body.comment, 200), exists: !!q.getPlace.get(sp[0]) } : null
}

/* ---------- roteamento ---------- */
const ok = (body) => [200, body]
const bad = (error, status = 400) => [status, { error }]

/** devolve [status, body]; quem chama cuida de CORS, limite e leitura do corpo */
export function handleApi(method, path, req, body) {
  const device = str(req.headers['x-device'], 40)
  const write = method === 'POST'
  if (write && !RE.device.test(device)) return bad('device')
  const now = Date.now()
  let m

  if (method === 'GET' && path === '/api/health') return ok({ ok: true, db: true, at: now })

  /* ---- catálogo comunitário ---- */
  if (method === 'GET' && path === '/api/places') {
    q.expireCoords.run(now - 30 * 86_400_000)
    return ok(q.okPlaces.all().map((r) => parse(r.snap)))
  }
  if (method === 'GET' && path === '/api/places/review') {
    if (!isAdmin(req)) return bad('admin', 401)
    return ok(q.reviewPlaces.all().map((r) => ({ place: parse(r.snap), comment: r.comment, status: r.status, motivo: r.motivo, at: r.at, uses: r.uses })))
  }
  if ((m = path.match(/^\/api\/places\/(g-[A-Za-z0-9_-]{5,120}|o-[nwr]\d{1,14})\/status$/)) && write) {
    if (!isAdmin(req)) return bad('admin', 401)
    const status = ['ok', 'recusado'].includes(body.status) ? body.status : null
    if (!status) return bad('status')
    const upd = q.setPlace.run(status, now, m[1])
    return upd.changes ? ok({ ok: true }) : bad('not_found', 404)
  }

  // eventos aprovados = publicados pra todo mundo (substitui o eventos.json manual)
  if (method === 'GET' && path === '/api/events') return ok(q.published.all().map((r) => ({ ...parse(r.data), status: 'aprovado' })))

  if (write && path === '/api/requests') {
    const id = str(body.id, 30)
    if (!RE.request.test(id) || typeof body.text !== 'string') return bad('request')
    const data = json({
      text: str(body.text, 400), criteria: body.criteria, optionIds: (body.optionIds ?? []).filter((x) => RE.place.test(String(x))).slice(0, 6),
      times: (body.times ?? []).map((t) => str(t, 20)).slice(0, 4), author: { name: str(body.author?.name, 40), hue: int(body.author?.hue) },
      eventId: RE.place.test(String(body.eventId ?? '')) ? body.eventId : undefined,
      places: (Array.isArray(body.places) ? body.places : []).slice(0, 6).map(snap).filter(Boolean),
    }, 12000)
    if (!data) return bad('too_large', 413)
    const ins = q.insReq.run(id, data, device, int(body.createdAt, now))
    if (!ins.changes) q.updReq.run(data, id, device) // o autor pode atualizar (ex.: novas opções); os outros não
    return ok({ ok: true })
  }

  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})$/)) && method === 'GET') {
    const s = requestState(m[1])
    return s ? ok(s) : bad('not_found', 404)
  }

  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})\/votes$/)) && write) {
    if (!q.getReq.get(m[1])) return bad('not_found', 404)
    const kind = body.kind === 'time' ? 'time' : 'place'
    const value = str(body.value, 60)
    if (!value || (kind === 'place' && !RE.place.test(value))) return bad('vote')
    q.vote.run(m[1], device, kind, value, str(body.voter, 40) || 'Alguém', now)
    return ok({ ok: true })
  }

  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})\/suggestions$/)) && write) {
    const r = q.getReq.get(m[1])
    if (!r) return bad('not_found', 404)
    const placeId = str(body.placeId, 60)
    if (!RE.place.test(placeId)) return bad('place')
    const by = str(body.by, 40).trim() || 'Alguém'
    const id = `rs-${randomBytes(5).toString('hex')}`
    const ext = placeId.startsWith('g-') || placeId.startsWith('o-')
    const ps = ext ? snap(body.place) : null
    if (ext && (!ps || ps[0] !== placeId)) return bad('place_snapshot')
    const ins = q.sug.run(id, m[1], placeId, by, str(body.comment, 200) || 'Sugeri esse aqui!', int(body.hue, 200), device, now, ps ? JSON.stringify(ps) : null)
    // a sugestão vira opção da votação pra todo mundo (máx. 6 opções; as mais antigas da IA saem primeiro)
    const data = parse(r.data)
    if (!data.optionIds.includes(placeId)) {
      data.optionIds = [...data.optionIds, placeId].slice(-6)
      if (ps) data.places = [...(data.places ?? []).filter((p) => p[0] !== placeId), ps].slice(-6)
      db.prepare('UPDATE requests SET data = ? WHERE id = ?').run(JSON.stringify(data), m[1])
    }
    return ok({ ok: true, duplicate: !ins.changes })
  }

  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})\/decide$/)) && write) {
    const placeId = str(body.placeId, 60)
    if (!RE.place.test(placeId)) return bad('place')
    const upd = q.decide.run(placeId, body.time ? str(body.time, 20) : null, now, m[1], device)
    return upd.changes ? ok({ ok: true }) : bad('not_author', 403)
  }

  /* ---- eventos enviados + curadoria ---- */
  if (write && path === '/api/submissions') {
    const id = str(body.id, 50)
    if (!RE.sub.test(id)) return bad('submission')
    const data = json(body.draft, 6000)
    if (!data) return bad('too_large', 413)
    q.insSub.run(id, data, device, now)
    return ok({ ok: true })
  }
  if (method === 'GET' && path === '/api/submissions/mine') {
    if (!RE.device.test(device)) return bad('device')
    return ok(q.mySubs.all(device))
  }
  if (method === 'GET' && path === '/api/submissions') {
    if (!isAdmin(req)) return bad('admin', 401)
    return ok(q.subs.all().map((s) => ({ ...parse(s.data), id: s.id, status: s.status, at: s.at, reviewedAt: s.reviewed_at })))
  }
  if ((m = path.match(/^\/api\/submissions\/(ev-u-[a-z0-9-]{1,40})\/status$/)) && write) {
    if (!isAdmin(req)) return bad('admin', 401)
    const status = ['aprovado', 'recusado', 'pendente'].includes(body.status) ? body.status : null
    if (!status) return bad('status')
    const upd = q.setSub.run(status, now, m[1])
    return upd.changes ? ok({ ok: true }) : bad('not_found', 404)
  }
  if (method === 'GET' && path === '/api/admin/check') return isAdmin(req) ? ok({ ok: true }) : bad('admin', 401)

  /* ---- métricas, feedback, leads ---- */
  if (write && path === '/api/track') {
    const list = Array.isArray(body.events) ? body.events.slice(0, 60) : []
    for (const e of list) {
      if (!RE.evName.test(String(e?.name)) || typeof e.id !== 'string') continue
      q.insEv.run(str(e.id, 40), device, e.name, str(e.props?.src, 40) || null, str(e.path, 80), json(e.props, 1500) ?? '{}', int(e.at, now))
    }
    return ok({ ok: true, n: list.length })
  }
  if (write && path === '/api/feedback') {
    const data = json({ text: str(body.text, 1000), score: int(body.score), path: str(body.path, 80) }, 1500)
    q.insFb.run(str(body.id, 40) || `f-${now}`, device, data, now)
    return ok({ ok: true })
  }
  if (write && path === '/api/leads') {
    const data = json({ placeId: str(body.placeId, 60), placeName: str(body.placeName, 60), requestId: str(body.requestId, 30) || undefined, day: str(body.day, 20), time: str(body.time, 20), people: int(body.people), name: str(body.name, 60), contact: str(body.contact, 40), note: str(body.note, 120) }, 1500)
    q.insLead.run(str(body.id, 40) || `l-${now}`, device, data, now)
    return ok({ ok: true })
  }
  if (method === 'GET' && path === '/api/stats') {
    if (!isAdmin(req)) return bad('admin', 401)
    return ok(stats())
  }

  return bad('not_found', 404)
}
