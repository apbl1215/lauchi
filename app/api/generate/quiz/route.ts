import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabaseServer'
import { quizGenerator, type QuizGenerationRequest } from '@/lib/generators/quiz-generator'

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
      quizType = 'mcq', // mcq, true_false, mixed
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

    if (!['mcq', 'true_false', 'mixed'].includes(quizType)) {
      return NextResponse.json(
        { error: 'Invalid quiz type. Must be mcq, true_false, or mixed.' },
        { status: 400 }
      )
    }

    if (count < 1 || count > 50) {
      return NextResponse.json(
        { error: 'Count must be between 1 and 50.' },
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
      .eq('action', 'quiz_generation')
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
          error: `You've reached your daily limit of ${planLimits.daily_generations} quiz generations. Please try again tomorrow or upgrade your plan.`,
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
    const requestCount = Math.min(count, planLimits.max_quiz_questions)
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

    // Build quiz generation request
    const generationRequest: QuizGenerationRequest = {
      content: documentContent,
      userPlan: profile.plan_type as 'free' | 'basic' | 'pro',
      type: quizType as 'mcq' | 'true_false' | 'mixed',
      count: requestCount,
      difficulty: difficulty as 'easy' | 'medium' | 'hard' | 'mixed',
      style,
      focusAreas,
      customPrompt,
      preferredModel
    }

    // Generate quiz
    const result = await quizGenerator.generateQuiz(generationRequest)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Quiz generation failed. Please try again.' },
        { status: 500 }
      )
    }

    // Save generation record to database
    const { data: generationRecord, error: saveError } = await supabase
      .from('ai_generations')
      .insert({
        user_id: user.id,
        document_id: documentId,
        type: 'quiz',
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

    // Save quiz to database
    let quizId = null
    if (result.questions) {
      const quizTitle = `Generated ${quizType.toUpperCase()} Quiz - ${document.file_name}`
      
      const { data: quiz, error: quizError } = await supabase
        .from('quizzes')
        .insert({
          user_id: user.id,
          document_id: documentId,
          title: quizTitle,
          quiz_type: quizType,
          difficulty: difficulty,
          questions: result.questions
        })
        .select()
        .single()

      if (!quizError) {
        quizId = quiz.id
      } else {
        console.error('Failed to save quiz:', quizError)
      }
    }

    // Track usage
    await supabase
      .from('usage_logs')
      .insert({
        user_id: user.id,
        action: 'quiz_generation',
        credits_used: 1,
        metadata: {
          quiz_id: quizId,
          quiz_type: quizType,
          question_count: result.questions?.length || 0,
          generation_time: result.metadata.generationTime,
          quality_score: result.metadata.qualityScore,
          distribution: result.metadata.distribution
        }
      })

    // Calculate quiz statistics
    const quizStats = quizGenerator.calculateStatistics(result.questions || [])

    // Return success response
    return NextResponse.json({
      success: true,
      questions: result.questions,
      quizId: quizId,
      metadata: {
        count: result.questions?.length || 0,
        quizType,
        difficulty,
        tokensUsed: result.metadata.tokensUsed.totalTokens,
        estimatedCost: result.metadata.tokensUsed.estimatedCost,
        model: result.metadata.model,
        generationTime: result.metadata.generationTime,
        qualityScore: result.metadata.qualityScore,
        attemptUsed: result.metadata.attemptUsed,
        distribution: result.metadata.distribution
      },
      statistics: quizStats,
      usage: {
        remainingToday: planLimits.daily_generations - totalUsedToday - 1,
        totalLimit: planLimits.daily_generations,
        plan: profile.plan_type
      }
    })

  } catch (error) {
    console.error('Quiz generation API error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred during quiz generation.' },
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

Document Information:
- File type: ${document.file_type}
- Word count: ${document.word_count}
- Processing status: ${document.processing_status}
- File size: ${document.file_size} bytes

Content Summary:
This document contains educational material that can be used to generate various types of quiz questions including multiple choice and true/false questions.

Key Topics and Concepts:
1. Primary concepts and definitions
2. Important facts and figures
3. Processes and procedures
4. Relationships between different elements
5. Applications and examples
6. Analysis and critical thinking points

Detailed Content:
The main body of this document would contain comprehensive information about the subject matter. This could include:

- Theoretical frameworks and models
- Practical applications and case studies
- Historical context and development
- Current trends and future directions
- Key terminology and definitions
- Statistical data and research findings
- Expert opinions and perspectives
- Problem-solving approaches
- Best practices and guidelines
- Comparative analyses

Assessment Content:
This material is suitable for creating quiz questions that test various cognitive levels:
- Knowledge recall (facts, terms, basic concepts)
- Comprehension (understanding, explanation)
- Application (using information in new contexts)
- Analysis (breaking down complex information)
- Evaluation (making judgments, assessments)
- Synthesis (combining elements, creating new understanding)

The content provides sufficient depth and breadth to generate meaningful quiz questions that accurately assess understanding of the material while remaining true to the source document.`

  } catch (error) {
    console.error('Error retrieving document content:', error)
    return null
  }
}

export const runtime = 'nodejs'