import type { Place } from '../lib/types'
import { fromSnap, snapOf, type PlaceSnap } from '../lib/places'
import { db } from '../db/db'
import { placeById, registerPlace } from './seeds/places'

/** registra um lugar do Google neste aparelho (catálogo em memória + resumo persistido) */
export async function rememberPlace(p: Place) {
  registerPlace({ ...p, curation: undefined })
  await db.gplaces.put({ id: p.id, snap: snapOf(p) }).catch(() => {})
}
/** resumos que chegaram de outro aparelho (link ou backend) */
export function adoptSnaps(snaps: unknown, max = 12): number {
  if (!Array.isArray(snaps)) return 0
  let n = 0
  for (const s of snaps.slice(0, max)) {
    const p = fromSnap(s)
    if (!p) continue
    const cur = placeById.get(p.id)
    if (!cur || (cur.curation === 'base' && p.curation !== 'base')) {
      registerPlace(p)
      // sem curadoria (Google ao vivo) fica só em memória; curado pela comunidade fica no aparelho
      if (p.curation !== 'base') void db.gplaces.put({ id: p.id, snap: s as PlaceSnap }).catch(() => {})
      n++
    }
  }
  return n
}
export async function loadGooglePlaces() {
  const all = await db.gplaces.toArray().catch(() => [])
  for (const r of all) { const p = fromSnap(r.snap); if (p) registerPlace(p) }
  // catálogo comunitário do backend (quando no ar): o que alguém já sugeriu aparece sem chamar o Google
  const remote = await import('./remote').then((m) => m.communityPlaces()).catch(() => null)
  if (remote) adoptSnaps(remote, 500)
}
/** resumos dos lugares do Google entre estes ids (para mandar junto no link / backend) */
/** resumos dos lugares da comunidade entre estes ids (o outro aparelho pode não tê-los) */
/** resumo dos lugares externos (Google) das opções: curados e também os sem curadoria (marcados 'b') */
export const snapsFor = (ids: string[], notes?: Map<string, string>) => ids.map((id) => placeById.get(id)).filter((p) => p && p.source).map((p) => snapOf(p!, notes?.get(p!.id)))
