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
  /** simula curadores e amigos votando; desligar para testes com pessoas reais */
  demoMode: boolean
}

export interface Criteria {
  occasion?: Occasion
  groupSize: number
  budget?: number
  hood?: string
  niches: Niche[]
  vibes: Vibe[]
  tags: Tag[]
  when?: When
  /** termos pedidos que o catálogo não cobre (ex.: "funk") */
  unmet: string[]
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
