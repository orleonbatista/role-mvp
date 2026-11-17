import type { Place } from '../lib/types'
import { fromSnap, snapOf, type PlaceSnap } from '../lib/places'
import { db } from '../db/db'
import { placeById, registerPlace } from './seeds/places'

/** registra um lugar do Google neste aparelho (catálogo em memória + resumo persistido) */
export async function rememberPlace(p: Place) {
  if (!placeById.has(p.id)) registerPlace(p)
  await db.gplaces.put({ id: p.id, snap: snapOf(p) }).catch(() => {})
}
/** resumos que chegaram de outro aparelho (link ou backend) */
export function adoptSnaps(snaps: unknown): number {
  if (!Array.isArray(snaps)) return 0
  let n = 0
  for (const s of snaps.slice(0, 12)) {
    const p = fromSnap(s)
    if (p && !placeById.has(p.id)) { registerPlace(p); void db.gplaces.put({ id: p.id, snap: s as PlaceSnap }).catch(() => {}); n++ }
  }
  return n
}
export async function loadGooglePlaces() {
  const all = await db.gplaces.toArray().catch(() => [])
  for (const r of all) { const p = fromSnap(r.snap); if (p && !placeById.has(p.id)) registerPlace(p) }
}
/** resumos dos lugares do Google entre estes ids (para mandar junto no link / backend) */
export const snapsFor = (ids: string[]) => ids.filter((id) => id.startsWith('g-')).map((id) => placeById.get(id)).filter(Boolean).map((p) => snapOf(p!))
