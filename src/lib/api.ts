import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  Criteria, DiaryEntry, FeedItem, Person, Place, PlaceDetail, Profile, Ranked, RequestDetail, Review, RoleRequest,
} from './types'

/* Cliente HTTP "de verdade": quem responde hoje é o MSW (src/mocks).
   Trocar pelo backend real = apontar BASE para a API e remover o worker. */
const BASE = '/api'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

const post = <T>(path: string, body: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const useProfile = () => useQuery({ queryKey: ['me'], queryFn: () => req<Profile | null>('/me') })
export const useForYou = () => useQuery({ queryKey: ['for-you'], queryFn: () => req<Ranked[]>('/for-you') })
export const useEvents = () => useQuery({ queryKey: ['events'], queryFn: () => req<Place[]>('/events') })
export const useFeed = () => useQuery({ queryKey: ['feed'], queryFn: () => req<FeedItem[]>('/feed') })
export const usePlace = (id: string) => useQuery({ queryKey: ['place', id], queryFn: () => req<PlaceDetail>(`/places/${id}`) })
export const useDiary = () =>
  useQuery({ queryKey: ['diary'], queryFn: () => req<{ diary: DiaryEntry[]; requests: RoleRequest[] }>('/diary') })

export const useRequest = (id: string) =>
  useQuery({
    queryKey: ['request', id],
    queryFn: () => req<RequestDetail>(`/requests/${id}`),
    refetchInterval: (q) => ((q.state.data?.pendingAnswers ?? 0) > 0 ? 1200 : 4000),
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
    mutationFn: (b: { text: string; overrides?: Partial<Criteria> }) => post<{ id: string }>('/requests', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  })
}

export function useVote(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: { placeId: string; voter: string }) => post(`/requests/${requestId}/votes`, b),
    onMutate: async ({ placeId, voter }) => {
      // otimista: o placar anima na hora
      await qc.cancelQueries({ queryKey: ['request', requestId] })
      qc.setQueryData<RequestDetail>(['request', requestId], (d) =>
        d && {
          ...d,
          tally: d.tally.map((t) => {
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

export function useDecide(requestId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (placeId: string) => post(`/requests/${requestId}/decide`, { placeId }),
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
