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
  -- base regional (OpenStreetMap, ODbL): carregada quando alguém se cadastra numa região ainda não coberta
  CREATE TABLE IF NOT EXISTS base_places (id TEXT PRIMARY KEY, row TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, area TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS base_areas (cell TEXT PRIMARY KEY, lat REAL NOT NULL, lng REAL NOT NULL, label TEXT NOT NULL, count INTEGER NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS ix_base_lat ON base_places(lat, lng);
  -- pessoas (LGPD: só com consentimento; "apagar meus dados" remove tudo do aparelho)
  CREATE TABLE IF NOT EXISTS users (
    device TEXT PRIMARY KEY, data TEXT NOT NULL, hood TEXT, lat REAL, lng REAL, consent_at INTEGER NOT NULL,
    token_hash TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY, device TEXT NOT NULL, place_id TEXT NOT NULL, request_id TEXT, verdict TEXT NOT NULL, note TEXT NOT NULL,
    name TEXT NOT NULL, hue INTEGER, place TEXT, status TEXT NOT NULL DEFAULT 'ok', motivo TEXT, at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_reviews_place ON reviews(place_id);
  -- turmas: cada votação vira (ou reaproveita) uma turma; quem vota entra
  CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT, owner_device TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL, device TEXT NOT NULL, name TEXT NOT NULL, hue INTEGER, joined_at INTEGER NOT NULL, last_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, device)
  );
  CREATE INDEX IF NOT EXISTS ix_gm_device ON group_members(device);
  -- aprendizado da IA: pedido → critérios confirmados (exemplos pro prompt) + termos que o app não cobre
  CREATE TABLE IF NOT EXISTS examples (
    id TEXT PRIMARY KEY, device TEXT NOT NULL, text TEXT NOT NULL, tokens TEXT NOT NULL, ai TEXT NOT NULL, final TEXT NOT NULL,
    corrected INTEGER NOT NULL, unmet TEXT NOT NULL, engine TEXT, at INTEGER NOT NULL
  );
  -- avisos no celular (Web Push): inscrição por aparelho
  CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, device TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS ix_push_device ON push_subs(device);
  -- época dos perfis: quando sobe, todo aparelho refaz o cadastro (reset geral de perfis)
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
  -- lugar do OSM → place_id do Google (o place_id é o único dado do Google que os termos deixam guardar)
  CREATE TABLE IF NOT EXISTS gmatch (osm_id TEXT PRIMARY KEY, place_id TEXT, at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS ix_votes_req ON votes(request_id);

  CREATE INDEX IF NOT EXISTS ix_sug_req ON suggestions(request_id);
  CREATE INDEX IF NOT EXISTS ix_events_at ON events(at);
`)

// migração: coluna com o resumo do lugar do Google na sugestão (bancos criados antes dela)
if (!db.prepare("SELECT 1 FROM pragma_table_info('suggestions') WHERE name = 'place'").get()) db.exec('ALTER TABLE suggestions ADD COLUMN place TEXT')
if (!db.prepare("SELECT 1 FROM pragma_table_info('requests') WHERE name = 'group_id'").get()) db.exec('ALTER TABLE requests ADD COLUMN group_id TEXT')
if (!db.prepare("SELECT 1 FROM pragma_table_info('base_areas') WHERE name = 'radius'").get()) db.exec('ALTER TABLE base_areas ADD COLUMN radius INTEGER NOT NULL DEFAULT 2500')
if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'google_sub'").get()) {
  db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT'); db.exec('ALTER TABLE users ADD COLUMN email TEXT')
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_users_google ON users(google_sub)')

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
  const out = [String(v[0]), str(v[1], 80), ['bar', 'restaurante', 'balada', 'evento'].includes(v[2]) ? v[2] : 'bar', str(v[3], 40), list(v[4], 3), int(v[5]), list(v[6], 2), list(v[7], 3)]
  const i = v[9] && typeof v[9] === 'object' ? v[9] : null
  const info = i ? Object.fromEntries([
    ...['r', 'c', 'la', 'lo'].map((k) => [k, Number.isFinite(Number(i[k])) && i[k] !== null ? Number(i[k]) : undefined]),
    ...['o', 'b', 'm', 'g'].map((k) => [k, typeof i[k] === 'boolean' ? i[k] : undefined]),
    ['n', typeof i.n === 'string' ? i.n.slice(0, 160) : undefined],
  ].filter(([, x]) => x !== undefined)) : null
  // 9º = 'b' (sem curadoria, Google ao vivo); 10º = resumo pra quem vota (nota/atributos/motivo da IA)
  return info ? [...out, v[8] === 'b' ? 'b' : '', info] : v[8] === 'b' ? [...out, 'b'] : out
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
  setGroup: db.prepare('UPDATE requests SET group_id = ? WHERE id = ?'),
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
    authorDevice: r.author_device, groupId: r.group_id ?? undefined,
    decision: r.decided_place ? { placeId: r.decided_place, time: r.decided_time ?? undefined, at: r.decided_at } : null,
    votes: q.votes.all(id),
    suggestions: q.sugs.all(id).map((x) => ({ ...x, place: x.place ? parse(x.place) : undefined })),
  }
}

function peopleStats() {
  const users = db.prepare('SELECT data, hood, google_sub FROM users WHERE consent_at > 0').all()
  const byHood = {}, byNiche = {}
  for (const u of users) {
    const d = parse(u.data) ?? {}
    if (u.hood) byHood[u.hood] = (byHood[u.hood] ?? 0) + 1
    for (const n of d.niches ?? []) byNiche[n] = (byNiche[n] ?? 0) + 1
  }
  const one = (sql) => db.prepare(sql).get().n
  return {
    users: users.length, withGoogle: users.filter((u) => u.google_sub).length, byHood, byNiche,
    reviews: one("SELECT COUNT(*) AS n FROM reviews WHERE status = 'ok'"),
    groups: one('SELECT COUNT(*) AS n FROM groups'),
    activeGroups: one('SELECT COUNT(*) AS n FROM (SELECT group_id FROM group_members GROUP BY group_id HAVING COUNT(*) >= 2)'),
    examples: one('SELECT COUNT(*) AS n FROM examples'), corrected: one('SELECT COUNT(*) AS n FROM examples WHERE corrected = 1'),
    unmet: (() => { const c = {}; for (const r of db.prepare('SELECT unmet FROM examples').all()) for (const u of parse(r.unmet) ?? []) c[u] = (c[u] ?? 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10) })(),
  }
}

/** chamadas ao Google por SKU (eventos google_call dos aparelhos), no mês e hoje (UTC, como o Google cobra) */
function apiStats(events) {
  const d = new Date(), m0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1), t0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  const month = {}, today = {}
  for (const e of events) {
    if (e.name !== 'google_call' || e.at < m0) continue
    const sku = parse(e.props)?.sku ?? '?'
    month[sku] = (month[sku] ?? 0) + 1
    if (e.at >= t0) today[sku] = (today[sku] ?? 0) + 1
  }
  return { month, today }
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
    counts, total: events.length, devices, bySrc, people: peopleStats(), apis: apiStats(events),
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
const curatedSnap = (v) => snap(v)?.slice(0, 8) ?? null // no catálogo da comunidade o lugar é curado: sem a marca 'b'

export function insertPlace(body, device, verdict) {
  if (!RE.device.test(device)) return bad('device')
  const sp = curatedSnap(body.place)
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
  const sp = curatedSnap(body.place)
  return sp ? { name: sp[1], comment: str(body.comment, 200), exists: !!q.getPlace.get(sp[0]) } : null
}

/* ---------- roteamento ---------- */
const ok = (body) => [200, body]
const bad = (error, status = 400) => [status, { error }]

/** devolve [status, body]; quem chama cuida de CORS, limite e leitura do corpo */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN)
/** coordenadas dentro do Brasil (com folga) */
export const validLatLng = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat > -34 && lat < 6 && lng > -74 && lng < -34

/** remove nome/bairro de lugares do Google (g-) de pedidos e sugestões com mais de 30 dias, exceto os que a
 *  comunidade confirmou (tabela places). Fica só o place_id. */
export function purgeGoogleSnaps() {
  const cut = Date.now() - 30 * 86_400_000
  const community = new Set(db.prepare("SELECT id FROM places WHERE status = 'ok'").all().map((r) => r.id))
  let n = 0
  for (const r of db.prepare('SELECT id, data FROM requests WHERE created_at < ?').all(cut)) {
    const d = parse(r.data)
    if (!d?.places?.length) continue
    const keep = d.places.filter((p) => !String(p[0]).startsWith('g-') || community.has(p[0]))
    if (keep.length !== d.places.length) { d.places = keep; db.prepare('UPDATE requests SET data = ? WHERE id = ?').run(JSON.stringify(d), r.id); n++ }
  }
  n += db.prepare("UPDATE suggestions SET place = NULL WHERE place IS NOT NULL AND at < ? AND place_id LIKE 'g-%' AND place_id NOT IN (SELECT id FROM places WHERE status = 'ok')").run(cut).changes
  db.prepare("UPDATE reviews SET place = NULL WHERE place IS NOT NULL AND at < ? AND place_id LIKE 'g-%' AND place_id NOT IN (SELECT id FROM places WHERE status = 'ok')").run(cut)
  if (n) console.log(`purga Google: ${n} registros com mais de 30 dias`)
}

/* ---------- pessoas: perfil, avaliações, turmas ---------- */
const NICHES = new Set(['jazz', 'listening', 'eletronica', 'drinks', 'boteco', 'gastronomia', 'ao-ar-livre', 'samba', 'rock', 'indie'])
const VERDICT_SCORE = { amei: 10, ok: 7, 'nao-curti': 3 }
const RE_GROUP = /^t-[a-z0-9]{10}$/
const qp = {
  getUser: db.prepare('SELECT * FROM users WHERE device = ?'),
  putUser: db.prepare(`INSERT INTO users (device, data, hood, lat, lng, consent_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(device) DO UPDATE SET data = excluded.data, hood = excluded.hood, lat = excluded.lat, lng = excluded.lng, consent_at = excluded.consent_at, updated_at = excluded.updated_at`),
  byGoogle: db.prepare('SELECT * FROM users WHERE google_sub = ?'),
  linkGoogle: db.prepare('UPDATE users SET google_sub = ?, email = ? WHERE device = ?'),
  insBare: db.prepare('INSERT INTO users (device, data, consent_at, created_at, updated_at, google_sub, email) VALUES (?, ?, 0, ?, ?, ?, ?)'),
  insReview: db.prepare(`INSERT OR REPLACE INTO reviews (id, device, place_id, request_id, verdict, note, name, hue, place, status, motivo, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  placeReviews: db.prepare(`SELECT id, device, verdict, note, name, hue, status, at FROM reviews WHERE place_id = ? AND (status = 'ok' OR device = ?) ORDER BY at DESC LIMIT 40`),
  myReviews: db.prepare('SELECT id, place_id, request_id, verdict, note, place, at FROM reviews WHERE device = ? ORDER BY at'),
  ratings: db.prepare(`SELECT place_id, verdict, COUNT(*) AS n FROM reviews WHERE status = 'ok' GROUP BY place_id, verdict`),
  getGroup: db.prepare('SELECT * FROM groups WHERE id = ?'),
  insGroup: db.prepare('INSERT INTO groups (id, name, owner_device, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'),
  touchGroup: db.prepare('UPDATE groups SET updated_at = ? WHERE id = ?'),
  renameGroup: db.prepare('UPDATE groups SET name = ? WHERE id = ?'),
  member: db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND device = ?'),
  addMember: db.prepare(`INSERT INTO group_members (group_id, device, name, hue, joined_at, last_at) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_id, device) DO UPDATE SET name = excluded.name, last_at = excluded.last_at`),
  leave: db.prepare('DELETE FROM group_members WHERE group_id = ? AND device = ?'),
  myGroups: db.prepare(`SELECT g.* FROM groups g JOIN group_members m ON m.group_id = g.id WHERE m.device = ? ORDER BY g.updated_at DESC LIMIT 20`),
  members: db.prepare('SELECT device, name, hue FROM group_members WHERE group_id = ? ORDER BY joined_at'),
  groupRequests: db.prepare('SELECT id, data, created_at, decided_place FROM requests WHERE group_id = ? ORDER BY created_at DESC LIMIT 6'),
  setReqGroup: db.prepare('UPDATE requests SET group_id = ? WHERE id = ?'),
}
const userName = (device) => parse(qp.getUser.get(device)?.data ?? 'null')?.name

/** perfil sem nada além do necessário: nome, @, cor, bairro, gosto e região arredondada (~1 km) */
function cleanProfile(b) {
  const p = b?.profile ?? {}
  const home = p.home && Number.isFinite(Number(p.home.lat)) ? { lat: Math.round(Number(p.home.lat) * 100) / 100, lng: Math.round(Number(p.home.lng) * 100) / 100, label: str(p.home.label, 40), city: str(p.home.city, 40), via: ['gps', 'cep', 'bairro'].includes(p.home.via) ? p.home.via : 'bairro' } : undefined
  return {
    name: str(p.name, 40).trim(), handle: str(p.handle, 30), hue: int(p.hue, 82), hood: str(p.hood, 40),
    niches: (Array.isArray(p.niches) ? p.niches : []).filter((n) => NICHES.has(n)).slice(0, 8),
    vibes: (Array.isArray(p.vibes) ? p.vibes : []).map((v) => str(v, 20)).slice(0, 6), home,
  }
}

/** login com Google (o token já foi validado no server.mjs): conta existente → devolve o aparelho/perfil dela;
 *  conta nova → liga ao aparelho atual */
export function googleLogin(sub, email, givenName, device) {
  if (!RE.device.test(device)) return bad('device')
  const now = Date.now()
  const acc = qp.byGoogle.get(sub)
  if (acc) {
    return ok({ existing: true, device: acc.device, email, profile: parse(acc.data), consentAt: acc.consent_at,
      reviews: qp.myReviews.all(acc.device).map((r) => ({ ...r, place: r.place ? parse(r.place) : undefined })) })
  }
  const here = qp.getUser.get(device)
  if (here) qp.linkGoogle.run(sub, email, device)
  else qp.insBare.run(device, JSON.stringify({ name: str(givenName, 40) }), now, now, sub, email)
  return ok({ existing: false, device, email, name: str(givenName, 40) })
}

/** avaliação "Quem foi" (moderação do comentário feita no server.mjs antes de chegar aqui) */
export function insertReview(body, device, verdict) {
  if (!RE.device.test(device)) return bad('device')
  const id = str(body.id, 30), placeId = String(body.placeId ?? '')
  if (!/^rv-[a-z0-9-]{1,24}$/.test(id) || !RE.place.test(placeId) || !(body.verdict in VERDICT_SCORE)) return bad('review')
  const rid = RE.request.test(String(body.requestId ?? '')) ? body.requestId : null
  const sp = snap(body.place)
  const name = userName(device) ?? str(body.name, 40) ?? 'Alguém'
  qp.insReview.run(id, device, placeId, rid, body.verdict, str(body.note, 400), name || 'Alguém', int(body.hue, 82), sp ? JSON.stringify(sp) : null,
    verdict.ok ? 'ok' : 'revisao', verdict.motivo || null, int(body.at, Date.now()))
  return ok({ ok: true, status: verdict.ok ? 'ok' : 'revisao' })
}

function groupView(g, device) {
  return {
    id: g.id, name: g.name, mine: g.owner_device === device, updatedAt: g.updated_at,
    members: qp.members.all(g.id).map((m) => ({ name: m.name, hue: m.hue, me: m.device === device })),
    requests: qp.groupRequests.all(g.id).map((r) => ({ id: r.id, text: parse(r.data)?.text ?? '', createdAt: r.created_at, decided: !!r.decided_place })),
  }
}
/** quem vota/sugere num pedido de turma entra nela */
function joinGroupOf(requestId, device, name, hue) {
  const r = q.getReq.get(requestId)
  if (!r?.group_id) return
  const now = Date.now()
  qp.addMember.run(r.group_id, device, str(name, 40) || 'Alguém', int(hue, 200), now, now)
  qp.touchGroup.run(now, r.group_id)
}

/* ---------- aprendizado: exemplos parecidos pro prompt da LLM ---------- */
const normTxt = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ')
const STOP = new Set(['de', 'da', 'do', 'com', 'pra', 'para', 'um', 'uma', 'no', 'na', 'em', 'e', 'o', 'a', 'que', 'quero', 'ate', 'os', 'as', 'meu', 'minha'])
const toks = (s) => [...new Set(normTxt(s).split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))]
const validEx = (e) => e && typeof e === 'object' && e.ocasiao && e.pessoas && e.orcamento && Array.isArray(e.itens) && e.itens.length <= 5 &&
  e.itens.every((i) => typeof i?.valor === 'string' && typeof i?.trecho === 'string' && i.trecho.length <= 60)
/** até k exemplos parecidos (Jaccard de palavras), priorizando os corrigidos por gente; só os que ensinam algo */
export function similarExamples(text, k = 3) {
  const t = new Set(toks(text))
  if (!t.size) return []
  const rows = db.prepare('SELECT text, tokens, final, corrected FROM examples ORDER BY at DESC LIMIT 2000').all()
  return rows.map((r) => {
    const o = r.tokens.split(' ')
    const inter = o.filter((w) => t.has(w)).length
    return { r, s: inter / (t.size + o.length - inter) + (r.corrected ? 0.1 : 0) }
  }).filter((x) => x.s >= 0.25 && normTxt(x.r.text).trim() !== normTxt(text).trim()).sort((a, b) => b.s - a.s).slice(0, k)
    .map(({ r }) => [r.text, parse(r.final)]).filter(([, f]) => validEx(f))
}

/* ---------- avisos (o server.mjs pluga o envio em hooks.notify) ---------- */
export const hooks = { notify: null }
export const pushSubsOf = (devices) => devices.length ? db.prepare(`SELECT endpoint, p256dh, auth, device FROM push_subs WHERE device IN (${devices.map(() => '?').join(',')})`).all(...devices).map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth }, device: r.device })) : []
export const dropPushSub = (endpoint) => db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint)
const placeNameIn = (r, placeId) => (parse(r.data)?.places ?? []).find((p) => p[0] === placeId)?.[1]
function notify(e) { try { hooks.notify?.(e) } catch { /* aviso nunca derruba a API */ } }

function handlePeople(method, path, body, device, now) {
  let m
  if (method === 'GET' && path === '/api/me') {
    const u = qp.getUser.get(device)
    return u ? ok({ profile: parse(u.data), consentAt: u.consent_at, email: u.email ?? undefined }) : bad('not_found', 404)
  }
  if (method === 'POST' && path === '/api/me') {
    const consentAt = int(body.consentAt, 0)
    if (!consentAt) return bad('consent')
    const p = cleanProfile(body)
    if (p.name.length < 2) return bad('profile')
    const ex = qp.getUser.get(device)
    qp.putUser.run(device, JSON.stringify(p), p.hood, p.home?.lat ?? null, p.home?.lng ?? null, consentAt, ex?.created_at ?? now, now)
    return ok({ ok: true })
  }
  if (method === 'POST' && path === '/api/me/delete') {
    db.exec('BEGIN')
    try {
      db.prepare('DELETE FROM users WHERE device = ?').run(device)
      db.prepare('DELETE FROM reviews WHERE device = ?').run(device)
      db.prepare('DELETE FROM group_members WHERE device = ?').run(device)
      db.prepare("UPDATE votes SET voter = 'Alguém' WHERE device = ?").run(device)
      db.prepare("UPDATE suggestions SET by_name = 'Alguém' WHERE device = ?").run(device)
      db.prepare('DELETE FROM feedback WHERE device = ?').run(device)
      db.prepare('DELETE FROM leads WHERE device = ?').run(device)
      db.prepare('DELETE FROM events WHERE device = ?').run(device)
      db.exec('COMMIT')
    } catch (e) { db.exec('ROLLBACK'); throw e }
    return ok({ ok: true })
  }
  if (method === 'GET' && path === '/api/reviews/mine') return ok(qp.myReviews.all(device).map((r) => ({ ...r, place: r.place ? parse(r.place) : undefined })))
  if ((m = path.match(/^\/api\/places\/([^/]{2,130})\/reviews$/)) && method === 'GET') {
    if (!RE.place.test(m[1])) return bad('place')
    const rows = qp.placeReviews.all(m[1], device)
    const okRows = rows.filter((r) => r.status === 'ok')
    const score = okRows.length ? Math.round((okRows.reduce((a, r) => a + VERDICT_SCORE[r.verdict], 0) / okRows.length) * 10) / 10 : null
    return ok({ score, count: okRows.length, items: rows.map((r) => ({ id: r.id, name: r.name, hue: r.hue, verdict: r.verdict, note: r.note, at: r.at, mine: r.device === device, pending: r.status !== 'ok' })) })
  }
  if (method === 'GET' && path === '/api/ratings') {
    const acc = {}
    for (const r of qp.ratings.all()) { const a = (acc[r.place_id] ??= [0, 0]); a[0] += VERDICT_SCORE[r.verdict] * r.n; a[1] += r.n }
    return ok(Object.fromEntries(Object.entries(acc).map(([k, [sum, n]]) => [k, [Math.round((sum / n) * 10) / 10, n]])))
  }
  if (method === 'GET' && path === '/api/groups') return ok(qp.myGroups.all(device).map((g) => groupView(g, device)))
  if ((m = path.match(/^\/api\/groups\/(t-[a-z0-9]{10})\/(name|leave)$/)) && method === 'POST') {
    if (!qp.member.get(m[1], device)) return bad('not_member', 403)
    if (m[2] === 'leave') { qp.leave.run(m[1], device); return ok({ ok: true }) }
    qp.renameGroup.run(str(body.name, 40).trim() || null, m[1])
    return ok({ ok: true })
  }
  return null
}

export function handleApi(method, path, req, body) {
  const device = str(req.headers['x-device'], 40)
  const write = method === 'POST'
  if (write && !RE.device.test(device)) return bad('device')
  const now = Date.now()
  let m

  if (method === 'GET' && path === '/api/health') return ok({ ok: true, db: true, at: now, profileEpoch: Number(db.prepare("SELECT v FROM meta WHERE k = 'profile_epoch'").get()?.v ?? 0) })
  if (/^\/api\/(me|reviews|ratings|groups)\b|^\/api\/places\/[^/]+\/reviews$/.test(path)) {
    if (!RE.device.test(device)) return bad('device')
    const out = handlePeople(method, path, body, device, now)
    if (out) return out
  }

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
  if (write && path === '/api/push/subscribe') {
    const ep = String(body.endpoint ?? '')
    if (!/^https:\/\/[^\s]{10,500}$/.test(ep) || !/^[A-Za-z0-9_-]{40,120}$/.test(String(body.keys?.p256dh)) || !/^[A-Za-z0-9_-]{10,40}$/.test(String(body.keys?.auth))) return bad('push')
    db.prepare('INSERT OR REPLACE INTO push_subs (endpoint, device, p256dh, auth, at) VALUES (?, ?, ?, ?, ?)').run(ep, device, body.keys.p256dh, body.keys.auth, now)
    return ok({ ok: true })
  }
  if (write && path === '/api/push/unsubscribe') { dropPushSub(String(body.endpoint ?? '')); return ok({ ok: true }) }
  if (write && path === '/api/examples') {
    const text = str(body.text, 300).trim()
    if (text.length < 4 || !validEx(body.final) || !validEx(body.ai)) return bad('example')
    const unmet = (Array.isArray(body.unmet) ? body.unmet : []).map((u) => str(u, 30)).slice(0, 8)
    db.prepare('INSERT OR REPLACE INTO examples (id, device, text, tokens, ai, final, corrected, unmet, engine, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(`x-${randomBytes(6).toString('hex')}`, device, text, toks(text).join(' '), JSON.stringify(body.ai), JSON.stringify(body.final), body.corrected ? 1 : 0, JSON.stringify(unmet), str(body.engine, 10), now)
    return ok({ ok: true })
  }
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
    if (!ins.changes) {
      // o autor pode atualizar (ex.: novas opções); os outros não. Resumos de lugares se juntam (não somem)
      const prev = parse(q.getReq.get(id)?.data ?? 'null')
      const next = parse(data)
      if (prev?.places?.length) {
        const have = new Set(next.places.map((p) => p[0]))
        next.places = [...next.places, ...prev.places.filter((p) => !have.has(p[0]))].slice(-8)
      }
      q.updReq.run(JSON.stringify(next), id, device)
    }
    // turma: reaproveita a indicada (se o autor é membro) ou cria uma nova com o autor
    const cur = q.getReq.get(id)
    let groupId = cur.group_id
    if (cur.author_device === device) {
      const want = RE_GROUP.test(String(body.groupId ?? '')) && qp.member.get(body.groupId, device) ? body.groupId : null
      if (want && want !== groupId) groupId = want
      if (!groupId) { groupId = `t-${randomBytes(8).toString('hex').slice(0, 10)}`; qp.insGroup.run(groupId, null, device, now, now) }
      q.setGroup.run(groupId, id)
      qp.addMember.run(groupId, device, str(body.author?.name, 40) || 'Alguém', int(body.author?.hue, 82), now, now)
      qp.touchGroup.run(now, groupId)
    }
    return ok({ ok: true, groupId })
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
    joinGroupOf(m[1], device, body.voter, body.hue)
    {
      const r = q.getReq.get(m[1])
      if (r && r.author_device !== device) notify({ to: [r.author_device], key: `v-${m[1]}`, title: 'Voto novo no seu rolê', body: `${str(body.voter, 40) || 'Alguém'} votou${kind === 'place' ? ` em ${placeNameIn(r, value) ?? 'uma opção'}` : ` no horário ${value}`}`, url: `pedido/${m[1]}` })
    }
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
    joinGroupOf(m[1], device, by, body.hue)
    if (r.author_device !== device) notify({ to: [r.author_device], key: `s-${m[1]}`, title: 'Sugestão nova no seu rolê', body: `${by} sugeriu ${ps?.[1] ?? 'um lugar'}`, url: `pedido/${m[1]}` })
    return ok({ ok: true, duplicate: !ins.changes })
  }

  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})\/delete$/)) && write) {
    const r = q.getReq.get(m[1])
    if (!r) return ok({ ok: true })
    if (r.author_device !== device) return bad('not_author', 403)
    db.prepare('DELETE FROM votes WHERE request_id = ?').run(m[1])
    db.prepare('DELETE FROM suggestions WHERE request_id = ?').run(m[1])
    db.prepare('DELETE FROM requests WHERE id = ?').run(m[1])
    return ok({ ok: true })
  }
  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})\/decide$/)) && write) {
    const placeId = str(body.placeId, 60)
    if (!RE.place.test(placeId)) return bad('place')
    const upd = q.decide.run(placeId, body.time ? str(body.time, 20) : null, now, m[1], device)
    if (upd.changes) {
      const r = q.getReq.get(m[1])
      const voters = db.prepare('SELECT DISTINCT device FROM votes WHERE request_id = ? AND device != ?').all(m[1], device).map((x) => x.device)
      notify({ to: voters, key: `d-${m[1]}`, title: 'Fechou o rolê!', body: `${placeNameIn(r, placeId) ?? 'O lugar foi escolhido'}${body.time ? ` · ${str(body.time, 20)}` : ''}`, url: `r/${m[1]}` })
    }
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
