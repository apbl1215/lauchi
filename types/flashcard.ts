export interface Flashcard {
  id: string
  question: string
  answer: string
  position: number
  createdAt: Date
}

export interface FlashcardDeck {
  id: string
  userId: string
  documentId?: string
  title: string
  description?: string
  isPublic: boolean
  flashcards: Flashcard[]
  createdAt: Date
}

export type FlashcardStyle = 'definition' | 'question-answer' | 'mnemonic' | 'irac'

export interface GenerateFlashcardsRequest {
  fileId: string
  topic?: string
  maxFlashcards?: number
  style?: FlashcardStyle
}

export interface GenerateFlashcardsResponse {
  status: 'success' | 'error'
  flashcards?: Flashcard[]
  tokensUsed?: number
  error?: string
}