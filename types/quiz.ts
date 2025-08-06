export type QuizType = 'mcq' | 'true_false' | 'modified_tf' | 'matching' | 'essay' | 'case'
export type QuizDifficulty = 'beginner' | 'intermediate' | 'advanced'

export interface QuizQuestionBase {
  id: string
  question: string
  type: QuizType
  explanation?: string
}

export interface MCQQuestion extends QuizQuestionBase {
  type: 'mcq'
  options: string[]
  correctAnswer: number // index of correct option
}

export interface TrueFalseQuestion extends QuizQuestionBase {
  type: 'true_false'
  correctAnswer: boolean
}

export interface ModifiedTFQuestion extends QuizQuestionBase {
  type: 'modified_tf'
  statement: string
  correction?: string
  isTrue: boolean
}

export interface MatchingQuestion extends QuizQuestionBase {
  type: 'matching'
  leftColumn: string[]
  rightColumn: string[]
  correctPairs: Record<number, number> // left index -> right index
}

export interface EssayQuestion extends QuizQuestionBase {
  type: 'essay'
  sampleAnswer?: string
  keyPoints?: string[]
}

export interface CaseQuestion extends QuizQuestionBase {
  type: 'case'
  scenario: string
  subQuestions: string[]
  sampleAnswers?: string[]
}

export type QuizQuestion = 
  | MCQQuestion 
  | TrueFalseQuestion 
  | ModifiedTFQuestion 
  | MatchingQuestion 
  | EssayQuestion 
  | CaseQuestion

export interface Quiz {
  id: string
  userId: string
  documentId?: string
  title: string
  quizType: QuizType
  difficulty: QuizDifficulty
  questions: QuizQuestion[]
  createdAt: Date
}

export interface GenerateQuizRequest {
  fileId: string
  topic?: string
  quizType: QuizType
  questionCount?: number
  difficulty?: QuizDifficulty
}

export interface GenerateQuizResponse {
  status: 'success' | 'error'
  quiz?: QuizQuestion[]
  tokensUsed?: number
  error?: string
}