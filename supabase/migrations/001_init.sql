-- ============================================
-- AI STUDY APP - INITIAL DATABASE SCHEMA
-- Migration: 001_init.sql
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USER PROFILES TABLE
-- Extends Supabase auth.users
-- ============================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'basic', 'pro')),
  credits_remaining INTEGER DEFAULT 1,
  paymongo_customer_id TEXT,
  trial_ends_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PLAN LIMITS TABLE
-- Flexible plan configuration
-- ============================================
CREATE TABLE public.plan_limits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  plan_type TEXT UNIQUE NOT NULL CHECK (plan_type IN ('free', 'basic', 'pro')),
  daily_generations INTEGER NOT NULL DEFAULT 1,
  max_words INTEGER NOT NULL DEFAULT 3000,
  max_flashcards INTEGER NOT NULL DEFAULT 20,
  max_quiz_questions INTEGER NOT NULL DEFAULT 10,
  max_file_size_mb INTEGER NOT NULL DEFAULT 5,
  can_upload_files BOOLEAN DEFAULT true,
  can_export BOOLEAN DEFAULT false,
  has_priority_support BOOLEAN DEFAULT false,
  price_php INTEGER DEFAULT 0, -- Price in centavos
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plan limits
INSERT INTO public.plan_limits (plan_type, daily_generations, max_words, max_flashcards, max_quiz_questions, max_file_size_mb, can_upload_files, can_export, has_priority_support, price_php) VALUES
('free', 1, 3000, 20, 10, 5, true, false, false, 0),
('basic', 5, 20000, 50, 30, 20, true, true, true, 49900), -- ₱499.00
('pro', 20, 50000, 100, 50, 50, true, true, true, 149900); -- ₱1,499.00

-- ============================================
-- DOCUMENTS TABLE
-- Files uploaded by users (24-hour retention)
-- ============================================
CREATE TABLE public.documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL, -- Supabase Storage URL
  storage_path TEXT NOT NULL, -- Path in storage bucket
  word_count INTEGER NOT NULL DEFAULT 0,
  file_size INTEGER NOT NULL, -- Size in bytes
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt', 'pptx')),
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  delete_at TIMESTAMPTZ NOT NULL, -- Auto-delete after 24 hours
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FLASHCARD DECKS TABLE
-- Collections of flashcards
-- ============================================
CREATE TABLE public.flashcard_decks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  share_code TEXT UNIQUE, -- For public sharing
  study_count INTEGER DEFAULT 0, -- Times studied
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FLASHCARDS TABLE
-- Individual flashcard items
-- ============================================
CREATE TABLE public.flashcards (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  deck_id UUID REFERENCES public.flashcard_decks(id) ON DELETE CASCADE NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  review_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  last_reviewed_at TIMESTAMPTZ,
  next_review_at TIMESTAMPTZ, -- For spaced repetition
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- QUIZZES TABLE
-- Generated quizzes from documents
-- ============================================
CREATE TABLE public.quizzes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  quiz_type TEXT NOT NULL CHECK (quiz_type IN ('mcq', 'true_false', 'modified_tf', 'matching', 'essay', 'case')),
  difficulty TEXT DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  questions JSONB NOT NULL, -- Flexible JSON storage for different question types
  total_questions INTEGER GENERATED ALWAYS AS (jsonb_array_length(questions)) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- QUIZ RESULTS TABLE
-- Track quiz attempts and scores
-- ============================================
CREATE TABLE public.quiz_results (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  quiz_id UUID REFERENCES public.quizzes(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL, -- Points scored
  max_score INTEGER NOT NULL, -- Maximum possible points
  percentage DECIMAL(5,2) GENERATED ALWAYS AS (ROUND((score::DECIMAL / max_score::DECIMAL) * 100, 2)) STORED,
  time_taken INTEGER, -- Seconds taken to complete
  answers JSONB NOT NULL, -- User's answers
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AI GENERATIONS TABLE
-- Track AI API usage for billing
-- ============================================
CREATE TABLE public.ai_generations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('flashcard', 'quiz')),
  tokens_used INTEGER NOT NULL,
  model TEXT NOT NULL, -- gpt-4, gpt-3.5-turbo, etc.
  cost_usd DECIMAL(10, 6), -- Cost in USD
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'partial')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- USAGE LOGS TABLE
-- Track daily usage for plan limits
-- ============================================
CREATE TABLE public.usage_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL, -- 'flashcard_generation', 'quiz_generation', 'file_upload'
  credits_used INTEGER DEFAULT 1,
  metadata JSONB, -- Additional context (file_id, generation_count, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PAYMENT SESSIONS TABLE
-- Track PayMongo payment intents
-- ============================================
CREATE TABLE public.payment_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('basic', 'pro')),
  amount INTEGER NOT NULL, -- Amount in centavos
  currency TEXT DEFAULT 'PHP',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  paymongo_payment_intent_id TEXT,
  paymongo_payment_method_id TEXT,
  checkout_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 minutes')
);

-- ============================================
-- SHARED DECKS TABLE
-- Public sharing functionality
-- ============================================
CREATE TABLE public.shared_decks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  deck_id UUID REFERENCES public.flashcard_decks(id) ON DELETE CASCADE NOT NULL,
  share_code TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  view_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FEEDBACK TABLE
-- User feedback and bug reports
-- ============================================
CREATE TABLE public.feedback (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  type TEXT DEFAULT 'feedback' CHECK (type IN ('feedback', 'bug', 'feature_request')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcard_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- PROFILES POLICIES
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- PLAN LIMITS POLICIES (Read-only for all authenticated users)
CREATE POLICY "Authenticated users can view plan limits" ON public.plan_limits
  FOR SELECT TO authenticated USING (true);

-- DOCUMENTS POLICIES
CREATE POLICY "Users can view own documents" ON public.documents
  FOR ALL USING (auth.uid() = user_id);

-- FLASHCARD DECKS POLICIES
CREATE POLICY "Users can manage own flashcard decks" ON public.flashcard_decks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view public flashcard decks" ON public.flashcard_decks
  FOR SELECT USING (is_public = true);

-- FLASHCARDS POLICIES
CREATE POLICY "Users can manage flashcards in own decks" ON public.flashcards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.flashcard_decks 
      WHERE flashcard_decks.id = flashcards.deck_id 
      AND flashcard_decks.user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can view flashcards in public decks" ON public.flashcards
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.flashcard_decks 
      WHERE flashcard_decks.id = flashcards.deck_id 
      AND flashcard_decks.is_public = true
    )
  );

-- QUIZZES POLICIES
CREATE POLICY "Users can manage own quizzes" ON public.quizzes
  FOR ALL USING (auth.uid() = user_id);

-- QUIZ RESULTS POLICIES
CREATE POLICY "Users can view own quiz results" ON public.quiz_results
  FOR ALL USING (auth.uid() = user_id);

-- AI GENERATIONS POLICIES
CREATE POLICY "Users can view own AI generations" ON public.ai_generations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert AI generations" ON public.ai_generations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- USAGE LOGS POLICIES
CREATE POLICY "Users can view own usage logs" ON public.usage_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert usage logs" ON public.usage_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- PAYMENT SESSIONS POLICIES
CREATE POLICY "Users can manage own payment sessions" ON public.payment_sessions
  FOR ALL USING (auth.uid() = user_id);

-- SHARED DECKS POLICIES
CREATE POLICY "Anyone can view active shared decks" ON public.shared_decks
  FOR SELECT USING (is_active = true);

CREATE POLICY "Deck owners can manage shared decks" ON public.shared_decks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.flashcard_decks 
      WHERE flashcard_decks.id = shared_decks.deck_id 
      AND flashcard_decks.user_id = auth.uid()
    )
  );

-- FEEDBACK POLICIES
CREATE POLICY "Users can view own feedback" ON public.feedback
  FOR SELECT USING (auth.uid() = user_id OR email = auth.email());

CREATE POLICY "Anyone can submit feedback" ON public.feedback
  FOR INSERT WITH CHECK (true);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- User lookup indexes
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_plan_type ON public.profiles(plan_type);

-- Document indexes
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_delete_at ON public.documents(delete_at);
CREATE INDEX idx_documents_created_at ON public.documents(created_at DESC);

-- Flashcard indexes
CREATE INDEX idx_flashcard_decks_user_id ON public.flashcard_decks(user_id);
CREATE INDEX idx_flashcard_decks_public ON public.flashcard_decks(is_public) WHERE is_public = true;
CREATE INDEX idx_flashcard_decks_share_code ON public.flashcard_decks(share_code) WHERE share_code IS NOT NULL;
CREATE INDEX idx_flashcards_deck_id ON public.flashcards(deck_id);
CREATE INDEX idx_flashcards_next_review ON public.flashcards(next_review_at) WHERE next_review_at IS NOT NULL;

-- Quiz indexes
CREATE INDEX idx_quizzes_user_id ON public.quizzes(user_id);
CREATE INDEX idx_quiz_results_user_id ON public.quiz_results(user_id);
CREATE INDEX idx_quiz_results_quiz_id ON public.quiz_results(quiz_id);

-- Usage tracking indexes
CREATE INDEX idx_usage_logs_user_id_created ON public.usage_logs(user_id, created_at DESC);
CREATE INDEX idx_ai_generations_user_id ON public.ai_generations(user_id, created_at DESC);

-- Payment indexes
CREATE INDEX idx_payment_sessions_user_id ON public.payment_sessions(user_id);
CREATE INDEX idx_payment_sessions_status ON public.payment_sessions(status);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to automatically set updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER handle_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_plan_limits_updated_at
  BEFORE UPDATE ON public.plan_limits
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_flashcard_decks_updated_at
  BEFORE UPDATE ON public.flashcard_decks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to auto-delete expired documents
CREATE OR REPLACE FUNCTION public.delete_expired_documents()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete expired documents and get count
  WITH deleted AS (
    DELETE FROM public.documents 
    WHERE delete_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  -- Log the cleanup
  IF deleted_count > 0 THEN
    INSERT INTO public.usage_logs (user_id, action, credits_used, metadata)
    VALUES (
      '00000000-0000-0000-0000-000000000000'::UUID, -- System user
      'auto_cleanup', 
      0,
      jsonb_build_object('deleted_documents', deleted_count)
    );
  END IF;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate share codes
CREATE OR REPLACE FUNCTION public.generate_share_code()
RETURNS TEXT AS $$
BEGIN
  RETURN LOWER(
    SUBSTR(
      MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 
      1, 
      8
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Function to check user limits
CREATE OR REPLACE FUNCTION public.check_user_daily_limit(
  p_user_id UUID,
  p_action TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  user_plan TEXT;
  daily_limit INTEGER;
  today_usage INTEGER;
BEGIN
  -- Get user's plan
  SELECT plan_type INTO user_plan
  FROM public.profiles 
  WHERE id = p_user_id;
  
  -- Get plan limits
  SELECT daily_generations INTO daily_limit
  FROM public.plan_limits 
  WHERE plan_type = user_plan;
  
  -- Count today's usage
  SELECT COUNT(*) INTO today_usage
  FROM public.usage_logs
  WHERE user_id = p_user_id
    AND action = p_action
    AND DATE(created_at) = CURRENT_DATE;
  
  -- Return whether user is within limits
  RETURN today_usage < daily_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- STORAGE BUCKETS SETUP
-- ============================================

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'study-materials',
  'study-materials',
  false,
  52428800, -- 50MB in bytes
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
);

-- Storage policies for documents bucket
CREATE POLICY "Users can upload own files" ON storage.objects
  FOR INSERT TO authenticated 
  WITH CHECK (bucket_id = 'study-materials' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own files" ON storage.objects
  FOR SELECT TO authenticated 
  USING (bucket_id = 'study-materials' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own files" ON storage.objects
  FOR DELETE TO authenticated 
  USING (bucket_id = 'study-materials' AND auth.uid()::TEXT = (storage.foldername(name))[1]);

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================

-- Enable realtime for specific tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.flashcard_decks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_results;

-- ============================================
-- INITIAL DATA & DEMO CONTENT
-- ============================================

-- Demo shared deck for marketing (optional)
-- You can uncomment this after launch
/*
INSERT INTO public.profiles (id, email, full_name, plan_type) VALUES
('demo-user-uuid', 'demo@studybuddy.com', 'Demo User', 'pro');

INSERT INTO public.flashcard_decks (id, user_id, title, description, is_public, share_code) VALUES
('demo-deck-uuid', 'demo-user-uuid', 'Sample Law Flashcards', 'Constitutional Law basics for demo', true, 'democard');

INSERT INTO public.flashcards (deck_id, question, answer, position) VALUES
('demo-deck-uuid', 'What is the supreme law of the Philippines?', 'The 1987 Philippine Constitution', 1),
('demo-deck-uuid', 'How many articles are in the Philippine Constitution?', '18 articles covering various aspects of governance', 2);
*/

COMMIT;