import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabaseServer'
import { flashcardGenerator, type FlashcardGenerationRequest } from '@/lib/generators/flashcard-generator'

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

    if (count < 1 || count > 100) {
      return NextResponse.json(
        { error: 'Count must be between 1 and 100.' },
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
      .eq('action', 'flashcard_generation')
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
          error: `You've reached your daily limit of ${planLimits.daily_generations} flashcard generations. Please try again tomorrow or upgrade your plan.`,
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
      .eq('user_id', user.id)
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

    // Validate count against plan limits
    const requestCount = Math.min(count, planLimits.max_flashcards)
    if (requestCount !== count) {
      console.log(`Count adjusted from ${count} to ${requestCount} based on plan limits`)
    }

    // Get document content (placeholder - implement based on your storage)
    const documentContent = await getDocumentContent(document)
    if (!documentContent) {
      return NextResponse.json(
        { error: 'Unable to retrieve document content.' },
        { status: 400 }
      )
    }

    // Build flashcard generation request
    const generationRequest: FlashcardGenerationRequest = {
      content: documentContent,
      userPlan: profile.plan_type as 'free' | 'basic' | 'pro',
      count: requestCount,
      difficulty: difficulty as 'easy' | 'medium' | 'hard' | 'mixed',
      style,
      focusAreas,
      customPrompt,
      preferredModel
    }

    // Generate flashcards
    const result = await flashcardGenerator.generateFlashcards(generationRequest)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Flashcard generation failed. Please try again.' },
        { status: 500 }
      )
    }

    // Save generation record to database
    const { data: generationRecord, error: saveError } = await supabase
      .from('ai_generations')
      .insert({
        user_id: user.id,
        document_id: documentId,
        type: 'flashcard',
        tokens_used: result.metadata.tokensUsed.totalTokens,
        model: result.metadata.model,
        cost_usd: result.metadata.tokensUsed.estimatedCost,
        status: 'success'
      })
      .select()
      .single()

    if (saveError) {
      console.error('Failed to save generation record:', saveError)
    }

    // Save flashcards as a deck
    let deckId = null
    if (result.flashcards) {
      const { data: deck, error: deckError } = await supabase
        .from('flashcard_decks')
        .insert({
          user_id: user.id,
          document_id: documentId,
          title: `Generated Flashcards - ${document.file_name}`,
          description: `${result.flashcards.length} flashcards generated from ${document.file_name}`
        })
        .select()
        .single()

      if (!deckError) {
        deckId = deck.id

        // Save individual flashcards
        const flashcards = result.flashcards.map((card, index) => ({
          deck_id: deck.id,
          question: card.question,
          answer: card.answer,
          position: index,
          difficulty_level: getDifficultyLevel(card.difficulty)
        }))

        const { error: cardsError } = await supabase
          .from('flashcards')
          .insert(flashcards)

        if (cardsError) {
          console.error('Failed to save flashcards:', cardsError)
        }
      }
    }

    // Track usage
    await supabase
      .from('usage_logs')
      .insert({
        user_id: user.id,
        action: 'flashcard_generation',
        credits_used: 1,
        metadata: {
          deck_id: deckId,
          flashcard_count: result.flashcards?.length || 0,
          generation_time: result.metadata.generationTime,
          quality_score: result.metadata.qualityScore
        }
      })

    // Return success response
    return NextResponse.json({
      success: true,
      flashcards: result.flashcards,
      deckId: deckId,
      metadata: {
        count: result.flashcards?.length || 0,
        difficulty,
        tokensUsed: result.metadata.tokensUsed.totalTokens,
        estimatedCost: result.metadata.tokensUsed.estimatedCost,
        model: result.metadata.model,
        generationTime: result.metadata.generationTime,
        qualityScore: result.metadata.qualityScore,
        attemptUsed: result.metadata.attemptUsed
      },
      usage: {
        remainingToday: planLimits.daily_generations - totalUsedToday - 1,
        totalLimit: planLimits.daily_generations,
        plan: profile.plan_type
      }
    })

  } catch (error) {
    console.error('Flashcard generation API error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred during flashcard generation.' },
      { status: 500 }
    )
  }
}

// Helper function to get document content
async function getDocumentContent(document: any): Promise<string | null> {
  try {
    // In production, implement proper content retrieval
    // This is a placeholder that simulates content extraction
    return `This is the extracted content from ${document.file_name}. 

Key information from the document:
- File type: ${document.file_type}
- Word count: ${document.word_count}
- Processing status: ${document.processing_status}

In a production environment, this would contain the actual extracted text from the document that was processed during upload. The content would include all readable text from the PDF, Word document, or text file, properly formatted and cleaned for optimal AI processing.

The flashcard generation system uses this content to create study materials that are strictly based on the document's information, ensuring accuracy and relevance to the user's learning objectives.

Sample content structure:
- Introduction to key concepts
- Detailed explanations of important topics  
- Examples and case studies
- Conclusions and summaries

This content serves as the foundation for creating high-quality flashcards that help users study and retain the information effectively.`

  } catch (error) {
    console.error('Error retrieving document content:', error)
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