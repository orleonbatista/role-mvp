export type Niche = 'listening' | 'eletronica' | 'boteco' | 'gastronomia' | 'drinks' | 'jazz' | 'ao-ar-livre'
export type Vibe = 'tranquilo' | 'animado' | 'intimista' | 'underground' | 'descolado' | 'raiz' | 'sofisticado'
export type Occasion = 'aniversario' | 'date' | 'amigos' | 'solo' | 'trabalho' | 'esquenta'
export type PlaceKind = 'bar' | 'restaurante' | 'balada' | 'evento'

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
}

export interface Criteria {
  occasion?: Occasion
  groupSize: number
  budget?: number
  hood?: string
  niches: Niche[]
  vibes: Vibe[]
}

export interface RoleRequest {
  id: string
  authorId: string
  text: string
  criteria: Criteria
  createdAt: number
  status: 'aberto' | 'decidido'
  decidedPlaceId?: string
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
}

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
  recommendations: Ranked[]
  answers: AnswerDTO[]
  pendingAnswers: number
  options: Place[]
  tally: VoteTally[]
}

export interface PlaceDetail {
  place: Place
  reviews: { user: Person; verdict: Verdict; note: string; createdAt: number }[]
  myReviews: Review[]
}

export interface DiaryEntry extends Review {
  place: Place
}
