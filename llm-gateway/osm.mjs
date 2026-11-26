// Lugares reais do OpenStreetMap (ODbL: exige crédito "© colaboradores do OpenStreetMap") a partir do Overpass.
// Usado pelo script da base estática (tools/fetch-osm.mjs) e pela carga regional do backend (quando alguém se
// cadastra em uma região que a base ainda não cobre).

export const HOODS = {
  Pinheiros: [-23.5629, -46.6935], 'Vila Madalena': [-23.5535, -46.691], Centro: [-23.5455, -46.637],
  'Barra Funda': [-23.526, -46.666], Consolação: [-23.553, -46.66], Bixiga: [-23.559, -46.645],
  'Vila Mariana': [-23.589, -46.634], Itaim: [-23.584, -46.68], Mooca: [-23.558, -46.599],
  'Santa Cecília': [-23.539, -46.651], Liberdade: [-23.559, -46.634], 'Vila Prudente': [-23.583, -46.58],
}
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
const UA = 'role-mvp/0.1 (teste com amigos)'

export const aroundQuery = (centers, radius) =>
  `[out:json][timeout:90];(${centers.map(([la, lo]) => `nwr(around:${radius},${la},${lo})["amenity"~"^(bar|pub|nightclub|restaurant|biergarten)$"]["name"];`).join('')});out tags center;`

/** consulta o Overpass com espelhos e novas tentativas (servidores públicos vivem sobrecarregados) */
export async function overpass(query, { attempts = 6, timeout = 120_000 } = {}) {
  for (let a = 0; a < attempts; a++) {
    const url = SERVERS[a % SERVERS.length]
    try {
      const r = await fetch(url, {
        method: 'POST', body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(timeout),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      })
      if (r.ok) return (await r.json()).elements ?? []
      console.warn(`overpass ${url} -> ${r.status}`)
    } catch (e) { console.warn(`overpass ${url} -> ${e.message}`) }
    await new Promise((res) => setTimeout(res, 3000))
  }
  throw new Error('overpass_indisponivel')
}

export const distKm = (a, b) => Math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 102)

function niches(t) {
  const name = (t.name ?? '').toLowerCase()
  const cuisine = (t.cuisine ?? '').toLowerCase()
  const out = new Set()
  if (t.amenity === 'nightclub') out.add('eletronica')
  if (t.amenity === 'restaurant') out.add('gastronomia')
  if (['bar', 'pub', 'biergarten'].includes(t.amenity)) out.add('drinks')
  if (t.amenity === 'pub' || t.amenity === 'biergarten' || /boteco|buteco|botequim|bar d[oa] |choperia|chopp|cervej/.test(name)) out.add('boteco')
  if (/jazz|blues/.test(name) || t['live_music'] === 'yes') out.add('jazz')
  if (/vinil|vinyl|listening|hi-?fi|discos?\b/.test(name)) out.add('listening')
  if (t.amenity === 'biergarten' || t.outdoor_seating === 'yes' || /rooftop|terra[cç]o|laje|jardim|garden/.test(name)) out.add('ao-ar-livre')
  if (/brazilian|regional|portuguese/.test(cuisine) && /bar|boteco/.test(name)) out.add('boteco')
  return [...out].slice(0, 3)
}
const KIND = { nightclub: 'balada', restaurant: 'restaurante' }
const PRICE = { nightclub: 100, restaurant: 90, pub: 60, bar: 70, biergarten: 60 }

/** elementos do Overpass → linhas [id, nome, tipo, bairro, estilos, preço, lat, lng, culinária, horário OSM].
 *  hoodOf([lat,lng]) decide o bairro. */
export function toRows(elements, hoodOf) {
  const seen = new Set()
  const rows = []
  for (const e of elements) {
    const t = e.tags ?? {}
    const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon
    if (!t.name || lat == null || seen.has(`${e.type}${e.id}`)) continue
    if (t.disused || t['disused:amenity'] || t.opening_hours === 'closed') continue
    seen.add(`${e.type}${e.id}`)
    rows.push([`o-${e.type[0]}${e.id}`, t.name.trim().slice(0, 80), KIND[t.amenity] ?? 'bar', hoodOf([lat, lng]), niches(t), PRICE[t.amenity] ?? 70,
      Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, (t.cuisine ?? '').slice(0, 40), (t.opening_hours ?? '').slice(0, 80)])
  }
  return rows
}

/** bairro: o conhecido mais perto (até 1,8 km); senão o nome da região de quem se cadastrou */
export const hoodNear = (p, fallback) => {
  const [h, d] = Object.entries(HOODS).map(([h, c]) => [h, distKm(p, c)]).sort((x, y) => x[1] - y[1])[0]
  return d <= 1.8 ? h : fallback
}

/* ---------- geocodificação (CEP e localização → região) ---------- */
const nominatimQueue = { last: 0 }
async function nominatim(path) {
  // política do Nominatim: 1 req/s e User-Agent identificado
  const wait = Math.max(0, nominatimQueue.last + 1100 - Date.now())
  nominatimQueue.last = Date.now() + wait
  await new Promise((r) => setTimeout(r, wait))
  const r = await fetch(`https://nominatim.openstreetmap.org/${path}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR' }, signal: AbortSignal.timeout(10_000) })
  if (!r.ok) throw new Error(`nominatim ${r.status}`)
  return r.json()
}
const geoCache = new Map()
const round2 = (x) => Math.round(x * 100) / 100 // ~1 km: não guardamos o endereço exato de ninguém

/** CEP → { lat, lng, label } (BrasilAPI, depois ViaCEP + Nominatim) */
export async function geoFromCep(cep) {
  if (geoCache.has(cep)) return geoCache.get(cep)
  let street = '', hood = '', city = '', uf = '', lat, lng
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`, { signal: AbortSignal.timeout(8000) })
    if (r.ok) {
      const j = await r.json()
      street = j.street ?? ''; hood = j.neighborhood ?? ''; city = j.city ?? ''; uf = j.state ?? ''
      const c = j.location?.coordinates
      if (c?.latitude && c?.longitude) { lat = Number(c.latitude); lng = Number(c.longitude) }
    }
  } catch { /* tenta o ViaCEP */ }
  if (!city) {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8000) })
    const j = r.ok ? await r.json() : {}
    if (j.erro || !j.localidade) return null
    street = j.logradouro ?? ''; hood = j.bairro ?? ''; city = j.localidade; uf = j.uf ?? ''
  }
  // a BrasilAPI muitas vezes devolve o centro da cidade: a rua (busca estruturada no Nominatim) vem primeiro,
  // depois o bairro, depois a coordenada da BrasilAPI
  const enc = encodeURIComponent
  const tries = [
    street && `street=${enc(street)}&city=${enc(city)}&state=${enc(uf)}`,
    hood && `q=${enc(`${hood}, ${city}, ${uf}, Brasil`)}`,
  ].filter(Boolean)
  let found = false
  for (const t of tries) {
    const j = await nominatim(`search?format=json&limit=1&countrycodes=br&${t}`)
    if (j[0]) { lat = Number(j[0].lat); lng = Number(j[0].lon); found = true; break }
  }
  if (!found && (lat == null || !Number.isFinite(lat))) {
    const j = await nominatim(`search?format=json&limit=1&countrycodes=br&q=${enc(`${city}, ${uf}, Brasil`)}`)
    if (j[0]) { lat = Number(j[0].lat); lng = Number(j[0].lon) }
  }
  if (lat == null) return null
  const out = { lat: round2(lat), lng: round2(lng), label: (hood || city).slice(0, 40), city: city.slice(0, 40) }
  geoCache.set(cep, out)
  return out
}

/** coordenada (do GPS, já arredondada) → nome da região */
export async function geoReverse(lat, lng) {
  const k = `${round2(lat)},${round2(lng)}`
  if (geoCache.has(k)) return geoCache.get(k)
  const j = await nominatim(`reverse?format=json&zoom=14&lat=${round2(lat)}&lon=${round2(lng)}`)
  const a = j.address ?? {}
  const label = a.suburb || a.neighbourhood || a.city_district || a.quarter || a.town || a.city || 'Minha região'
  const out = { lat: round2(lat), lng: round2(lng), label: String(label).slice(0, 40), city: String(a.city ?? a.town ?? '').slice(0, 40) }
  geoCache.set(k, out)
  return out
}
