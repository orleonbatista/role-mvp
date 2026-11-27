// Backend de dados do rolê (testes com amigos): SQLite nativo do Node (node:sqlite, Node ≥ 22.13),
// servido pelo mesmo gateway/túnel do LLM em /api/*. Guarda só o que precisa ser COMPARTILHADO entre
// aparelhos: pedidos, votos, sugestões, decisão, eventos enviados/curadoria, métricas, feedback e leads.
// Catálogo, ranking e perfil continuam no aparelho (o app funciona sem backend e sincroniza quando ele está no ar).
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
// decisão em grupo: vários horários por pessoa, presença confirmada, recados e prazo de votação
db.exec(`
  CREATE TABLE IF NOT EXISTS slots (request_id TEXT NOT NULL, device TEXT NOT NULL, slot TEXT NOT NULL, voter TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (request_id, device, slot));
  CREATE TABLE IF NOT EXISTS rsvps (request_id TEXT NOT NULL, device TEXT NOT NULL, status TEXT NOT NULL, voter TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (request_id, device));
  CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, device TEXT NOT NULL, voter TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS ix_msg_req ON messages(request_id, at);
  CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, device TEXT NOT NULL, voter TEXT NOT NULL, bytes INTEGER NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS ix_photos_req ON photos(request_id, at);
  -- fotos do lugar que são nossas (enviadas pela casa ou pela comunidade), com nota da IA pro carrossel
  CREATE TABLE IF NOT EXISTS place_photos (id TEXT PRIMARY KEY, place_id TEXT NOT NULL, source TEXT NOT NULL, device TEXT NOT NULL, bytes INTEGER NOT NULL,
    score REAL, reason TEXT, status TEXT NOT NULL DEFAULT 'avaliando', at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS ix_pphotos ON place_photos(place_id, status, score);
  -- página da casa: quem reivindicou, dados que a casa edita, destaque pago e oferta pra grupos
  CREATE TABLE IF NOT EXISTS venues (
    place_id TEXT PRIMARY KEY, owner_device TEXT, status TEXT NOT NULL, claim TEXT, data TEXT NOT NULL DEFAULT '{}',
    sponsored_until INTEGER, at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  -- sessão: token aleatório (só o hash fica aqui) ligado ao aparelho/conta; depois que um aparelho tem sessão,
  -- o id dele sozinho não vale mais como credencial
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, device TEXT NOT NULL, at INTEGER NOT NULL, last_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS ix_sess_dev ON sessions(device);
  -- rede social: amizades (pedido → aceite), bloqueios, listas de curadoria e chat da turma
  CREATE TABLE IF NOT EXISTS friendships (a TEXT NOT NULL, b TEXT NOT NULL, status TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (a, b));
  CREATE TABLE IF NOT EXISTS blocks (device TEXT NOT NULL, blocked TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (device, blocked));
  CREATE TABLE IF NOT EXISTS lists (id TEXT PRIMARY KEY, device TEXT NOT NULL, title TEXT NOT NULL, places TEXT NOT NULL DEFAULT '[]', public INTEGER NOT NULL DEFAULT 1, at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS group_messages (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, device TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS ix_gmsg ON group_messages(group_id, at);
  CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, kind TEXT NOT NULL, target_id TEXT NOT NULL, device TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'aberta', UNIQUE (kind, target_id, device));
`)
if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'handle'").get()) db.exec('ALTER TABLE users ADD COLUMN handle TEXT')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_users_handle ON users(handle)')
// caixa de notificações: tudo que vira aviso no celular também fica aqui (dá pra ver depois, mesmo sem avisos ligados)
db.exec(`CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY, device TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT NOT NULL, ref TEXT, actor TEXT, at INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX IF NOT EXISTS ix_inbox ON inbox(device, at);`)
if (!db.prepare("SELECT 1 FROM pragma_table_info('inbox') WHERE name = 'actor'").get()) db.exec('ALTER TABLE inbox ADD COLUMN actor TEXT')
if (!db.prepare("SELECT 1 FROM pragma_table_info('requests') WHERE name = 'review_notified'").get()) db.exec('ALTER TABLE requests ADD COLUMN review_notified INTEGER')
if (!db.prepare("SELECT 1 FROM pragma_table_info('requests') WHERE name = 'closes_at'").get()) { db.exec('ALTER TABLE requests ADD COLUMN closes_at INTEGER'); db.exec('ALTER TABLE requests ADD COLUMN close_notified INTEGER') }
if (!db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'role'").get()) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'usuario'")
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

const keyOk = (req) => {
  const k = Buffer.from(String(req.headers['x-admin-key'] ?? ''))
  const a = Buffer.from(ADMIN_KEY)
  return k.length === a.length && timingSafeEqual(k, a)
}
/* ---------- papéis (RBAC): admin > curador > usuario ----------
   admin = e-mail Google na lista (data/admins.json ou ADMIN_EMAILS) ou quem tem a chave da curadoria (acesso de emergência).
   Papel vale só pra aparelho ligado a conta Google — o id do aparelho sozinho não promove ninguém. */
const ADMINS_FILE = join(DATA, 'admins.json')
if (!existsSync(ADMINS_FILE)) writeFileSync(ADMINS_FILE, JSON.stringify(['orleonbatista@gmail.com']))
const adminEmails = () => {
  try { return new Set([...JSON.parse(readFileSync(ADMINS_FILE, 'utf8')), ...String(process.env.ADMIN_EMAILS ?? '').split(',')].map((e) => String(e).trim().toLowerCase()).filter(Boolean)) } catch { return new Set() }
}
export function roleOf(device) {
  if (!RE.device.test(String(device ?? ''))) return 'usuario'
  const u = db.prepare('SELECT email, role, google_sub FROM users WHERE device = ?').get(device)
  if (!u?.google_sub) return 'usuario'
  if (u.email && adminEmails().has(String(u.email).toLowerCase())) return 'admin'
  return u.role === 'curador' || u.role === 'admin' ? u.role : 'usuario'
}
const devOf = (req) => String(req.headers['x-device'] ?? '')
const sha = (t) => createHash('sha256').update(String(t)).digest('hex')
function newSession(device) {
  const token = randomBytes(24).toString('base64url')
  db.prepare('INSERT INTO sessions (token_hash, device, at, last_at) VALUES (?, ?, ?, ?)').run(sha(token), device, Date.now(), Date.now())
  return token
}
/** confere a sessão antes de qualquer rota: com token, o aparelho vem dele (o X-Device é ignorado);
 *  sem token, só vale um aparelho que ainda não tem sessão (transição) — id vazado de quem já tem sessão não abre nada */
/** aparelho a usar no login Google: o da sessão; sem sessão, o informado só se ele ainda não tem sessão;
 *  senão um aparelho novo (quem tem um id vazado não consegue ligar a própria conta ao aparelho de outra pessoa) */
export function deviceForLogin(req) {
  const claimed = String(req.headers['x-device'] ?? '')
  if (req.headers['x-session']) return claimed // já trocado pelo da sessão em resolveSession
  if (!claimed || db.prepare('SELECT 1 FROM sessions WHERE device = ? LIMIT 1').get(claimed)) return `d-${randomBytes(10).toString('hex')}`
  return claimed
}
export function resolveSession(req, path) {
  const tok = String(req.headers['x-session'] ?? '')
  if (tok) {
    const s = db.prepare('SELECT device, last_at FROM sessions WHERE token_hash = ?').get(sha(tok))
    if (!s) return { error: 'session' }
    if (Date.now() - s.last_at > 3600_000) db.prepare('UPDATE sessions SET last_at = ? WHERE token_hash = ?').run(Date.now(), sha(tok))
    req.headers['x-device'] = s.device
    return null
  }
  const claimed = String(req.headers['x-device'] ?? '')
  if (!claimed || path === '/api/auth/google' || path === '/api/health') return null
  if (db.prepare('SELECT 1 FROM sessions WHERE device = ? LIMIT 1').get(claimed)) return { error: 'session' }
  return null
}
export function isAdminReq(req) { return isAdmin(req) }
function isAdmin(req) { return keyOk(req) || roleOf(devOf(req)) === 'admin' }
function isCurator(req) { return isAdmin(req) || roleOf(devOf(req)) === 'curador' }

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

// o id do aparelho é a credencial de quem usa: nunca sai do servidor pra terceiros. Fora daqui vai um apelido estável
// (hash com sal secreto), suficiente pro app saber "esse voto é meu?" sem permitir se passar por outra pessoa
const SALT_FILE = join(DATA, 'pseudo-salt.txt')
if (!existsSync(SALT_FILE)) writeFileSync(SALT_FILE, randomBytes(24).toString('hex'))
const SALT = readFileSync(SALT_FILE, 'utf8').trim()
const pseudo = (device) => (device ? `u-${createHash('sha256').update(SALT + device).digest('hex').slice(0, 16)}` : device)
const hide = (rows) => rows.map((x) => ({ ...x, device: pseudo(x.device) }))

function requestState(id, viewer) {
  const r = q.getReq.get(id)
  if (!r) return null
  return {
    request: { ...parse(r.data), id: r.id, createdAt: r.created_at },
    authorDevice: pseudo(r.author_device), me: pseudo(viewer), groupId: r.group_id ?? undefined,
    decision: r.decided_place ? { placeId: r.decided_place, time: r.decided_time ?? undefined, at: r.decided_at } : null,
    votes: hide(q.votes.all(id)),
    slots: hide(db.prepare('SELECT device, slot, voter, at FROM slots WHERE request_id = ? ORDER BY at').all(id)),
    rsvps: hide(db.prepare('SELECT device, status, voter, at FROM rsvps WHERE request_id = ? ORDER BY at').all(id)),
    messages: db.prepare("SELECT id, device, voter, text, at FROM messages WHERE request_id = ? AND id NOT IN (SELECT target_id FROM reports WHERE kind = 'message' GROUP BY target_id HAVING COUNT(*) >= 3) ORDER BY at DESC LIMIT 30").all(id).reverse().map((x) => ({ ...x, device: pseudo(x.device) })),
    closesAt: r.closes_at ?? null,
    // quem está na votação (só quem tem perfil), com reputação: base pra adicionar como amigo
    participants: participantsOf(id).filter((d) => !viewer || !isBlocked(viewer, d)).map((d) => {
      const u = qp.getUser.get(d)
      if (!u) return null
      const p = parse(u.data) ?? {}
      const rep = reputationOf(d)
      return { pid: pseudo(d), handle: handleOf(d), name: p.name ?? 'Alguém', hue: p.hue ?? 200, level: rep.level, points: rep.points, me: d === viewer, author: d === r.author_device }
    }).filter(Boolean),
    photos: db.prepare("SELECT id, device, voter, at FROM photos WHERE request_id = ? AND id NOT IN (SELECT target_id FROM reports WHERE kind = 'photo' GROUP BY target_id HAVING COUNT(*) >= 3) ORDER BY at").all(id).map((x) => ({ ...x, device: pseudo(x.device) })),
    suggestions: q.sugs.all(id).map((x) => ({ ...x, device: pseudo(x.device), place: x.place ? parse(x.place) : undefined })),
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

/** funil dos últimos 30 dias: pessoas (aparelhos distintos por etapa) e pedidos (do criado ao avaliado) */
function funnelStats(events) {
  const since = Date.now() - 30 * 86_400_000
  const steps = [['abriu o app', 'app_open'], ['fez o cadastro', 'onboarding_done'], ['criou pedido', 'request_created'], ['mandou pro grupo', 'share_sent'], ['votou', 'vote_cast'], ['fechou rolê', 'decided'], ['avaliou', 'review_saved']]
  const people = steps.map(([label, name]) => ({ label, n: new Set(events.filter((e) => e.at >= since && e.name === name).map((e) => e.device)).size }))
  const one = (sql) => db.prepare(sql).get(since).n
  const requests = [
    { label: 'pedidos criados', n: one('SELECT COUNT(*) n FROM requests WHERE created_at >= ?') },
    { label: 'com voto de outra pessoa', n: one('SELECT COUNT(DISTINCT r.id) n FROM requests r JOIN votes v ON v.request_id = r.id AND v.device != r.author_device WHERE r.created_at >= ?') },
    { label: 'fechados', n: one('SELECT COUNT(*) n FROM requests WHERE created_at >= ? AND decided_place IS NOT NULL') },
    { label: 'avaliados depois', n: one("SELECT COUNT(DISTINCT r.id) n FROM requests r JOIN reviews v ON v.request_id = r.id WHERE r.created_at >= ?") },
  ]
  return { people, requests }
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
    counts, total: events.length, devices, bySrc, people: peopleStats(), apis: apiStats(events), funnel: funnelStats(events),
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
    return ok({ existing: true, device: acc.device, session: newSession(acc.device), email, profile: parse(acc.data), consentAt: acc.consent_at,
      reviews: qp.myReviews.all(acc.device).map((r) => ({ ...r, place: r.place ? parse(r.place) : undefined })) })
  }
  const here = qp.getUser.get(device)
  if (here?.google_sub && here.google_sub !== sub) return bad('device_has_account', 409) // nunca troca a conta de um aparelho
  if (here) qp.linkGoogle.run(sub, email, device)
  else qp.insBare.run(device, JSON.stringify({ name: str(givenName, 40) }), now, now, sub, email)
  return ok({ existing: false, device, session: newSession(device), email, name: str(givenName, 40) })
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
    members: qp.members.all(g.id).map((m) => ({ name: m.name, hue: m.hue, me: m.device === device, pid: pseudo(m.device), handle: handleOf(m.device), level: reputationOf(m.device).level })),
    requests: qp.groupRequests.all(g.id).map((r) => ({ id: r.id, text: parse(r.data)?.text ?? '', createdAt: r.created_at, decided: !!r.decided_place })),
  }
}
/** quem vota/sugere num pedido de turma entra nela */
function joinGroupOf(requestId, device, name, hue) {
  const r = q.getReq.get(requestId)
  if (!r?.group_id) return
  const now = Date.now()
  let gid = r.group_id
  // primeiro convidado entrando num pedido cuja turma ainda é só o autor: se autor e convidado já têm uma turma juntos,
  // o pedido vai pra ela (a mesma galera vira uma turma só, em vez de uma por pedido)
  if (device !== r.author_device) {
    const ms = qp.members.all(gid)
    if (ms.length === 1 && ms[0].device === r.author_device) {
      const other = db.prepare(`SELECT g.id FROM groups g JOIN group_members a ON a.group_id = g.id AND a.device = ?
        JOIN group_members b ON b.group_id = g.id AND b.device = ? WHERE g.id != ? ORDER BY g.updated_at DESC LIMIT 1`).get(r.author_device, device, gid)
      if (other) {
        q.setGroup.run(other.id, requestId)
        db.prepare('DELETE FROM group_members WHERE group_id = ?').run(gid)
        db.prepare('DELETE FROM groups WHERE id = ?').run(gid)
        gid = other.id
      }
    }
  }
  qp.addMember.run(gid, device, str(name, 40) || 'Alguém', int(hue, 200), now, now)
  qp.touchGroup.run(now, gid)
}

/** aparelhos de quem é admin (pra avisos de operação) */
function adminDevices() {
  const emails = adminEmails()
  return db.prepare('SELECT device, email FROM users WHERE google_sub IS NOT NULL').all().filter((u) => emails.has(String(u.email).toLowerCase())).map((u) => u.device)
}
const PHOTO_CAP = Number(process.env.ROLE_PHOTO_CAP_MB ?? 5000) * 1_000_000 // teto de disco pras fotos (padrão 5 GB)
function removePhoto(id) {
  const p = db.prepare('SELECT request_id FROM photos WHERE id = ?').get(id)
  if (!p) return
  try { rmSync(join(DATA, 'photos', p.request_id, `${id}.jpg`), { force: true }) } catch { /* já foi */ }
  db.prepare('DELETE FROM photos WHERE id = ?').run(id)
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const SITE = (process.env.ROLE_SITE_URL ?? 'https://orleonbatista.github.io/role-mvp').replace(/\/$/, '')
/** página só de prévia (og:*) pra um pedido: título com as opções; quem abre vai direto pra votação no app */
export function ogPage(id, search = '') {
  const r = q.getReq.get(id)
  const d = r ? parse(r.data) ?? {} : {}
  const names = (d.places ?? []).map((p) => (Array.isArray(p) ? p[1] : null)).filter(Boolean).slice(0, 3)
  const title = r ? (names.length ? `Vota: ${names.join(', ')}` : 'Onde vai ser o rolê? Vota aqui') : 'rolê.'
  const desc = r ? `"${String(d.text ?? '').slice(0, 120)}" · vota em 10 segundos, sem instalar nada.` : 'Diga o que você quer. A IA sugere, sua turma vota.'
  const to = `${SITE}/v/?id=${encodeURIComponent(id)}${search ? '&' + search.slice(1) : ''}`
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta property="og:type" content="website"><meta property="og:site_name" content="rolê."><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:image" content="${SITE}/og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0;url=${esc(to)}"><script>location.replace(${JSON.stringify(to)}+location.hash)</script></head><body></body></html>`
}

/** guarda foto do lugar e pede a nota da IA em segundo plano (sem IA de visão: entra com nota neutra) */
function addPlacePhoto(placeId, source, device, buf) {
  if ((db.prepare('SELECT SUM(bytes) b FROM photos').get().b ?? 0) + (db.prepare('SELECT SUM(bytes) b FROM place_photos').get().b ?? 0) + buf.length > PHOTO_CAP) return null
  if (source === 'comunidade' && db.prepare("SELECT COUNT(*) n FROM place_photos WHERE place_id = ? AND source = 'comunidade'").get(placeId).n >= 30) return null
  const id = `pp-${randomBytes(6).toString('hex')}`
  const dir = join(DATA, 'placephotos', placeId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${id}.jpg`), buf)
  db.prepare('INSERT INTO place_photos (id, place_id, source, device, bytes, at) VALUES (?, ?, ?, ?, ?, ?)').run(id, placeId, source, device, buf.length, Date.now())
  Promise.resolve(hooks.scorePhoto ? hooks.scorePhoto(`data:image/jpeg;base64,${buf.toString('base64')}`) : null)
    .then((r) => {
      const score = r && Number.isFinite(Number(r.nota)) ? Math.max(0, Math.min(10, Number(r.nota))) : 5
      const okUse = r ? r.serve !== false && score >= 5 : true
      db.prepare('UPDATE place_photos SET score = ?, reason = ?, status = ? WHERE id = ?').run(score, r ? String(r.motivo ?? '').slice(0, 120) : 'sem avaliação da IA', okUse ? 'ok' : 'recusada', id)
    })
    .catch(() => db.prepare("UPDATE place_photos SET score = 5, reason = 'IA indisponível', status = 'ok' WHERE id = ?").run(id))
  return id
}
function removePlacePhoto(id) {
  const p = db.prepare('SELECT place_id FROM place_photos WHERE id = ?').get(id)
  if (!p) return
  try { rmSync(join(DATA, 'placephotos', p.place_id, `${id}.jpg`), { force: true }) } catch { /* já foi */ }
  db.prepare('DELETE FROM place_photos WHERE id = ?').run(id)
}
export function placePhotoFile(placeId, file) {
  if (!/^[A-Za-z0-9_-]{4,120}$/.test(placeId) || !/^pp-[a-f0-9]{12}\.jpg$/.test(file)) return null
  const f = join(DATA, 'placephotos', placeId, file)
  return existsSync(f) ? f : null
}

/** arquivo de uma foto (pro server.mjs servir em /media/); null se não existe */
export function photoFile(requestId, file) {
  if (!/^r-[a-z0-9-]{1,24}$/.test(requestId) || !/^ph-[a-f0-9]{12}\.jpg$/.test(file)) return null
  const f = join(DATA, 'photos', requestId, file)
  return existsSync(f) ? f : null
}

/* ---------- rede social: apoio ---------- */
// pseudo → aparelho (o apelido não se inverte; procura entre quem tem perfil, com cache)
const pseudoCache = new Map()
function deviceOfPseudo(p) {
  if (pseudoCache.has(p)) return pseudoCache.get(p)
  for (const u of db.prepare('SELECT device FROM users').all()) pseudoCache.set(pseudo(u.device), u.device)
  return pseudoCache.get(p) ?? null
}
const isBlocked = (owner, other) => !!db.prepare('SELECT 1 FROM blocks WHERE (device = ? AND blocked = ?) OR (device = ? AND blocked = ?)').get(owner, other, other, owner)
function relation(me, other) {
  const [a, b] = [me, other].sort()
  const r = db.prepare('SELECT status FROM friendships WHERE a = ? AND b = ?').get(a, b)
  if (!r) return 'nenhuma'
  if (r.status === 'amigos') return 'amigos'
  return r.status === `pedido:${me}` ? 'enviado' : 'recebido'
}
/** reputação só com o que é verificável: avaliação de rolê real, lugar indicado aceito, foto aprovada pela IA, rolê fechado */
function reputationOf(dev) {
  const reviews = db.prepare("SELECT COUNT(*) n FROM reviews WHERE device = ? AND status = 'ok'").get(dev).n
  const fromRole = db.prepare("SELECT COUNT(*) n FROM reviews WHERE device = ? AND status = 'ok' AND request_id IS NOT NULL").get(dev).n
  const photos = db.prepare("SELECT COUNT(*) n FROM place_photos WHERE device = ? AND status = 'ok'").get(dev).n
  const closed = db.prepare('SELECT COUNT(*) n FROM requests WHERE author_device = ? AND decided_place IS NOT NULL').get(dev).n
  const points = reviews * 10 + fromRole * 5 + photos * 3 + closed * 4
  const level = points >= 300 ? 'curador ouro' : points >= 120 ? 'curador prata' : points >= 40 ? 'curador bronze' : points > 0 ? 'iniciante' : 'novo'
  return { points, level, reviews, photos, closed }
}

/** quem participa de um pedido: autor + quem votou, marcou horário, confirmou presença ou mandou recado */
function participantsOf(requestId) {
  const r = q.getReq.get(requestId)
  const set = new Set(r ? [r.author_device] : [])
  for (const t of ['votes', 'slots', 'rsvps', 'messages', 'photos']) for (const x of db.prepare(`SELECT DISTINCT device FROM ${t} WHERE request_id = ?`).all(requestId)) set.add(x.device)
  return [...set]
}
/** prazos vencidos: avisa o autor uma vez pra fechar o rolê (chamado pelo server a cada poucos minutos) */
const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
/** "Sex 20h" | "Sáb 28/11 21h30" → quando o rolê acontece (mesma regra do app), no fuso de SP */
function slotAt(label, ref) {
  const hm = String(label ?? '').match(/(\d{1,2})h(\d{2})?/)
  if (!hm) return null
  const sp = (t) => new Date(new Date(t).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  const base = sp(ref)
  const dm = String(label).match(/(\d{1,2})\/(\d{1,2})/)
  let d
  if (dm) d = new Date(base.getFullYear(), Number(dm[2]) - 1, Number(dm[1]), Number(hm[1]), Number(hm[2] ?? 0))
  else {
    d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(hm[1]), Number(hm[2] ?? 0))
    const wd = DAYS.findIndex((x) => String(label).toLowerCase().startsWith(x))
    if (wd >= 0) { d.setDate(d.getDate() + ((wd - base.getDay() + 7) % 7)); if (d < base - 3 * 3600_000) d.setDate(d.getDate() + 7) }
  }
  return d.getTime() + (ref - base.getTime()) // volta pro relógio real
}

export function checkDeadlines() {
  const now = Date.now()
  // convite pra curadoria depois do rolê: 3 h depois do horário fechado (ou 24 h depois de fechar, sem horário), uma vez
  for (const r of db.prepare('SELECT id, data, decided_place, decided_time, decided_at FROM requests WHERE decided_place IS NOT NULL AND review_notified IS NULL AND decided_at > ?').all(now - 14 * 86_400_000)) {
    const at = slotAt(r.decided_time, r.decided_at) ?? r.decided_at + 21 * 3600_000
    if (now < at + 3 * 3600_000) continue
    db.prepare('UPDATE requests SET review_notified = ? WHERE id = ?').run(now, r.id)
    const d = parse(r.data) ?? {}
    const name = (d.places ?? []).find((x) => Array.isArray(x) && x[0] === r.decided_place)?.[1] ?? 'o rolê'
    const to = participantsOf(r.id).filter((dv) => !db.prepare('SELECT 1 FROM reviews WHERE device = ? AND request_id = ?').get(dv, r.id))
    notify({ to, key: `rev-${r.id}`, title: `Como foi no ${name}?`, body: 'Avalie em 10 segundos: vira curadoria e soma pontos no seu perfil', url: `avaliar/${r.id}` })
  }
  for (const r of db.prepare('SELECT id, author_device, data FROM requests WHERE closes_at IS NOT NULL AND closes_at <= ? AND decided_place IS NULL AND close_notified IS NULL').all(now)) {
    db.prepare('UPDATE requests SET close_notified = ? WHERE id = ?').run(now, r.id)
    notify({ to: [r.author_device], key: `close-${r.id}`, title: 'A votação do seu rolê encerrou', body: `Feche o rolê: "${(parse(r.data)?.text ?? '').slice(0, 80)}"`, url: `pedido/${r.id}` })
  }
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
export const hooks = { notify: null, scorePhoto: null }
export const pushSubsOf = (devices) => devices.length ? db.prepare(`SELECT endpoint, p256dh, auth, device FROM push_subs WHERE device IN (${devices.map(() => '?').join(',')})`).all(...devices).map((r) => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth }, device: r.device })) : []
export const dropPushSub = (endpoint) => db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(endpoint)
const placeNameIn = (r, placeId) => (parse(r.data)?.places ?? []).find((p) => p[0] === placeId)?.[1]
function notify(e) {
  try {
    const now = Date.now()
    const kind = String(e.key ?? '').replace(/-.*$/, '') || 'aviso'
    for (const d of new Set(e.to ?? [])) {
      // mesma chave em sequência (ex.: vários votos) atualiza a notificação em vez de empilhar
      const same = db.prepare('SELECT id FROM inbox WHERE device = ? AND ref = ? AND read = 0 AND at > ?').get(d, e.key ?? '', now - 3600_000)
      if (same) db.prepare('UPDATE inbox SET title = ?, body = ?, url = ?, at = ? WHERE id = ?').run(e.title, e.body ?? '', e.url ?? '', now, same.id)
      else db.prepare('INSERT INTO inbox (id, device, kind, title, body, url, ref, actor, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`nt-${randomBytes(6).toString('hex')}`, d, kind, e.title, e.body ?? '', e.url ?? '', e.key ?? '', e.from ? pseudo(e.from) : null, now)
    }
    db.prepare('DELETE FROM inbox WHERE at < ?').run(now - 60 * 86_400_000)
  } catch { /* caixa nunca derruba a API */ }
  try { hooks.notify?.(e) } catch { /* aviso nunca derruba a API */ }
}
const handleOf = (d) => { const h = db.prepare('SELECT handle FROM users WHERE device = ?').get(d)?.handle; return h ? `@${h}` : null }
const slugHandle = (h) => String(h ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^@/, '').replace(/[^a-z0-9_.]/g, '').slice(0, 20)
// quem se cadastrou antes do @ ganha um a partir do nome
for (const u of db.prepare('SELECT device, data FROM users WHERE handle IS NULL').all()) {
  const want = slugHandle(parse(u.data)?.handle || parse(u.data)?.name) || 'role'
  let h = want
  for (let i = 2; db.prepare('SELECT 1 FROM users WHERE handle = ?').get(h); i++) h = `${want}${i}`
  db.prepare('UPDATE users SET handle = ? WHERE device = ?').run(h, u.device)
}

function handlePeople(method, path, body, device, now) {
  let m
  if (method === 'GET' && path === '/api/me') {
    const u = qp.getUser.get(device)
    return u ? ok({ profile: { ...parse(u.data), handle: u.handle ? `@${u.handle}` : parse(u.data)?.handle }, consentAt: u.consent_at, email: u.email ?? undefined, role: roleOf(device) }) : bad('not_found', 404)
  }
  if (method === 'POST' && path === '/api/me') {
    const consentAt = int(body.consentAt, 0)
    if (!consentAt) return bad('consent')
    const p = cleanProfile(body)
    if (p.name.length < 2) return bad('profile')
    const ex = qp.getUser.get(device)
    qp.putUser.run(device, JSON.stringify(p), p.hood, p.home?.lat ?? null, p.home?.lng ?? null, consentAt, ex?.created_at ?? now, now)
    // @ único: mantém o que já tem; senão tenta o pedido e, se ocupado, acrescenta número
    let handle = ex?.handle ?? null
    if (!handle) {
      const want = slugHandle(p.handle || p.name) || 'role'
      handle = want
      for (let i = 2; db.prepare('SELECT 1 FROM users WHERE handle = ? AND device != ?').get(handle, device); i++) handle = `${want}${i}`
      db.prepare('UPDATE users SET handle = ? WHERE device = ?').run(handle, device)
    }
    return ok({ ok: true, handle: `@${handle}` })
  }
  // trocar o @ (único; 3 a 20 letras, números, ponto ou _)
  if (method === 'POST' && path === '/api/me/handle') {
    if (!qp.getUser.get(device)) return bad('perfil', 403)
    const h = slugHandle(body.handle)
    if (!/^[a-z0-9_.]{3,20}$/.test(h)) return ok({ ok: false, error: 'handle' })
    if (db.prepare('SELECT 1 FROM users WHERE handle = ? AND device != ?').get(h, device)) return ok({ ok: false, error: 'taken' })
    db.prepare('UPDATE users SET handle = ? WHERE device = ?').run(h, device)
    const u = qp.getUser.get(device); const d = parse(u.data) ?? {}; d.handle = `@${h}`
    db.prepare('UPDATE users SET data = ? WHERE device = ?').run(JSON.stringify(d), device)
    return ok({ ok: true, handle: `@${h}` })
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
      for (const t of ['slots', 'rsvps', 'push_subs', 'sessions', 'blocks', 'lists']) db.prepare(`DELETE FROM ${t} WHERE device = ?`).run(device)
      db.prepare('DELETE FROM friendships WHERE a = ? OR b = ?').run(device, device); db.prepare('DELETE FROM inbox WHERE device = ?').run(device); db.prepare("UPDATE group_messages SET name = 'Alguém' WHERE device = ?").run(device)
      db.prepare("UPDATE messages SET voter = 'Alguém' WHERE device = ?").run(device)
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
    return ok({ score, count: okRows.length, items: rows.map((r) => ({ id: r.id, name: r.name, hue: r.hue, verdict: r.verdict, note: r.note, at: r.at, mine: r.device === device, pending: r.status !== 'ok', pid: pseudo(r.device) })) })
  }
  if (method === 'GET' && path === '/api/ratings') {
    const acc = {}
    for (const r of qp.ratings.all()) { const a = (acc[r.place_id] ??= [0, 0]); a[0] += VERDICT_SCORE[r.verdict] * r.n; a[1] += r.n }
    return ok(Object.fromEntries(Object.entries(acc).map(([k, [sum, n]]) => [k, [Math.round((sum / n) * 10) / 10, n]])))
  }
  if (method === 'GET' && path === '/api/groups') return ok(qp.myGroups.all(device).map((g) => groupView(g, device)).filter((g) => g.members.length >= 2)) // turma de uma pessoa só não é turma
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

  // primeira sessão do aparelho (o app pede ao abrir); aparelho que já tem sessão precisa do token ou do login Google
  if (method === 'POST' && path === '/api/session/start') {
    if (!RE.device.test(device)) return bad('device')
    if (db.prepare('SELECT 1 FROM sessions WHERE device = ? LIMIT 1').get(device)) return bad('has_session', 409)
    return ok({ token: newSession(device) })
  }
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
    if (!isCurator(req)) return bad('admin', 401)
    return ok(q.reviewPlaces.all().map((r) => ({ place: parse(r.snap), comment: r.comment, status: r.status, motivo: r.motivo, at: r.at, uses: r.uses })))
  }
  if ((m = path.match(/^\/api\/places\/(g-[A-Za-z0-9_-]{5,120}|o-[nwr]\d{1,14})\/status$/)) && write) {
    if (!isCurator(req)) return bad('admin', 401)
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

  // votações de outras pessoas em que este aparelho (ou a conta Google dele) participou: segue a pessoa de celular em celular
  // meus pedidos (pra outro celular da mesma conta montar a lista)
  if (method === 'GET' && path === '/api/requests/mine') {
    return ok(db.prepare('SELECT id, created_at FROM requests WHERE author_device = ? ORDER BY created_at DESC LIMIT 50').all(device).map((r) => ({ id: r.id, createdAt: r.created_at })))
  }
  if (method === 'GET' && path === '/api/invites') {
    const ids = db.prepare(`SELECT DISTINCT request_id id FROM (
        SELECT request_id FROM votes WHERE device = ? UNION SELECT request_id FROM slots WHERE device = ?
        UNION SELECT request_id FROM rsvps WHERE device = ? UNION SELECT request_id FROM messages WHERE device = ?)`).all(device, device, device, device).map((x) => x.id)
    const out = []
    for (const id of ids) {
      const r = q.getReq.get(id)
      if (r && r.author_device !== device) out.push({ id, createdAt: r.created_at })
    }
    return ok(out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 30))
  }

  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})$/)) && method === 'GET') {
    const s = requestState(m[1], device)
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

  // vários horários por pessoa (disponibilidade): marca/desmarca um horário
  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})\/slots$/)) && write) {
    const r = q.getReq.get(m[1])
    if (!r) return bad('not_found', 404)
    const slot = str(body.slot, 40).trim()
    if (!slot) return bad('slot')
    if (body.on === false) db.prepare('DELETE FROM slots WHERE request_id = ? AND device = ? AND slot = ?').run(m[1], device, slot)
    else {
      if (db.prepare('SELECT COUNT(*) n FROM slots WHERE request_id = ? AND device = ?').get(m[1], device).n >= 12) return bad('too_many')
      db.prepare('INSERT OR REPLACE INTO slots (request_id, device, slot, voter, at) VALUES (?, ?, ?, ?, ?)').run(m[1], device, slot, str(body.voter, 40) || 'Alguém', now)
      joinGroupOf(m[1], device, body.voter, body.hue)
    }
    // compatibilidade: o voto de horário antigo (um por pessoa) sai, a disponibilidade manda
    db.prepare("DELETE FROM votes WHERE request_id = ? AND device = ? AND kind = 'time'").run(m[1], device)
    return ok({ ok: true })
  }
  // presença no rolê fechado
  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})\/rsvp$/)) && write) {
    const r = q.getReq.get(m[1])
    if (!r) return bad('not_found', 404)
    const status = ['vou', 'talvez', 'nao'].includes(body.status) ? body.status : null
    if (!status) return bad('status')
    const voter = str(body.voter, 40) || 'Alguém'
    db.prepare('INSERT OR REPLACE INTO rsvps (request_id, device, status, voter, at) VALUES (?, ?, ?, ?, ?)').run(m[1], device, status, voter, now)
    joinGroupOf(m[1], device, voter, body.hue)
    if (r.author_device !== device) notify({ to: [r.author_device], key: `rsvp-${m[1]}`, title: status === 'vou' ? `${voter} vai no rolê` : status === 'talvez' ? `${voter} talvez vá` : `${voter} não vai`, body: 'Veja quem confirmou', url: `r/${m[1]}` })
    return ok({ ok: true })
  }
  // recado pra turma toda (fica na votação e chega como aviso no celular de quem participou)
  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})\/messages$/)) && write) {
    const r = q.getReq.get(m[1])
    if (!r) return bad('not_found', 404)
    const text = str(body.text, 280).trim()
    if (!text) return bad('text')
    if (/https?:\/\/|www\.|\b\d{4,5}-?\d{4}\b/i.test(text)) return bad('link_ou_telefone')
    if (db.prepare('SELECT COUNT(*) n FROM messages WHERE request_id = ? AND device = ? AND at > ?').get(m[1], device, now - 60_000).n >= 5) return bad('rate_limited', 429)
    const voter = str(body.voter, 40) || 'Alguém'
    const id = `msg-${randomBytes(6).toString('hex')}`
    db.prepare('INSERT INTO messages (id, request_id, device, voter, text, at) VALUES (?, ?, ?, ?, ?, ?)').run(id, m[1], device, voter, text, now)
    notify({ to: participantsOf(m[1]).filter((d) => d !== device), key: `msg-${m[1]}`, title: `${voter} no rolê`, body: text.slice(0, 120), url: `r/${m[1]}` })
    return ok({ ok: true, id })
  }
  // fotos do rolê, guardadas no disco do servidor (data/photos/<pedido>/<foto>.jpg) e servidas em /media/
  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})\/photos$/)) && write) {
    const r = q.getReq.get(m[1])
    if (!r) return bad('not_found', 404)
    if (!participantsOf(m[1]).includes(device)) return bad('not_participant', 403)
    const buf = Buffer.from(String(body.data ?? '').replace(/^data:image\/jpeg;base64,/, ''), 'base64')
    if (buf.length < 2000 || buf.length > 1_600_000 || buf[0] !== 0xff || buf[1] !== 0xd8) return bad('photo')
    if (db.prepare('SELECT COUNT(*) n FROM photos WHERE request_id = ?').get(m[1]).n >= 40) return bad('too_many')
    if ((db.prepare('SELECT SUM(bytes) b FROM photos').get().b ?? 0) + buf.length > PHOTO_CAP) return bad('disk_full', 507)
    const id = `ph-${randomBytes(6).toString('hex')}`
    const dir = join(DATA, 'photos', m[1])
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, `${id}.jpg`), buf)
    const voter = str(body.voter, 40) || 'Alguém'
    db.prepare('INSERT INTO photos (id, request_id, device, voter, bytes, at) VALUES (?, ?, ?, ?, ?, ?)').run(id, m[1], device, voter, buf.length, now)
    // a pessoa autorizou mostrar na ficha do lugar escolhido: vira foto da comunidade (passa pela nota da IA)
    if (body.toPlace === true && r.decided_place) addPlacePhoto(r.decided_place, 'comunidade', device, buf)
    notify({ to: participantsOf(m[1]).filter((d) => d !== device), key: `ph-${m[1]}`, title: `${voter} pôs fotos do rolê`, body: 'Veja o álbum da turma', url: `r/${m[1]}` })
    return ok({ ok: true, id })
  }
  if ((m = path.match(/^\/api\/photos\/(ph-[a-f0-9]{12})\/delete$/)) && write) {
    const p = db.prepare('SELECT device FROM photos WHERE id = ?').get(m[1])
    if (!p) return bad('not_found', 404)
    if (p.device !== device && !isCurator(req)) return bad('not_owner', 403)
    removePhoto(m[1])
    return ok({ ok: true })
  }

  // fotos do lugar: a casa verificada envia (até 10); a lista pública só traz as aprovadas pela IA, melhores primeiro
  if ((m = path.match(/^\/api\/places\/([A-Za-z0-9_-]{4,120})\/photos$/)) && method === 'GET') {
    return ok(db.prepare("SELECT id, source, score FROM place_photos WHERE place_id = ? AND status = 'ok' AND id NOT IN (SELECT target_id FROM reports WHERE kind = 'placephoto' GROUP BY target_id HAVING COUNT(*) >= 3) ORDER BY source = 'casa' DESC, score DESC, at DESC LIMIT 12").all(m[1]))
  }
  if ((m = path.match(/^\/api\/places\/([A-Za-z0-9_-]{4,120})\/photos$/)) && write) {
    const v = db.prepare('SELECT owner_device, status FROM venues WHERE place_id = ?').get(m[1])
    if (!(v && v.status === 'verificada' && v.owner_device === device) && !isAdmin(req)) return bad('not_owner', 403)
    const buf = Buffer.from(String(body.data ?? '').replace(/^data:image\/jpeg;base64,/, ''), 'base64')
    if (buf.length < 2000 || buf.length > 1_600_000 || buf[0] !== 0xff || buf[1] !== 0xd8) return bad('photo')
    if (db.prepare("SELECT COUNT(*) n FROM place_photos WHERE place_id = ? AND source = 'casa'").get(m[1]).n >= 10) return bad('too_many')
    const id = addPlacePhoto(m[1], 'casa', device, buf)
    return id ? ok({ ok: true, id }) : bad('disk_full', 507)
  }
  if ((m = path.match(/^\/api\/place-photos\/(pp-[a-f0-9]{12})\/delete$/)) && write) {
    const p = db.prepare('SELECT place_id, device FROM place_photos WHERE id = ?').get(m[1])
    if (!p) return bad('not_found', 404)
    const v = db.prepare('SELECT owner_device FROM venues WHERE place_id = ?').get(p.place_id)
    if (p.device !== device && v?.owner_device !== device && !isCurator(req)) return bad('not_owner', 403)
    removePlacePhoto(m[1])
    return ok({ ok: true })
  }
  // fotos da casa na fila: dono vê as próprias com a nota e o motivo da IA
  if ((m = path.match(/^\/api\/places\/([A-Za-z0-9_-]{4,120})\/photos\/all$/)) && method === 'GET') {
    const v = db.prepare('SELECT owner_device FROM venues WHERE place_id = ?').get(m[1])
    if (v?.owner_device !== device && !isAdmin(req)) return bad('not_owner', 403)
    return ok(db.prepare('SELECT id, source, score, reason, status FROM place_photos WHERE place_id = ? ORDER BY at DESC').all(m[1]))
  }

  // prazo da votação (só o autor); quando vence, o autor recebe um aviso pra fechar
  if ((m = path.match(/^\/api\/requests\/(r-[a-z0-9-]{1,24})\/deadline$/)) && write) {
    const r = q.getReq.get(m[1])
    if (!r) return bad('not_found', 404)
    if (r.author_device !== device) return bad('not_author', 403)
    const at = body.closesAt == null ? null : int(body.closesAt, 0)
    if (at !== null && (at < now || at > now + 14 * 86_400_000)) return bad('closesAt')
    db.prepare('UPDATE requests SET closes_at = ?, close_notified = NULL WHERE id = ?').run(at, m[1])
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
    if (!isCurator(req)) return bad('admin', 401)
    return ok(q.subs.all().map((s) => ({ ...parse(s.data), id: s.id, status: s.status, at: s.at, reviewedAt: s.reviewed_at })))
  }
  if ((m = path.match(/^\/api\/submissions\/(ev-u-[a-z0-9-]{1,40})\/status$/)) && write) {
    if (!isCurator(req)) return bad('admin', 401)
    const status = ['aprovado', 'recusado', 'pendente'].includes(body.status) ? body.status : null
    if (!status) return bad('status')
    const upd = q.setSub.run(status, now, m[1])
    return upd.changes ? ok({ ok: true }) : bad('not_found', 404)
  }
  /* ---------- rede social ---------- */
  // abrir perfil pelo @
  if ((m = path.match(/^\/api\/people\/by-handle\/([A-Za-z0-9_.]{2,30})$/)) && method === 'GET') {
    const u = db.prepare('SELECT device FROM users WHERE handle = ?').get(slugHandle(m[1]))
    return u && !(device && isBlocked(device, u.device)) ? ok({ pid: pseudo(u.device) }) : bad('not_found', 404)
  }
  // caixa de notificações
  if (method === 'GET' && path === '/api/inbox') {
    if (!RE.device.test(device)) return bad('device')
    const items = db.prepare('SELECT id, kind, title, body, url, actor, at, read FROM inbox WHERE device = ? ORDER BY at DESC LIMIT 60').all(device)
    return ok({ unread: items.filter((x) => !x.read).length, items: items.map((x) => ({ ...x, read: !!x.read })) })
  }
  if (method === 'POST' && path === '/api/inbox/read') {
    if (body.id) db.prepare('UPDATE inbox SET read = 1 WHERE device = ? AND id = ?').run(device, str(body.id, 40))
    else db.prepare('UPDATE inbox SET read = 1 WHERE device = ?').run(device)
    return ok({ ok: true })
  }
  // busca de pessoas por nome (só quem tem cadastro; sem e-mail; bloqueados não aparecem)
  if (method === 'GET' && path === '/api/people') {
    const raw = (new URL(req.url, 'http://x').searchParams.get('q') ?? '').trim()
    const byAt = raw.startsWith('@')
    const q = normTxt(raw.replace(/^@/, '')).trim(), h = slugHandle(raw)
    if (q.length < 2) return ok([])
    const out = []
    // @ exato primeiro, depois começo do @, depois nome
    const rows = db.prepare('SELECT device, data, hood, handle FROM users WHERE consent_at > 0').all()
      .map((u) => ({ u, rank: u.handle === h ? 0 : (u.handle ?? '').startsWith(h) && h ? 1 : !byAt && normTxt(parse(u.data)?.name ?? '').includes(q) ? 2 : (u.handle ?? '').includes(h) && h ? 3 : 9 }))
      .filter((x) => x.rank < 9).sort((a, b) => a.rank - b.rank)
    for (const { u } of rows) {
      const p = parse(u.data) ?? {}
      if (u.device === device || (device && isBlocked(device, u.device))) continue
      const rep = reputationOf(u.device)
      out.push({ pid: pseudo(u.device), handle: u.handle ? `@${u.handle}` : null, name: p.name ?? 'Alguém', hue: p.hue ?? 200, hood: u.hood, reputation: rep, relation: device ? relation(device, u.device) : 'nenhuma' })
      if (out.length >= 20) break
    }
    return ok(out)
  }
  if ((m = path.match(/^\/api\/people\/(u-[a-f0-9]{16})$/)) && method === 'GET') {
    const dev = deviceOfPseudo(m[1])
    if (!dev || isBlocked(dev, device)) return bad('not_found', 404)
    const u = qp.getUser.get(dev)
    const p = parse(u?.data ?? 'null') ?? {}
    const rel = device ? relation(device, dev) : 'nenhuma'
    const friends = rel === 'amigos' || dev === device
    return ok({
      pid: m[1], handle: handleOf(dev), name: p.name ?? 'Alguém', hue: p.hue ?? 200, hood: u?.hood ?? null, niches: p.niches ?? [], me: dev === device, relation: rel,
      reputation: reputationOf(dev),
      reviews: db.prepare("SELECT place_id, verdict, note, place, at FROM reviews WHERE device = ? AND status = 'ok' ORDER BY at DESC LIMIT 12").all(dev)
        .map((r) => ({ placeId: r.place_id, verdict: r.verdict, note: r.note, name: parse(r.place ?? 'null')?.[1] ?? null, at: r.at })),
      lists: db.prepare('SELECT id, title, places, updated_at FROM lists WHERE device = ? AND (public = 1 OR ?) ORDER BY updated_at DESC').all(dev, friends ? 1 : 0)
        .map((l) => ({ id: l.id, title: l.title, places: parse(l.places) ?? [], updatedAt: l.updated_at })),
      friendsCount: db.prepare("SELECT COUNT(*) n FROM friendships WHERE (a = ? OR b = ?) AND status = 'amigos'").get(dev, dev).n,
    })
  }
  if ((m = path.match(/^\/api\/people\/(u-[a-f0-9]{16})\/(add|accept|remove|block|unblock)$/)) && write) {
    if (!qp.getUser.get(device)) return bad('perfil', 403) // precisa de cadastro pra fazer amizade
    const other = deviceOfPseudo(m[1])
    if (!other || other === device) return bad('not_found', 404)
    const [a, b] = [device, other].sort()
    const cur = db.prepare('SELECT status FROM friendships WHERE a = ? AND b = ?').get(a, b)
    if (m[2] === 'block') { db.prepare('INSERT OR REPLACE INTO blocks (device, blocked, at) VALUES (?, ?, ?)').run(device, other, now); db.prepare('DELETE FROM friendships WHERE a = ? AND b = ?').run(a, b); return ok({ ok: true }) }
    if (m[2] === 'unblock') { db.prepare('DELETE FROM blocks WHERE device = ? AND blocked = ?').run(device, other); return ok({ ok: true }) }
    if (m[2] === 'remove') { db.prepare('DELETE FROM friendships WHERE a = ? AND b = ?').run(a, b); return ok({ ok: true }) }
    if (isBlocked(other, device)) return bad('not_found', 404)
    if (m[2] === 'add') {
      if (cur) return ok({ ok: true, status: relation(device, other) })
      if (db.prepare("SELECT COUNT(*) n FROM friendships WHERE status LIKE 'pedido:%' AND status = ? AND at > ?").get(`pedido:${device}`, now - 86_400_000).n >= 30) return bad('rate_limited', 429)
      db.prepare('INSERT INTO friendships (a, b, status, at) VALUES (?, ?, ?, ?)').run(a, b, `pedido:${device}`, now)
      notify({ to: [other], from: device, key: `fr-${device}`, title: `${userName(device) ?? 'Alguém'} quer ser seu amigo no rolê`, body: 'Aceite pra ver as curadorias e os rolês um do outro', url: 'amigos' })
      return ok({ ok: true, status: 'enviado' })
    }
    if (m[2] === 'accept') {
      if (cur?.status !== `pedido:${other}`) return bad('sem_pedido', 409)
      db.prepare("UPDATE friendships SET status = 'amigos', at = ? WHERE a = ? AND b = ?").run(now, a, b)
      notify({ to: [other], from: device, key: `fra-${device}`, title: `${userName(device) ?? 'Alguém'} aceitou sua amizade`, body: 'Agora vocês veem as curadorias um do outro', url: 'amigos' })
      return ok({ ok: true })
    }
  }
  // amigos, pedidos recebidos e feed (avaliações, listas e rolês fechados dos amigos)
  if (method === 'GET' && path === '/api/social') {
    const rows = db.prepare('SELECT a, b, status, at FROM friendships WHERE a = ? OR b = ?').all(device, device)
    const card = (d) => { const p = parse(qp.getUser.get(d)?.data ?? 'null') ?? {}; return { pid: pseudo(d), handle: handleOf(d), name: p.name ?? 'Alguém', hue: p.hue ?? 200, reputation: reputationOf(d) } }
    const other = (r) => (r.a === device ? r.b : r.a)
    const friends = rows.filter((r) => r.status === 'amigos').map(other)
    const incoming = rows.filter((r) => r.status.startsWith('pedido:') && r.status !== `pedido:${device}`).map(other)
    const sent = rows.filter((r) => r.status === `pedido:${device}`).map(other)
    const feed = []
    if (friends.length) {
      const ph = friends.map(() => '?').join(',')
      for (const r of db.prepare(`SELECT device, place_id, verdict, note, place, at FROM reviews WHERE status = 'ok' AND device IN (${ph}) ORDER BY at DESC LIMIT 30`).all(...friends))
        feed.push({ kind: 'review', who: card(r.device), placeId: r.place_id, placeName: parse(r.place ?? 'null')?.[1] ?? null, verdict: r.verdict, note: r.note, at: r.at })
      for (const l of db.prepare(`SELECT id, device, title, places, updated_at FROM lists WHERE device IN (${ph}) ORDER BY updated_at DESC LIMIT 15`).all(...friends))
        feed.push({ kind: 'list', who: card(l.device), listId: l.id, title: l.title, count: (parse(l.places) ?? []).length, at: l.updated_at })
      for (const r of db.prepare(`SELECT author_device, decided_place, decided_at, data FROM requests WHERE decided_place IS NOT NULL AND author_device IN (${ph}) ORDER BY decided_at DESC LIMIT 15`).all(...friends)) {
        const d = parse(r.data) ?? {}
        const p = (d.places ?? []).find((x) => Array.isArray(x) && x[0] === r.decided_place)
        feed.push({ kind: 'decided', who: card(r.author_device), placeId: r.decided_place, placeName: p?.[1] ?? null, at: r.decided_at })
      }
    }
    return ok({ friends: friends.map(card), incoming: incoming.map(card), sent: sent.map(card), feed: feed.sort((x, y) => y.at - x.at).slice(0, 40) })
  }
  // listas de curadoria
  if (method === 'POST' && path === '/api/lists') {
    if (!qp.getUser.get(device)) return bad('perfil', 403)
    const title = str(body.title, 60).trim()
    if (!title) return bad('title')
    if (db.prepare('SELECT COUNT(*) n FROM lists WHERE device = ?').get(device).n >= 30) return bad('too_many')
    const id = `ls-${randomBytes(6).toString('hex')}`
    db.prepare('INSERT INTO lists (id, device, title, places, public, at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, device, title, '[]', body.public === false ? 0 : 1, now, now)
    return ok({ ok: true, id })
  }
  if (method === 'GET' && path === '/api/lists/mine') {
    return ok(db.prepare('SELECT id, title, places, public, updated_at FROM lists WHERE device = ? ORDER BY updated_at DESC').all(device).map((l) => ({ id: l.id, title: l.title, places: parse(l.places) ?? [], public: !!l.public, updatedAt: l.updated_at })))
  }
  if ((m = path.match(/^\/api\/lists\/(ls-[a-f0-9]{12})$/)) && method === 'GET') {
    const l = db.prepare('SELECT * FROM lists WHERE id = ?').get(m[1])
    if (!l || (!l.public && l.device !== device && relation(device, l.device) !== 'amigos')) return bad('not_found', 404)
    const p = parse(qp.getUser.get(l.device)?.data ?? 'null') ?? {}
    return ok({ id: l.id, title: l.title, places: parse(l.places) ?? [], public: !!l.public, mine: l.device === device, owner: { pid: pseudo(l.device), name: p.name ?? 'Alguém', hue: p.hue ?? 200 }, updatedAt: l.updated_at })
  }
  if ((m = path.match(/^\/api\/lists\/(ls-[a-f0-9]{12})\/(add|remove|delete)$/)) && write) {
    const l = db.prepare('SELECT * FROM lists WHERE id = ?').get(m[1])
    if (!l || l.device !== device) return bad('not_owner', 403)
    if (m[2] === 'delete') { db.prepare('DELETE FROM lists WHERE id = ?').run(m[1]); return ok({ ok: true }) }
    let places = parse(l.places) ?? []
    const sn = snap(body.place)
    const pid = sn?.[0] ?? str(body.placeId, 120)
    if (!pid) return bad('place')
    places = places.filter((x) => (Array.isArray(x) ? x[0] : x) !== pid)
    if (m[2] === 'add') places = [sn ?? pid, ...places].slice(0, 50)
    db.prepare('UPDATE lists SET places = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(places), now, m[1])
    return ok({ ok: true })
  }
  // ranking de curadores (geral ou por bairro)
  if (method === 'GET' && path === '/api/ranking') {
    const hood = str(new URL(req.url, 'http://x').searchParams.get('hood') ?? '', 40)
    const users = db.prepare('SELECT device, data, hood FROM users WHERE consent_at > 0' + (hood ? ' AND hood = ?' : '')).all(...(hood ? [hood] : []))
    const out = users.map((u) => { const p = parse(u.data) ?? {}; return { pid: pseudo(u.device), name: p.name ?? 'Alguém', hue: p.hue ?? 200, hood: u.hood, reputation: reputationOf(u.device), me: u.device === device } })
      .filter((x) => x.reputation.points > 0).sort((a, b) => b.reputation.points - a.reputation.points).slice(0, 30)
    return ok(out)
  }
  // chat da turma (contínuo, além dos recados de cada rolê)
  if ((m = path.match(/^\/api\/groups\/(t-[a-z0-9]{10})\/chat$/))) {
    if (!qp.member.get(m[1], device)) return bad('not_member', 403)
    if (method === 'GET') {
      const since = int(new URL(req.url, 'http://x').searchParams.get('since'), 0)
      return ok(db.prepare(`SELECT id, device, name, text, at FROM group_messages WHERE group_id = ? AND at > ? AND id NOT IN (SELECT target_id FROM reports WHERE kind = 'chat' GROUP BY target_id HAVING COUNT(*) >= 3) ORDER BY at DESC LIMIT 60`).all(m[1], since)
        .reverse().map((x) => ({ id: x.id, name: x.name, text: x.text, at: x.at, mine: x.device === device, pid: pseudo(x.device) })))
    }
    if (write) {
      const text = str(body.text, 500).trim()
      if (!text) return bad('text')
      if (db.prepare('SELECT COUNT(*) n FROM group_messages WHERE group_id = ? AND device = ? AND at > ?').get(m[1], device, now - 60_000).n >= 15) return bad('rate_limited', 429)
      const id = `gm-${randomBytes(6).toString('hex')}`
      const name = userName(device) ?? str(body.name, 40) ?? 'Alguém'
      db.prepare('INSERT INTO group_messages (id, group_id, device, name, text, at) VALUES (?, ?, ?, ?, ?, ?)').run(id, m[1], device, name, text, now)
      qp.touchGroup.run(now, m[1])
      const to = qp.members.all(m[1]).map((x) => x.device).filter((d) => d !== device && !isBlocked(d, device))
      notify({ to, key: `chat-${m[1]}`, title: `${name} na turma`, body: text.slice(0, 120), url: 'turmas' })
      return ok({ ok: true, id })
    }
  }

  /* ---------- página da casa (B2B) ---------- */
  const PID = /^[A-Za-z0-9_-]{4,120}$/
  // destaques e ofertas ativos (o app usa pra rotular "patrocinado" e mostrar a oferta pra grupos)
  if (method === 'GET' && path === '/api/venues/active') {
    const rows = db.prepare("SELECT place_id, data, sponsored_until FROM venues WHERE status = 'verificada'").all()
    return ok(rows.map((v) => { const d = parse(v.data) ?? {}; return { placeId: v.place_id, offer: d.offer || null, sponsored: (v.sponsored_until ?? 0) > now } })
      .filter((v) => v.offer || v.sponsored))
  }
  if ((m = path.match(/^\/api\/venues\/([A-Za-z0-9_-]{4,120})$/)) && method === 'GET') {
    const v = db.prepare('SELECT * FROM venues WHERE place_id = ?').get(m[1])
    if (!v) return ok({ status: 'livre' })
    const d = parse(v.data) ?? {}
    return ok({ status: v.status, mine: v.owner_device === device, bio: d.bio ?? '', instagram: d.instagram ?? '', groupMax: d.groupMax ?? null, offer: d.offer ?? '', sponsored: (v.sponsored_until ?? 0) > now })
  }
  // dono reivindica: vai pra fila do admin, que confirma ligando no telefone que o Google mostra
  if ((m = path.match(/^\/api\/venues\/([A-Za-z0-9_-]{4,120})\/claim$/)) && write) {
    const cur = db.prepare('SELECT status FROM venues WHERE place_id = ?').get(m[1])
    if (cur?.status === 'verificada') return bad('ja_verificada', 409)
    const claim = { name: str(body.name, 60), role: str(body.role, 40), contact: str(body.contact, 80), placeName: str(body.placeName, 80) }
    if (!claim.name || !claim.contact) return bad('claim')
    db.prepare(`INSERT INTO venues (place_id, owner_device, status, claim, at, updated_at) VALUES (?, ?, 'pendente', ?, ?, ?)
      ON CONFLICT(place_id) DO UPDATE SET owner_device = excluded.owner_device, status = 'pendente', claim = excluded.claim, updated_at = excluded.updated_at`).run(m[1], device, JSON.stringify(claim), now, now)
    notify({ to: adminDevices(), key: 'claim', title: 'Nova casa reivindicada', body: `${claim.placeName || m[1]} · ${claim.name}`, url: 'testes' })
    return ok({ ok: true })
  }
  // dono verificado edita a página e a oferta pra grupos
  if ((m = path.match(/^\/api\/venues\/([A-Za-z0-9_-]{4,120})$/)) && write) {
    const v = db.prepare('SELECT * FROM venues WHERE place_id = ?').get(m[1])
    if (!v || v.status !== 'verificada' || (v.owner_device !== device && !isAdmin(req))) return bad('not_owner', 403)
    const text = [body.bio, body.offer].map((x) => str(x, 300)).join(' ')
    if (/https?:\/\/|www\./i.test(text)) return bad('link')
    const d = { bio: str(body.bio, 300), instagram: str(body.instagram, 40).replace(/[^A-Za-z0-9._]/g, ''), groupMax: body.groupMax ? int(body.groupMax, 0) : null, offer: str(body.offer, 140) }
    db.prepare('UPDATE venues SET data = ?, updated_at = ? WHERE place_id = ?').run(JSON.stringify(d), now, m[1])
    return ok({ ok: true })
  }
  // relatório da casa (dono ou admin): últimos 30 dias
  if ((m = path.match(/^\/api\/venues\/([A-Za-z0-9_-]{4,120})\/report$/)) && method === 'GET') {
    const v = db.prepare('SELECT owner_device, status FROM venues WHERE place_id = ?').get(m[1])
    if (!isAdmin(req) && !(v && v.status === 'verificada' && v.owner_device === device)) return bad('not_owner', 403)
    const since = now - 30 * 86_400_000
    const like = `%"${m[1]}"%`
    return ok({
      views: db.prepare("SELECT COUNT(*) n FROM events WHERE name = 'screen' AND path = ? AND at >= ?").get(`/lugar/${m[1]}`, since).n,
      inRequests: db.prepare('SELECT COUNT(*) n FROM requests WHERE created_at >= ? AND data LIKE ?').get(since, like).n,
      votes: db.prepare("SELECT COUNT(*) n FROM votes WHERE kind = 'place' AND value = ? AND at >= ?").get(m[1], since).n,
      wins: db.prepare('SELECT COUNT(*) n FROM requests WHERE decided_place = ? AND decided_at >= ?').get(m[1], since).n,
      contacts: db.prepare("SELECT COUNT(*) n FROM events WHERE name = 'contact_casa' AND props LIKE ? AND at >= ?").get(like, since).n,
    })
  }
  if (method === 'GET' && path === '/api/venues/mine/list') {
    return ok(db.prepare("SELECT place_id, status, claim FROM venues WHERE owner_device = ?").all(device).map((v) => ({ placeId: v.place_id, status: v.status, name: parse(v.claim)?.placeName ?? v.place_id })))
  }
  if (method === 'GET' && path === '/api/admin/claims') {
    if (!isAdmin(req)) return bad('admin', 401)
    return ok(db.prepare("SELECT place_id, status, claim, sponsored_until, updated_at FROM venues ORDER BY status = 'pendente' DESC, updated_at DESC LIMIT 100").all()
      .map((v) => ({ placeId: v.place_id, status: v.status, claim: parse(v.claim), sponsoredUntil: v.sponsored_until ?? null, at: v.updated_at })))
  }
  if ((m = path.match(/^\/api\/admin\/claims\/([A-Za-z0-9_-]{4,120})$/)) && write) {
    if (!isAdmin(req)) return bad('admin', 401)
    const v = db.prepare('SELECT owner_device FROM venues WHERE place_id = ?').get(m[1])
    if (!v) return bad('not_found', 404)
    if (body.action === 'sponsor') {
      const days = Math.min(90, Math.max(0, int(body.days, 0)))
      db.prepare('UPDATE venues SET sponsored_until = ?, updated_at = ? WHERE place_id = ?').run(days ? now + days * 86_400_000 : null, now, m[1])
      return ok({ ok: true })
    }
    const status = body.action === 'approve' ? 'verificada' : 'recusada'
    db.prepare('UPDATE venues SET status = ?, updated_at = ? WHERE place_id = ?').run(status, now, m[1])
    if (v.owner_device) notify({ to: [v.owner_device], key: `claim-${m[1]}`, title: status === 'verificada' ? 'Sua casa foi verificada no rolê' : 'Não deu pra verificar sua casa', body: status === 'verificada' ? 'Já dá pra editar a página e criar oferta pra grupos' : 'Fale com a gente pra tentar de novo', url: `lugar/${m[1]}` })
    return ok({ ok: true })
  }

  // denúncia: qualquer pessoa denuncia avaliação, recado ou sugestão; com 3 denúncias de aparelhos diferentes some na hora
  // e vai pra fila da curadoria, que remove ou mantém
  if (method === 'POST' && path === '/api/reports') {
    if (!RE.device.test(device)) return bad('device')
    const kind = ['review', 'message', 'suggestion', 'photo', 'placephoto', 'chat'].includes(body.kind) ? body.kind : null
    const target = str(body.id, 60)
    if (!kind || !target) return bad('report')
    const reason = ['ofensivo', 'spam', 'falso', 'outro'].includes(body.reason) ? body.reason : 'outro'
    db.prepare('INSERT OR IGNORE INTO reports (id, kind, target_id, device, reason, at) VALUES (?, ?, ?, ?, ?, ?)').run(`rp-${randomBytes(6).toString('hex')}`, kind, target, device, reason, now)
    const n = db.prepare("SELECT COUNT(*) n FROM reports WHERE kind = ? AND target_id = ? AND status = 'aberta'").get(kind, target).n
    if (n >= 3 && kind === 'review') db.prepare("UPDATE reviews SET status = 'oculta', motivo = 'denúncias' WHERE id = ?").run(target)
    return ok({ ok: true })
  }
  if (method === 'GET' && path === '/api/admin/reports') {
    if (!isCurator(req)) return bad('admin', 401)
    const rows = db.prepare(`SELECT kind, target_id, COUNT(*) n, GROUP_CONCAT(reason) reasons, MAX(at) last FROM reports WHERE status = 'aberta' GROUP BY kind, target_id ORDER BY n DESC, last DESC LIMIT 50`).all()
    return ok(rows.map((r) => {
      const t = r.kind === 'review' ? db.prepare('SELECT name who, note text FROM reviews WHERE id = ?').get(r.target_id)
        : r.kind === 'message' ? db.prepare('SELECT voter who, text FROM messages WHERE id = ?').get(r.target_id)
        : r.kind === 'chat' ? db.prepare('SELECT name who, text FROM group_messages WHERE id = ?').get(r.target_id)
        : r.kind === 'placephoto' ? db.prepare("SELECT source who, 'p/' || place_id || '/' || id || '.jpg' text FROM place_photos WHERE id = ?").get(r.target_id)
        : r.kind === 'photo' ? db.prepare("SELECT voter who, request_id || '/' || id || '.jpg' text FROM photos WHERE id = ?").get(r.target_id)
        : db.prepare('SELECT by_name who, comment text FROM suggestions WHERE id = ?').get(r.target_id)
      return { kind: r.kind, id: r.target_id, count: r.n, reasons: [...new Set(String(r.reasons).split(','))], at: r.last, who: t?.who ?? '—', text: t?.text ?? '(já removido)' }
    }))
  }
  if ((m = path.match(/^\/api\/admin\/reports\/(review|message|suggestion|photo|placephoto|chat)\/([A-Za-z0-9_-]{1,60})$/)) && write) {
    if (!isCurator(req)) return bad('admin', 401)
    const [, kind, id] = m
    if (body.action === 'remove') {
      if (kind === 'review') db.prepare("UPDATE reviews SET status = 'removida', motivo = 'curadoria' WHERE id = ?").run(id)
      if (kind === 'message') db.prepare('DELETE FROM messages WHERE id = ?').run(id)
      if (kind === 'suggestion') db.prepare('DELETE FROM suggestions WHERE id = ?').run(id)
      if (kind === 'photo') removePhoto(id)
      if (kind === 'placephoto') removePlacePhoto(id)
      if (kind === 'chat') db.prepare('DELETE FROM group_messages WHERE id = ?').run(id)
    } else if (kind === 'review') db.prepare("UPDATE reviews SET status = 'ok', motivo = NULL WHERE id = ? AND status = 'oculta'").run(id)
    db.prepare("UPDATE reports SET status = ? WHERE kind = ? AND target_id = ?").run(body.action === 'remove' ? 'removida' : 'mantida', kind, id)
    return ok({ ok: true })
  }
  if (method === 'GET' && path === '/api/admin/check') {
    const role = keyOk(req) ? 'admin' : roleOf(devOf(req))
    return role === 'usuario' ? bad('admin', 401) : ok({ ok: true, role })
  }
  if (method === 'GET' && path === '/api/admin/users') {
    if (!isAdmin(req)) return bad('admin', 401)
    return ok(db.prepare('SELECT device, data, hood, email, role, google_sub, consent_at, created_at FROM users ORDER BY created_at DESC LIMIT 300').all()
      .map((u) => ({ device: u.device, name: parse(u.data)?.name ?? '', hood: u.hood, email: u.email ?? null, google: !!u.google_sub, role: roleOf(u.device), createdAt: u.created_at })))
  }
  if ((m = path.match(/^\/api\/admin\/users\/([a-z0-9-]{8,40})\/role$/)) && write) {
    if (!isAdmin(req)) return bad('admin', 401)
    const role = ['usuario', 'curador'].includes(body.role) ? body.role : null // admin só pela lista de e-mails
    if (!role) return bad('role')
    const u = db.prepare('SELECT google_sub FROM users WHERE device = ?').get(m[1])
    if (!u?.google_sub) return bad('sem_google') // papel só pra quem entrou com Google
    db.prepare('UPDATE users SET role = ? WHERE device = ?').run(role, m[1])
    return ok({ ok: true })
  }

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
