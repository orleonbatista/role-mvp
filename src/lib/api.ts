import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Criteria, DiaryEntry, EventDraft, Niche, Occasion, Vibe, EventFit, EventSubmission, Feedback, FeedItem, Lead, Person, Place, PlaceDetail, Profile, Ranked, RequestDetail, Review, RoleRequest, TrackEvent,
} from './types'

/* Cliente HTTP "de verdade": quem responde hoje é o MSW (src/mocks).
   Trocar pelo backend real = apontar BASE para a API e remover o worker. */
const BASE = '/api'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new ApiError(res.status, path)
  return res.json() as Promise<T>
}

export class ApiError extends Error {
  constructor(public status: number, path: string) { super(`${status} ${path}`) }
}
/** não insiste em 404: mostra o estado de "não encontrado" na hora */
const retry = (n: number, e: unknown) => !(e instanceof ApiError && e.status === 404) && n < 2

const post = <T>(path: string, body: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const useProfile = () => useQuery({ queryKey: ['me'], queryFn: () => req<Profile | null>('/me') })
export const useForYou = () => useQuery({ queryKey: ['for-you'], queryFn: () => req<Ranked[]>('/for-you') })
export const useEvents = () => useQuery({ queryKey: ['events'], queryFn: () => req<Place[]>('/events') })
export const useFeed = () => useQuery({ queryKey: ['feed'], queryFn: () => req<FeedItem[]>('/feed') })
export const usePlace = (id: string) => useQuery({ queryKey: ['place', id], queryFn: () => req<PlaceDetail>(`/places/${id}`), retry })
export const useDiary = () =>
  useQuery({ queryKey: ['diary'], queryFn: () => req<{ diary: DiaryEntry[]; requests: RoleRequest[] }>('/diary') })

export const useRequest = (id: string) =>
  useQuery({
    queryKey: ['request', id],
    queryFn: () => req<RequestDetail>(`/requests/${id}`),
    retry,
    enabled: !!id,
    refetchInterval: (q) => (q.state.status === 'error' ? false : (q.state.data?.pendingAnswers ?? 0) > 0 ? 1200 : 4000),
  })

export const parseText = (text: string) => post<Criteria>('/parse', { text })

export function useSaveProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Partial<Profile>) => req<Profile>('/me', { method: 'PUT', body: JSON.stringify(p) }),
    onSuccess: (p) => {
      qc.setQueryData(['me'], p)
      qc.invalidateQueries({ queryKey: ['for-you'] })
    },
  })
}

export function useCreateRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: { text: string; overrides?: Partial<Criteria>; groupId?: string }) => post<{ id: string }>('/requests', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  })
}

export function useVote(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: { placeId: string; voter: string; kind?: 'place' | 'time'; demo?: boolean }) => post<{ synced: boolean }>(`/requests/${requestId}/votes`, b),
    onMutate: async ({ placeId, voter, kind = 'place' }) => {
      // otimista: o placar anima na hora
      await qc.cancelQueries({ queryKey: ['request', requestId] })
      qc.setQueryData<RequestDetail>(['request', requestId], (d) =>
        d && {
          ...d,
          [kind === 'time' ? 'timeTally' : 'tally']: (kind === 'time' ? d.timeTally : d.tally).map((t) => {
            const voters = t.voters.filter((v) => v !== voter)
            if (t.placeId === placeId) voters.push(voter)
            return { ...t, voters, count: voters.length }
          }),
        },
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['request', requestId] }),
  })
}

export function useDeleteRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => post(`/requests/${id}/delete`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['feed'] }); qc.invalidateQueries({ queryKey: ['diary'] }) },
  })
}

export function useDecide(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: { placeId: string; time?: string }) => post(`/requests/${requestId}/decide`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['request', requestId] }),
  })
}

export function useHelpful(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (answerId: string) => post<{ helpful: number; markedHelpful: boolean }>(`/answers/${answerId}/helpful`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['request', requestId] }),
  })
}

export function useCreateReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (r: Omit<Review, 'id' | 'createdAt'>) => post<{ review: Review; credited: Person | null }>('/reviews', r),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['diary'] })
      qc.invalidateQueries({ queryKey: ['feed'] })
    },
  })
}

export const importRequest = (payload: unknown) => post<{ ok: boolean }>('/requests/import', payload)

export function useCreateLead() {
  return useMutation({ mutationFn: (l: Omit<Lead, 'id' | 'at'>) => post<Lead>('/leads', l) })
}

export function useSendFeedback() {
  return useMutation({ mutationFn: (f: Omit<Feedback, 'id' | 'at'>) => post<Feedback>('/feedback', f) })
}

export interface TestesData {
  counts: Record<string, number>
  total: number
  firstAt?: number
  lastAt?: number
  recent: TrackEvent[]
  feedback: Feedback[]
  leads: (Lead & { placeName: string })[]
  niches: Record<string, number>
  unmet: Record<string, number>
  bySrc: Record<string, { app_open: number; vote_cast: number; onboarding_done: number; request_created: number; story_shared: number; event_group_created: number }>
}
export const useTestes = () => useQuery({ queryKey: ['testes'], queryFn: () => req<TestesData>('/testes'), staleTime: 0 })
export const exportTestes = () => req<unknown>('/testes/export')

export const searchPlaces = (q: string, rid: string) => req<Ranked[]>(`/search?q=${encodeURIComponent(q)}&rid=${encodeURIComponent(rid)}`)
export const addSuggestion = (rid: string, b: { placeId: string; by: string; comment: string; hue?: number }) =>
  post<{ ok: boolean; duplicate: boolean; synced: boolean }>(`/requests/${rid}/suggestions`, b)

/* ---------- divulgação de eventos ---------- */
export const groupFromEvent = (placeId: string) => post<{ id: string }>(`/events/${encodeURIComponent(placeId)}/group`, {})
export const eventFit = (d: EventDraft) => post<EventFit>('/events/fit', d)
export type SubmissionDTO = EventSubmission & { fit: EventFit }
export const useSubmissions = () => useQuery({ queryKey: ['submissions'], queryFn: () => req<SubmissionDTO[]>('/submissions') })
export function useSubmitEvent() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (d: EventDraft) => post<EventSubmission & { synced: boolean }>('/submissions', d), onSuccess: () => qc.invalidateQueries({ queryKey: ['submissions'] }) })
}
export const importSubmission = (id: string, draft: unknown) => post<EventSubmission>('/submissions/import', { id, draft })
export function useReviewSubmission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: EventSubmission['status'] }) => post<EventSubmission & { published: boolean }>(`/submissions/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['submissions'] }); qc.invalidateQueries({ queryKey: ['events'] }) },
  })
}

/* ---------- backend compartilhado (PC) ---------- */
export const useSync = () => useQuery({ queryKey: ['sync'], queryFn: () => req<{ online: boolean; admin: boolean }>('/sync'), staleTime: 30_000, refetchInterval: 60_000 })
export const useGlobalStats = (enabled: boolean) => useQuery({ queryKey: ['testes-global'], queryFn: () => req<import('../mocks/remote').GlobalStats | null>('/testes/global'), enabled, refetchInterval: 15_000 })

/* ---------- catálogo comunitário ---------- */
export interface PlaceAnalysis { niches: Niche[]; vibes: Vibe[]; occasions: Occasion[]; engine: 'llm' | 'regras'; flag: string | null }
export const analyzePlace = (b: { comment: string; name: string; niches: Niche[]; occasions: Occasion[] }) => post<PlaceAnalysis>('/places/analyze', b)
export const confirmCommunityPlace = (place: Place, comment: string) =>
  post<{ ok: boolean; status: 'ok' | 'revisao' | 'local'; motivo?: string; existing?: boolean }>('/places/community', { place, comment })
export const usePlacesReview = (enabled: boolean) => useQuery({ queryKey: ['places-review'], queryFn: () => req<import('../mocks/remote').PlaceReview[]>('/catalog/review'), enabled, refetchInterval: 20_000 })
export function useReviewPlace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ok' | 'recusado' }) => post<{ ok: boolean }>(`/catalog/${encodeURIComponent(id)}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['places-review'] }),
  })
}
