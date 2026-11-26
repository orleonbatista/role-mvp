import { useEffect } from 'react'
import type { Home, Place } from '../lib/types'
import { track } from '../lib/track'

/* Mapa estático (Maps Static API: 10 mil grátis/mês) com as opções numeradas e a região de quem pediu.
   Uma imagem só, sem script do Google Maps; tocar abre a 1ª opção no Maps. */
const KEY = import.meta.env.VITE_PLACES_KEY as string | undefined
const STYLE = [
  'element:geometry|color:0x1d1f22', 'element:labels.text.fill|color:0x9aa0a6', 'element:labels.text.stroke|color:0x111214',
  'feature:road|element:geometry|color:0x2c2f33', 'feature:water|element:geometry|color:0x0e2433', 'feature:poi|visibility:off', 'feature:transit|visibility:off',
].map((s) => `style=${encodeURIComponent(s)}`).join('&')

export function OptionsMap({ places, home }: { places: Place[]; home?: Pick<Home, 'lat' | 'lng'> }) {
  const pts = places.filter((p) => p.lat != null && p.lng != null).slice(0, 6)
  const show = !!KEY && pts.length >= 2
  useEffect(() => { if (show) track('google_call', { sku: 'static_map' }) }, [show])
  if (!show) return null
  const marks = pts.map((p) => `markers=${encodeURIComponent(`color:0xc6ff3d|label:${places.indexOf(p) + 1}|${p.lat!.toFixed(5)},${p.lng!.toFixed(5)}`)}`).join('&')
  const me = home ? `&markers=${encodeURIComponent(`size:small|color:0x7c5cff|${home.lat},${home.lng}`)}` : ''
  const src = `https://maps.googleapis.com/maps/api/staticmap?size=600x260&scale=2&language=pt-BR&${STYLE}&${marks}${me}&key=${KEY}`
  return (
    <a href={pts[0].mapsUrl} target="_blank" rel="noreferrer" className="mx-5 mt-4 block overflow-hidden rounded-[22px] border border-line">
      <img src={src} alt={`Mapa com ${pts.length} opções numeradas${home ? ' e a sua região' : ''}`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="h-[150px] w-full object-cover" />
      <p className="flex items-center justify-between bg-surface px-3 py-2 text-[11px] text-faint">
        <span>Números = opções{home ? ' · roxo = sua região' : ''}</span><span>Google Maps</span>
      </p>
    </a>
  )
}
