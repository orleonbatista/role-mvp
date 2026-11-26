export type Niche = 'listening' | 'eletronica' | 'boteco' | 'gastronomia' | 'drinks' | 'jazz' | 'ao-ar-livre'
export type Vibe = 'tranquilo' | 'animado' | 'intimista' | 'underground' | 'descolado' | 'raiz' | 'sofisticado'
export type Occasion = 'aniversario' | 'date' | 'amigos' | 'solo' | 'trabalho' | 'esquenta'
export type PlaceKind = 'bar' | 'restaurante' | 'balada' | 'evento'
/** atributos pontuais que o usuário pode pedir ("vegano", "samba", "pet") */
export type Tag = 'vegano' | 'samba' | 'pet' | 'acessivel' | 'karaoke' | 'funk' | 'sertanejo' | 'open-bar'

/** 0 = domingo … 6 = sábado; horas podem passar de 24 (ex.: 26 = 2h da madrugada seguinte) */
export interface OpenPeriod { days: number[]; open: number; close: number }

/** quando o rolê acontece, extraído do texto */
export interface When { day?: number; hour?: number; label: string }

export interface Place {
  id: string
  name: string
  kind: PlaceKind
  hood: string
  niches: Niche[]
  vibes: Vibe[]
  occasions: Occasion[]
  /** média por pessoa, R$ */
  price: number
  /** maior grupo que a casa acomoda bem */
  capacity: number
  /** nota da comunidade 0–10 */
  rating: number
  ratingCount: number
  hue: number
  tagline: string
  description: string
  highlights: string[]
  address: string
  hours: string
  when?: string
  tags: Tag[]
  /** tem área/sala/mesa reservável para grupo */
  privateSpace: boolean
  periods: OpenPeriod[]
  /** eventos enviados pela comunidade */
  promoter?: string
  ticketUrl?: string
  eventDate?: string
  /** confirmado ao vivo no Google pra este pedido (só em memória, nunca salvo) */
  live?: { rating?: number; count?: number; outdoor?: boolean; beer?: boolean; groups?: boolean; music?: boolean; cocktails?: boolean; hours?: boolean }
  /** origem externa: Google (só place_id) ou OpenStreetMap (catálogo legado); sem isso = catálogo próprio/evento */
  source?: 'google' | 'osm'
  /** 'base' = lugar real ainda sem curadoria (a IA usa como reserva, não aparece no feed) */
  curation?: 'base'
  mapsUrl?: string
  lat?: number
  lng?: number
}

export interface Person {
  id: string
  name: string
  handle: string
  hue: number
  curatorOf: Niche[]
  reputation: number
  bio?: string
}

export interface Profile extends Person {
  id: 'me'
  hood: string
  niches: Niche[]
  vibes: Vibe[]
  onboarded: boolean
  /** região de quem usa (GPS ou CEP), arredondada a ~1 km; nunca o endereço exato */
  home?: Home
  /** aceitou o aviso de privacidade (LGPD): só então o perfil vai pro banco */
  consentAt?: number
  /** conta Google ligada (e-mail só pra mostrar no Perfil) */
  email?: string
  /** simula curadores e amigos votando; desligar para testes com pessoas reais */
  demoMode: boolean
}

export interface Criteria {
  occasion?: Occasion
  groupSize: number
  budget?: number
  hood?: string
  /** distância máxima de quem pede ("até 8 km", "perto de mim" = 5 km) */
  maxKm?: number
  niches: Niche[]
  vibes: Vibe[]
  tags: Tag[]
  when?: When
  /** termos pedidos que o catálogo não cobre (ex.: "funk") */
  unmet: string[]
  /** quem extraiu os critérios: só regras, ou regras + LLM local */
  source?: { engine: 'regras' | 'llm'; model?: string; ms?: number; via?: string }
}

export interface RoleRequest {
  id: string
  authorId: string
  text: string
  criteria: Criteria
  createdAt: number
  status: 'aberto' | 'decidido'
  decidedPlaceId?: string
  decidedTime?: string
  /** snapshot das opções (vem no link compartilhado) */
  optionIds?: string[]
  /** opções de horário para votação */
  times?: string[]
  /** pedido criado a partir de um convite de evento: o evento fica fixo como 1ª opção */
  eventId?: string
  /** resumo dos lugares do Google das opções (some da memória ao recarregar); apagado após 30 dias */
  optSnaps?: unknown[]
  /** a IA escolheu e ordenou as opções (a ordem de optionIds é a dela) */
  aiPicked?: boolean
  /** turma (grupo de quem votou junto) — reaproveitada em "novo rolê com essa turma" */
  groupId?: string
  /** autor quando o pedido veio de outro aparelho via link */
  externalAuthor?: { name: string; hue: number }
}

export interface Answer {
  id: string
  requestId: string
  userId: string
  placeId: string
  comment: string
  helpful: number
  createdAt: number
  visibleAt: number
  /** curador (simulado) ou sugestão de alguém que recebeu o link */
  kind?: 'curador' | 'sugestao'
  byName?: string
  byHue?: number
}

export interface Vote {
  id: string
  requestId: string
  kind?: 'place' | 'time'
  /** placeId (kind=place) ou rótulo do horário (kind=time) */
  placeId: string
  voter: string
  createdAt: number
}

export type Verdict = 'amei' | 'ok' | 'nao-curti'

export interface Review {
  id: string
  requestId?: string
  placeId: string
  went: boolean
  verdict?: Verdict
  note: string
  createdAt: number
}

export interface Ranked {
  place: Place
  score: number
  match: number
  reasons: string[]
  /** alertas honestos ("fecha às 23h", "não tem opção vegana") */
  warnings: string[]
  /** por que a IA escolheu este lugar pra este pedido (curadoria da LLM sobre os fatos) */
  aiNote?: string
}

export interface TrackEvent { id: string; name: string; at: number; path: string; props?: Record<string, unknown> }
export interface Feedback { id: string; at: number; path: string; score: number; text: string }
export interface Lead { id: string; at: number; placeId: string; requestId?: string; day: string; time: string; people: number; name: string; contact: string; note: string }

/* ---------- DTOs da API mock ---------- */
export interface FeedItem {
  request: RoleRequest
  author: Person
  answers: number
  votes: number
  topPlace?: Place
}

export interface AnswerDTO extends Answer {
  user: Person
  place: Place
  markedHelpful: boolean
  /** quanto a indicação encaixa nos critérios do pedido */
  fit: { match: number; warnings: string[] }
}

export interface VoteTally {
  placeId: string
  count: number
  voters: string[]
}

export interface RequestDetail {
  request: RoleRequest
  author: Person
  intro: string
  /** baixa = pedido vago ou nada encaixou bem */
  confidence: 'alta' | 'media' | 'baixa'
  recommendations: Ranked[]
  answers: AnswerDTO[]
  pendingAnswers: number
  options: Place[]
  tally: VoteTally[]
  times: string[]
  timeTally: VoteTally[]
}

export interface PlaceDetail {
  place: Place
  reviews: { user: Person; verdict: Verdict; note: string; createdAt: number }[]
  myReviews: Review[]
}

export interface DiaryEntry extends Review {
  place: Place
}

/* ---------- eventos enviados por artistas/produtores/criadores ---------- */
export type PromoterRole = 'artista' | 'produtor' | 'casa' | 'criador'
export interface EventDraft {
  name: string
  niches: Niche[]
  vibes: Vibe[]
  occasions: Occasion[]
  hood: string
  /** AAAA-MM-DD */
  date: string
  hour: number
  price: number
  capacity: number
  tagline: string
  highlights: string[]
  ticketUrl?: string
  by: { handle: string; role: PromoterRole; contact?: string }
}
export interface EventSubmission extends EventDraft {
  id: string
  hue: number
  at: number
  status: 'pendente' | 'aprovado' | 'recusado'
  /** 'meu' = enviei deste aparelho; 'recebido' = chegou pelo link da curadoria */
  origin: 'meu' | 'recebido'
  reviewedAt?: number
}
/** matches = em quantos pedidos o evento entraria no top 5 do ranking */
export interface EventFit { total: number; matches: number; top: { text: string; match: number; pos: number }[] }

export interface Home { lat: number; lng: number; label: string; city?: string; via: 'gps' | 'cep' | 'bairro' }
