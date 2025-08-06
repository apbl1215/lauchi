// types/database.ts
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          plan_type: 'free' | 'basic' | 'pro'
          credits_remaining: number
          stripe_customer_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          plan_type?: 'free' | 'basic' | 'pro'
          credits_remaining?: number
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          plan_type?: 'free' | 'basic' | 'pro'
          credits_remaining?: number
          stripe_customer_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      documents: {
        Row: {
          id: string
          user_id: string
          file_name: string
          file_url: string
          word_count: number
          file_size: number
          delete_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          file_name: string
          file_url: string
          word_count: number
          file_size: number
          delete_at: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          file_name?: string
          file_url?: string
          word_count?: number
          file_size?: number
          delete_at?: string
          created_at?: string
        }
      }
      flashcard_decks: {
        Row: {
          id: string
          user_id: string
          document_id: string | null
          title: string
          description: string | null
          is_public: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_id?: string | null
          title: string
          description?: string | null
          is_public?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_id?: string | null
          title?: string
          description?: string | null
          is_public?: boolean
          created_at?: string
        }
      }
      flashcards: {
        Row: {
          id: string
          deck_id: string
          question: string
          answer: string
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          deck_id: string
          question: string
          answer: string
          position: number
          created_at?: string
        }
        Update: {
          id?: string
          deck_id?: string
          question?: string
          answer?: string
          position?: number
          created_at?: string
        }
      }
      quizzes: {
        Row: {
          id: string
          user_id: string
          document_id: string | null
          title: string
          quiz_type: string
          questions: Json
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          document_id?: string | null
          title: string
          quiz_type: string
          questions: Json
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          document_id?: string | null
          title?: string
          quiz_type?: string
          questions?: Json
          created_at?: string
        }
      }
      ai_generations: {
        Row: {
          id: string
          user_id: string
          type: 'flashcard' | 'quiz'
          tokens_used: number
          model: string
          cost_usd: number | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: 'flashcard' | 'quiz'
          tokens_used: number
          model: string
          cost_usd?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: 'flashcard' | 'quiz'
          tokens_used?: number
          model?: string
          cost_usd?: number | null
          created_at?: string
        }
      }
      usage_logs: {
        Row: {
          id: string
          user_id: string
          action: string
          credits_used: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          action: string
          credits_used?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          action?: string
          credits_used?: number
          created_at?: string
        }
      }
    }
  }
}