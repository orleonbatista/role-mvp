import Dexie, { type Table } from 'dexie'
import type { Answer, Profile, Review, RoleRequest, Vote } from '../lib/types'
import { seedAnswers, seedRequests } from '../mocks/seeds/people'

class RoleDB extends Dexie {
  profile!: Table<Profile, string>
  requests!: Table<RoleRequest, string>
  answers!: Table<Answer, string>
  votes!: Table<Vote, string>
  reviews!: Table<Review, string>
  helpful!: Table<{ id: string }, string>

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
  }
}

export const db = new RoleDB()

export async function seedIfEmpty() {
  if ((await db.requests.count()) > 0) return
  await db.transaction('rw', db.requests, db.answers, async () => {
    await db.requests.bulkAdd(seedRequests)
    await db.answers.bulkAdd(seedAnswers)
  })
}

export async function resetAll() {
  await db.delete()
  localStorage.clear()
  location.href = import.meta.env.BASE_URL
}
