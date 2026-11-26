// Gera public/base-sp.json: lugares reais do OpenStreetMap (licença ODbL — exige crédito "© colaboradores do
// OpenStreetMap") nos bairros que o app conhece. É a camada BASE: a IA usa como reserva e a busca de sugestões
// acha nomes reais sem gastar Google. O que aparece no feed é só o que a comunidade curou.
//   node llm-gateway/tools/fetch-osm.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { HOODS, aroundQuery, distKm, overpass, toRows } from '../osm.mjs'

const RADIUS = 1300 // metros em volta do centro do bairro
const elements = await overpass(aroundQuery(Object.values(HOODS), RADIUS), { timeout: 150_000 })
const nearest = (p) => Object.entries(HOODS).map(([h, c]) => [h, distKm(p, c)]).sort((x, y) => x[1] - y[1])[0][0]
const rows = toRows(elements, nearest)
rows.sort((a, b) => a[3].localeCompare(b[3]) || a[1].localeCompare(b[1]))

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'base-sp.json')
writeFileSync(out, JSON.stringify({ source: '© colaboradores do OpenStreetMap (ODbL)', at: new Date().toISOString().slice(0, 10), rows }))
const by = {}
for (const r of rows) by[r[3]] = (by[r[3]] ?? 0) + 1
console.log(rows.length, 'lugares', JSON.stringify(by))
