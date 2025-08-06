export type UserPlan = 'free' | 'basic' | 'pro'

export interface User {
  id: string
  email: string
  fullName?: string
  planType: UserPlan
  creditsRemaining: number
  stripeCustomerId?: string
  createdAt: Date
  updatedAt: Date
}

export interface UserSession {
  user: User
  accessToken: string
  refreshToken: string
}

export interface UserLimits {
  dailyGenerations: number
  maxWords: number
  maxFlashcards: number
  maxQuizQuestions: number
  canUploadFiles: boolean
  canExport: boolean
  hasSupport: boolean
}

export const PLAN_LIMITS: Record<UserPlan, UserLimits> = {
  free: {
    dailyGenerations: 1,
    maxWords: 3000,
    maxFlashcards: 20,
    maxQuizQuestions: 10,
    canUploadFiles: true,
    canExport: false,
    hasSupport: false
  },
  basic: {
    dailyGenerations: 5,
    maxWords: 20000,
    maxFlashcards: 50,
    maxQuizQuestions: 30,
    canUploadFiles: true,
    canExport: true,
    hasSupport: true
  },
  pro: {
    dailyGenerations: 20,
    maxWords: 50000,
    maxFlashcards: 100,
    maxQuizQuestions: 50,
    canUploadFiles: true,
    canExport: true,
    hasSupport: true
  }
}