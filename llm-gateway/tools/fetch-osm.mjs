// Gera public/base-sp.json: lugares reais do OpenStreetMap (licença ODbL — exige crédito "© colaboradores do
// OpenStreetMap") nos bairros que o app conhece. É a camada BASE: a IA usa como reserva e a busca de sugestões
// acha nomes reais sem gastar Google. O que aparece no feed é só o que a comunidade curou.
//   node llm-gateway/tools/fetch-osm.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOODS = {
  Pinheiros: [-23.5629, -46.6935], 'Vila Madalena': [-23.5535, -46.691], Centro: [-23.5455, -46.637],
  'Barra Funda': [-23.526, -46.666], Consolação: [-23.553, -46.66], Bixiga: [-23.559, -46.645],
  'Vila Mariana': [-23.589, -46.634], Itaim: [-23.584, -46.68], Mooca: [-23.558, -46.599],
  'Santa Cecília': [-23.539, -46.651], Liberdade: [-23.559, -46.634], 'Vila Prudente': [-23.583, -46.58],
}
const RADIUS = 1300 // metros em volta do centro do bairro

const around = Object.values(HOODS).map(([la, lo]) => `nwr(around:${RADIUS},${la},${lo})["amenity"~"^(bar|pub|nightclub|restaurant|biergarten)$"]["name"];`).join('')
const query = `[out:json][timeout:120];(${around});out tags center;`

// servidores públicos do Overpass costumam ficar sobrecarregados: tenta o principal e espelhos, com pausa
const SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']
let elements = null
for (let attempt = 0; attempt < 6 && !elements; attempt++) {
  const url = SERVERS[attempt % SERVERS.length]
  try {
    const r = await fetch(url, {
      method: 'POST', body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(150_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'role-mvp/0.1 (teste com amigos)' },
    })
    if (r.ok) elements = (await r.json()).elements
    else console.warn(`${url} -> ${r.status}, tentando de novo`)
  } catch (e) { console.warn(`${url} -> ${e.message}`) }
  if (!elements) await new Promise((res) => setTimeout(res, 5000))
}
if (!elements) throw new Error('Overpass indisponível — tente mais tarde')

const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 102)
const nearest = (p) => Object.entries(HOODS).map(([h, c]) => [h, dist(p, c)]).sort((x, y) => x[1] - y[1])[0][0]

function niches(t) {
  const name = (t.name ?? '').toLowerCase()
  const cuisine = (t.cuisine ?? '').toLowerCase()
  const out = new Set()
  if (t.amenity === 'nightclub') out.add('eletronica')
  if (t.amenity === 'restaurant') out.add('gastronomia')
  if (['bar', 'pub', 'biergarten'].includes(t.amenity)) out.add('drinks')
  if (t.amenity === 'pub' || t.amenity === 'biergarten' || /boteco|buteco|botequim|bar d[oa] |choperia|chopp|cervej/.test(name)) out.add('boteco')
  if (/jazz|blues/.test(name)) out.add('jazz')
  if (/vinil|vinyl|listening|hi-?fi|discos?\b/.test(name)) out.add('listening')
  if (t.amenity === 'biergarten' || /rooftop|terra[cç]o|laje|jardim|garden/.test(name)) out.add('ao-ar-livre')
  if (/brazilian|regional|portuguese/.test(cuisine) && /bar|boteco/.test(name)) out.add('boteco')
  return [...out].slice(0, 3)
}
const KIND = { nightclub: 'balada', restaurant: 'restaurante' }
const PRICE = { nightclub: 100, restaurant: 90, pub: 60, bar: 70, biergarten: 60 }

const seen = new Set()
const rows = []
for (const e of elements) {
  const t = e.tags ?? {}
  const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon
  if (!t.name || lat == null || seen.has(`${e.type}${e.id}`)) continue
  if (t.disused || t['disused:amenity'] || t.opening_hours === 'closed') continue
  seen.add(`${e.type}${e.id}`)
  // [id, nome, tipo, bairro, estilos, preço estimado, lat, lng, culinária, horário OSM]
  rows.push([`o-${e.type[0]}${e.id}`, t.name.trim().slice(0, 80), KIND[t.amenity] ?? 'bar', nearest([lat, lng]), niches(t), PRICE[t.amenity] ?? 70,
    Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, (t.cuisine ?? '').slice(0, 40), (t.opening_hours ?? '').slice(0, 80)])
}
rows.sort((a, b) => a[3].localeCompare(b[3]) || a[1].localeCompare(b[1]))

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'base-sp.json')
writeFileSync(out, JSON.stringify({ source: '© colaboradores do OpenStreetMap (ODbL)', at: new Date().toISOString().slice(0, 10), rows }))
const by = {}
for (const r of rows) by[r[3]] = (by[r[3]] ?? 0) + 1
console.log(rows.length, 'lugares', JSON.stringify(by))
