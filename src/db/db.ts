import Dexie, { type Table } from 'dexie'
import type { Answer, EventSubmission, Feedback, Lead, Profile, Review, RoleRequest, TrackEvent, Vote } from '../lib/types'
import { seedAnswers, seedRequests, seedVotes } from '../mocks/seeds/people'

class RoleDB extends Dexie {
  profile!: Table<Profile, string>
  requests!: Table<RoleRequest, string>
  answers!: Table<Answer, string>
  votes!: Table<Vote, string>
  reviews!: Table<Review, string>
  helpful!: Table<{ id: string }, string>
  events!: Table<TrackEvent, string>
  feedback!: Table<Feedback, string>
  leads!: Table<Lead, string>
  submissions!: Table<EventSubmission, string>

  constructor() {
    super('role-mvp')
    this.version(1).stores({
      profile: 'id',
      requests: 'id, authorId, createdAt',
      answers: 'id, requestId',
      votes: 'id, requestId',
      reviews: 'id, placeId, requestId, createdAt',
      helpful: 'id',
    })
    this.version(2).stores({
      events: 'id, name, at',
      feedback: 'id, at',
      leads: 'id, placeId, at',
    })
    this.version(3).stores({ submissions: 'id, status, at' })
  }
}

export const db = new RoleDB()

export async function seedIfEmpty() {
  if ((await db.requests.count()) > 0) return
  await db.transaction('rw', db.requests, db.answers, db.votes, async () => {
    await db.requests.bulkAdd(seedRequests)
    await db.answers.bulkAdd(seedAnswers)
    await db.votes.bulkAdd(seedVotes)
  })
}

export async function resetAll() {
  await db.delete()
  localStorage.clear()
  location.href = import.meta.env.BASE_URL
}
