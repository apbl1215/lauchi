import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabaseServer'
import { generationEngine, type GenerationRequest } from '@/lib/generators/generation-engine'
import { trackUsage } from '@/lib/supabaseServer'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer()
    
    // Authentication check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in to continue.' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const {
      documentId,
      generationType,
      difficulty = 'mixed',
      count = 10,
      customPrompt,
      focusAreas,
      style,
      preferredModel
    } = body

    // Validate required fields
    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required.' },
        { status: 400 }
      )
    }

    if (!['flashcard', 'mcq', 'true_false'].includes(generationType)) {
      return NextResponse.json(
        { error: 'Invalid generation type. Must be flashcard, mcq, or true_false.' },
        { status: 400 }
      )
    }

    // Get user profile and plan
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('plan_type')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Unable to fetch user profile.' },
        { status: 400 }
      )
    }

    // Get plan limits
    const { data: planLimits, error: limitsError } = await supabase
      .from('plan_limits')
      .select('*')
      .eq('plan_type', profile.plan_type)
      .single()

    if (limitsError || !planLimits) {
      return NextResponse.json(
        { error: 'Unable to fetch plan limits.' },
        { status: 400 }
      )
    }

    // Check daily usage limits
    const today = new Date().toISOString().split('T')[0]
    const { data: todayUsage, error: usageError } = await supabase
      .from('usage_logs')
      .select('credits_used')
      .eq('user_id', user.id)
      .eq('action', 'ai_generation')
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)

    if (usageError) {
      return NextResponse.json(
        { error: 'Unable to check usage limits.' },
        { status: 400 }
      )
    }

    const totalUsedToday = todayUsage?.reduce((sum, log) => sum + log.credits_used, 0) || 0
    if (totalUsedToday >= planLimits.daily_generations) {
      return NextResponse.json(
        { 
          error: `You've reached your daily limit of ${planLimits.daily_generations} generations. Please try again tomorrow or upgrade your plan.`,
          code: 'DAILY_LIMIT_EXCEEDED'
        },
        { status: 429 }
      )
    }

    // Get document content
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id) // Ensure user owns the document
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found or access denied.' },
        { status: 404 }
      )
    }

    // Check if document is still valid (not expired)
    if (new Date(document.delete_at) < new Date()) {
      return NextResponse.json(
        { error: 'Document has expired. Please upload a new document.' },
        { status: 410 }
      )
    }

    // Get document text content (in production, you might store this separately)
    const documentContent = await getDocumentContent(document)
    if (!documentContent) {
      return NextResponse.json(
        { error: 'Unable to retrieve document content.' },
        { status: 400 }
      )
    }

    // Validate count against plan limits
    const maxCount = getMaxCountForType(generationType, planLimits)
    const requestCount = Math.min(count, maxCount)

    // Build generation request
    const generationRequest: GenerationRequest = {
      userId: user.id,
      documentId,
      content: documentContent,
      userPlan: profile.plan_type as 'free' | 'basic' | 'pro',
      generationType: generationType as 'flashcard' | 'mcq' | 'true_false',
      difficulty: difficulty as 'easy' | 'medium' | 'hard' | 'mixed',
      count: requestCount,
      customPrompt,
      focusAreas,
      style,
      preferredModel
    }

    // Generate content using the generation engine
    const result = await generationEngine.generate(generationRequest)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Generation failed. Please try again.' },
        { status: 500 }
      )
    }

    // Save generation record to database
    const { data: generationRecord, error: saveError } = await supabase
      .from('ai_generations')
      .insert({
        user_id: user.id,
        document_id: documentId,
        type: generationType,
        tokens_used: result.metadata.tokensUsed.totalTokens,
        model: result.metadata.model,
        cost_usd: result.metadata.tokensUsed.estimatedCost,
        status: 'success'
      })
      .select()
      .single()

    if (saveError) {
      console.error('Failed to save generation record:', saveError)
      // Don't fail the request, just log the error
    }

    // Track usage
    await trackUsage(user.id, 'ai_generation', 1)

    // Save generated content based on type
    let savedContentId = null
    if (result.data) {
      savedContentId = await saveGeneratedContent(
        supabase,
        user.id,
        documentId,
        generationType,
        result.data,
        generationRecord?.id
      )
    }

    // Return success response
    return NextResponse.json({
      success: true,
      data: result.data,
      metadata: {
        generationType,
        count: result.data?.length || 0,
        difficulty,
        tokensUsed: result.metadata.tokensUsed.totalTokens,
        estimatedCost: result.metadata.tokensUsed.estimatedCost,
        model: result.metadata.model,
        generationTime: result.metadata.generationTime,
        qualityScore: result.metadata.qualityScore,
        cacheHit: result.metadata.cacheHit,
        contentId: savedContentId
      },
      usage: {
        remainingToday: planLimits.daily_generations - totalUsedToday - 1,
        totalLimit: planLimits.daily_generations,
        plan: profile.plan_type
      }
    })

  } catch (error) {
    console.error('Generation API error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred during generation.' },
      { status: 500 }
    )
  }
}

// Get document content (placeholder - implement based on your storage)
async function getDocumentContent(document: any): Promise<string | null> {
  try {
    // In production, you might:
    // 1. Fetch from Supabase Storage if text is stored separately
    // 2. Use the stored extracted text from document processing
    // 3. Re-extract from the original file if needed
    
    // For now, simulate with the document metadata
    // In real implementation, retrieve the actual extracted text
    return `This is the extracted content from ${document.file_name}. In production, this would be the actual document text that was extracted during upload processing.

Key information from the document:
- File type: ${document.file_type}
- Word count: ${document.word_count}
- File size: ${document.file_size} bytes

This content would normally contain the full text of the uploaded document, properly formatted and cleaned for AI processing. The generation system would use this text to create study materials that are strictly based on the document content.`

  } catch (error) {
    console.error('Error retrieving document content:', error)
    return null
  }
}

// Get maximum count based on generation type and plan
function getMaxCountForType(generationType: string, planLimits: any): number {
  switch (generationType) {
    case 'flashcard':
      return planLimits.max_flashcards
    case 'mcq':
    case 'true_false':
      return planLimits.max_quiz_questions
    default:
      return 10
  }
}

// Save generated content to appropriate table
async function saveGeneratedContent(
  supabase: any,
  userId: string,
  documentId: string,
  type: string,
  content: any[],
  generationId?: string
): Promise<string | null> {
  try {
    if (type === 'flashcard') {
      // Save as flashcard deck
      const { data: deck, error: deckError } = await supabase
        .from('flashcard_decks')
        .insert({
          user_id: userId,
          document_id: documentId,
          title: `Generated Flashcards - ${new Date().toLocaleDateString()}`,
          description: `${content.length} flashcards generated from uploaded document`
        })
        .select()
        .single()

      if (deckError) throw deckError

      // Save individual flashcards
      const flashcards = content.map((item, index) => ({
        deck_id: deck.id,
        question: item.question,
        answer: item.answer,
        position: index,
        difficulty_level: getDifficultyLevel(item.difficulty)
      }))

      const { error: cardsError } = await supabase
        .from('flashcards')
        .insert(flashcards)

      if (cardsError) throw cardsError

      return deck.id

    } else {
      // Save as quiz
      const { data: quiz, error: quizError } = await supabase
        .from('quizzes')
        .insert({
          user_id: userId,
          document_id: documentId,
          title: `Generated ${type.toUpperCase()} Quiz - ${new Date().toLocaleDateString()}`,
          quiz_type: type,
          questions: content
        })
        .select()
        .single()

      if (quizError) throw quizError

      return quiz.id
    }

  } catch (error) {
    console.error('Error saving generated content:', error)
    return null
  }
}

// Convert difficulty string to numeric level
function getDifficultyLevel(difficulty: string): number {
  switch (difficulty) {
    case 'easy': return 1
    case 'medium': return 2
    case 'hard': return 3
    default: return 2
  }
}

export const runtime = 'nodejs'
export const preferredRegion = 'auto'