// Geocodificação da região de quem se cadastra: CEP (BrasilAPI/ViaCEP) e coordenada → bairro (Nominatim/OSM,
// 1 req/s com User-Agent). A descoberta de lugares é toda no Google (no app); nada de OpenStreetMap aqui.
const UA = 'role-mvp/0.1 (teste com amigos)'

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
