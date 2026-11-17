import type { Answer, Person, RoleRequest, Vote } from '../../lib/types'
import { parseRequest, timeOptions } from '../ranker'

export const people: Person[] = [
  { id: 'u-bia', name: 'Bia Santos', handle: '@biasons', hue: 330, curatorOf: ['listening', 'jazz'], reputation: 842, bio: 'coleciono vinil e opiniões' },
  { id: 'u-caio', name: 'Caio Ramos', handle: '@caiotechno', hue: 150, curatorOf: ['eletronica'], reputation: 1210, bio: 'só saio se tiver kick' },
  { id: 'u-duda', name: 'Duda Lima', handle: '@dudacome', hue: 20, curatorOf: ['gastronomia', 'boteco'], reputation: 990, bio: 'como por profissão e por amor' },
  { id: 'u-leo', name: 'Léo Prado', handle: '@leoboteco', hue: 45, curatorOf: ['boteco'], reputation: 760, bio: 'torresmo é patrimônio' },
  { id: 'u-mari', name: 'Mari Okada', handle: '@marioka', hue: 280, curatorOf: ['drinks', 'gastronomia'], reputation: 1105, bio: 'bartender nas horas vagas' },
  { id: 'u-rafa', name: 'Rafa Nunes', handle: '@rafanunes', hue: 200, curatorOf: ['ao-ar-livre', 'drinks'], reputation: 540, bio: 'rolê bom é rolê com céu' },
  { id: 'u-tati', name: 'Tati Moura', handle: '@tatimoura', hue: 0, curatorOf: ['jazz', 'drinks'], reputation: 670, bio: 'sax > tudo' },
  { id: 'u-gui', name: 'Gui Ferraz', handle: '@guiferraz', hue: 100, curatorOf: ['eletronica', 'ao-ar-livre'], reputation: 455, bio: 'day party é estilo de vida' },
  { id: 'u-nina', name: 'Nina Alves', handle: '@ninaalves', hue: 250, curatorOf: ['listening', 'drinks'], reputation: 610, bio: 'som baixo, papo alto' },
  { id: 'u-joao', name: 'João Pedro', handle: '@jpzl', hue: 60, curatorOf: ['boteco', 'eletronica'], reputation: 380, bio: 'zona leste representa' },
]

const H = 3600_000
const now = Date.now()

const seedReq: [id: string, author: string, text: string, hoursAgo: number][] = [
  ['r-1', 'u-nina', 'Aniversário pra 14 pessoas sábado em Pinheiros, algo animado mas que dê pra conversar, até R$ 90', 2],
  ['r-2', 'u-joao', 'Listening bar tranquilo pra um date na quinta, som bom e drink autoral', 5],
  ['r-3', 'u-rafa', 'Quero comer acepipes com chopp gelado, boteco raiz, 6 amigos', 9],
  ['r-4', 'u-tati', 'Balada de eletrônica underground pra ir sozinha, techno de verdade', 20],
  ['r-5', 'u-gui', 'Happy hour da firma pra 25 pessoas, perto da Paulista, até R$ 120', 26],
  ['r-6', 'u-bia', 'Jazz ao vivo intimista pra levar meus pais', 40],
  ['r-7', 'u-leo', 'Esquenta ao ar livre domingo à tarde com a galera, barato', 52],
]

export const seedRequests: RoleRequest[] = seedReq.map(([id, authorId, text, h]) => ({
  id, authorId, text, criteria: parseRequest(text), createdAt: now - h * H, status: 'aberto',
  times: timeOptions(parseRequest(text)),
}))

const seedAns: [req: string, user: string, place: string, comment: string, helpful: number][] = [
  ['r-1', 'u-duda', 'acepipe-bar', 'Fiz meu niver no salão dos fundos: cabe todo mundo e a música não atrapalha a conversa.', 12],
  ['r-1', 'u-mari', 'agulha-vinil', 'Se o grupo curte som bom, o mezanino da Agulha é perfeito. Reserva com uma semana.', 8],
  ['r-1', 'u-caio', 'lume', 'Quer esticar? Começa no Acepipe e termina no camarote do Lume.', 5],
  ['r-2', 'u-bia', 'sala-grave', 'Sala Grave. Ponto. Pede o drink de jabuticaba e senta perto das caixas.', 21],
  ['r-2', 'u-nina', 'disco-lento', 'Disco Lento numa quinta é mágico: balcão pequeno, DJ conversa com você.', 14],
  ['r-3', 'u-leo', 'seu-tiao', 'Torresmo de rolo do Seu Tião não tem igual. Chega antes das 19h.', 18],
  ['r-3', 'u-duda', 'copo-lagoinha', 'Copo Lagoinha: tábua de acepipes de vó e cachaça rara. Mooca raiz.', 11],
  ['r-4', 'u-caio', 'subsolo-404', 'Subsolo 404. Celular fora da pista, gente que vai pra dançar. Seguro pra ir só.', 25],
  ['r-4', 'u-gui', 'galpao-norte', 'Galpão Norte se quiser techno pesado até o sol nascer.', 9],
  ['r-5', 'u-mari', 'terraco-ambar', 'Terraço Âmbar reserva área pra 30 e o pôr do sol fecha o happy hour.', 13],
  ['r-6', 'u-tati', 'porao-do-sax', 'Porão do Sax: pais amam, couvert justo, jam aberta às quartas.', 16],
  ['r-6', 'u-bia', 'nota-azul', 'Se quiser algo mais elegante, Nota Azul com mesa numerada.', 7],
  ['r-7', 'u-rafa', 'praca-viva', 'Praça Viva: entrada grátis até 15h e food truck. Esquenta perfeito.', 10],
  ['r-7', 'u-leo', 'quintal-amarelo', 'Quintal Amarelo é barato, cabe a galera e aceita cachorro.', 6],
]

export const seedAnswers: Answer[] = seedAns.map(([requestId, userId, placeId, comment, helpful], i) => {
  const r = seedRequests.find((x) => x.id === requestId)!
  const t = r.createdAt + (i + 1) * 9 * 60_000
  return { id: `a-seed-${i}`, requestId, userId, placeId, comment, helpful, createdAt: t, visibleAt: t }
})

/** atividade nos pedidos de exemplo, para o feed não parecer parado */
const VOTERS = ['Ana', 'Beto', 'Carla', 'Diego', 'Elis', 'Fábio', 'Gabi']
export const seedVotes: Vote[] = seedRequests.flatMap((r, ri) => {
  const opts = seedAnswers.filter((a) => a.requestId === r.id).map((a) => a.placeId)
  if (!opts.length) return []
  const n = 2 + ((ri * 3) % 5)
  return VOTERS.slice(0, n).map((voter, i) => ({
    id: `v-seed-${r.id}-${i}`, requestId: r.id, kind: 'place' as const,
    placeId: opts[i % 3 === 2 && opts[1] ? 1 : 0], voter, createdAt: r.createdAt + (i + 2) * 600_000,
  }))
})
