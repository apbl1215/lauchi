// ============================================
// lib/generators/quiz-generator.ts
// Specialized Quiz Generation Logic
// ============================================

import {
  callOpenAIWithFallback,
  analyzeContentForModel,
  selectModel,
  type OpenAIModel,
  type TokenUsage
} from '@/lib/openai'
import {
  generateQuizPrompt,
  generateFallbackQuizPrompt,
  QUIZ_SYSTEM_PROMPT,
  type QuizPromptConfig,
  type QuizType,
  type QuizDifficulty
} from '@/lib/prompts/quiz-prompts'

// Quiz question interfaces
export interface MCQQuestion {
  id?: string
  type: 'mcq'
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
  difficulty: 'easy' | 'medium' | 'hard'
  topic?: string
}

export interface TrueFalseQuestion {
  id?: string
  type: 'true_false'
  statement: string
  isTrue: boolean
  explanation: string
  difficulty: 'easy' | 'medium' | 'hard'
  topic?: string
}

export type QuizQuestion = MCQQuestion | TrueFalseQuestion

export interface QuizGenerationRequest {
  content: string
  userPlan: 'free' | 'basic' | 'pro'
  type: QuizType
  count: number
  difficulty: QuizDifficulty
  style?: string
  focusAreas?: string[]
  customPrompt?: string
  preferredModel?: OpenAIModel
}

export interface QuizGenerationResult {
  success: boolean
  questions?: QuizQuestion[]
  error?: string
  metadata: {
    tokensUsed: TokenUsage
    generationTime: number
    model: OpenAIModel
    attemptUsed: 'primary' | 'fallback' | 'simplified'
    qualityScore: number
    distribution: {
      mcq: number
      trueFalse: number
      easy: number
      medium: number
      hard: number
    }
  }
}

export class QuizGenerator {

  // Main quiz generation method
  async generateQuiz(request: QuizGenerationRequest): Promise<QuizGenerationResult> {
    const startTime = Date.now()

    try {
      // Analyze content for optimal model selection
      const contentAnalysis = analyzeContentForModel(request.content)
      const model = selectModel(request.userPlan, contentAnalysis, request.preferredModel)

      // Build prompt configuration
      const promptConfig: QuizPromptConfig = {
        type: request.type,
        difficulty: request.difficulty,
        count: request.count,
        style: request.style,
        focusAreas: request.focusAreas,
        customPrompt: request.customPrompt
      }

      // Generate primary and fallback prompts
      const primaryPrompt = generateQuizPrompt(request.content, promptConfig)
      const fallbackPrompt = generateFallbackQuizPrompt(request.content, request.type, request.count)

      const primaryMessages = [
        { role: 'system' as const, content: QUIZ_SYSTEM_PROMPT },
        { role: 'user' as const, content: primaryPrompt }
      ]

      const fallbackMessages = [
        { role: 'system' as const, content: 'You are a helpful quiz creator. Generate quiz questions from the provided content.' },
        { role: 'user' as const, content: fallbackPrompt }
      ]

      // Generate quiz with fallback logic
      const response = await callOpenAIWithFallback(
        primaryMessages,
        fallbackMessages,
        model,
        request.userPlan
      )

      // Parse and validate response
      const questions = this.parseQuizResponse(response.content, request.type)
      
      // Apply difficulty distribution if mixed
      const processedQuestions = this.processDifficulty(questions, request.difficulty)
      
      // Enrich questions with additional metadata
      const enrichedQuestions = this.enrichQuestions(processedQuestions)
      
      // Calculate quality score and distribution
      const qualityScore = this.calculateQualityScore(enrichedQuestions, request)
      const distribution = this.calculateDistribution(enrichedQuestions)

      return {
        success: true,
        questions: enrichedQuestions,
        metadata: {
          tokensUsed: response.usage,
          generationTime: Date.now() - startTime,
          model: response.usage.model,
          attemptUsed: response.attemptUsed,
          qualityScore,
          distribution
        }
      }

    } catch (error) {
      console.error('Quiz generation failed:', error)
      
      // Emergency fallback - generate basic quiz questions
      const emergencyQuestions = this.generateEmergencyQuiz(request)
      const distribution = this.calculateDistribution(emergencyQuestions)
      
      return {
        success: true, // Still return success to maintain user experience
        questions: emergencyQuestions,
        error: 'Used simplified generation due to technical issues',
        metadata: {
          tokensUsed: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0, model: 'gpt-3.5-turbo' },
          generationTime: Date.now() - startTime,
          model: 'gpt-3.5-turbo',
          attemptUsed: 'simplified',
          qualityScore: 0.3,
          distribution
        }
      }
    }
  }

  // Parse AI response into quiz question objects
  private parseQuizResponse(content: string, expectedType: QuizType): QuizQuestion[] {
    try {
      // Clean the response
      const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim()
      
      // Parse JSON
      const parsed = JSON.parse(cleanedContent)
      
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array')
      }

      // Validate and normalize each question
      return parsed.map((item, index) => this.normalizeQuestion(item, index, expectedType))
        .filter(q => this.isValidQuestion(q)) // Remove invalid questions

    } catch (error) {
      console.error('JSON parsing failed, attempting regex extraction:', error)
      return this.extractQuestionsWithRegex(content, expectedType)
    }
  }

  // Extract questions using regex patterns when JSON parsing fails
  private extractQuestionsWithRegex(content: string, expectedType: QuizType): QuizQuestion[] {
    const questions: QuizQuestion[] = []
    
    if (expectedType === 'mcq' || expectedType === 'mixed') {
      // Extract MCQ questions
      const mcqRegex = /(?:Question|Q):\s*(.+?)\s*(?:A\.?\s*(.+?)\s*B\.?\s*(.+?)\s*C\.?\s*(.+?)\s*D\.?\s*(.+?))\s*(?:Answer|Correct):\s*([ABCD])/gi
      let mcqMatch
      
      while ((mcqMatch = mcqRegex.exec(content)) !== null) {
        const correctIndex = ['A', 'B', 'C', 'D'].indexOf(mcqMatch[6].toUpperCase())
        if (correctIndex >= 0) {
          questions.push({
            type: 'mcq',
            question: mcqMatch[1].trim(),
            options: [
              mcqMatch[2].trim(),
              mcqMatch[3].trim(),
              mcqMatch[4].trim(),
              mcqMatch[5].trim()
            ],
            correctAnswer: correctIndex,
            explanation: 'Based on the provided content.',
            difficulty: 'medium'
          })
        }
      }
    }

    if (expectedType === 'true_false' || expectedType === 'mixed') {
      // Extract True/False questions
      const tfRegex = /(?:Statement|S):\s*(.+?)\s*(?:Answer|A):\s*(true|false)/gi
      let tfMatch
      
      while ((tfMatch = tfRegex.exec(content)) !== null) {
        questions.push({
          type: 'true_false',
          statement: tfMatch[1].trim(),
          isTrue: tfMatch[2].toLowerCase() === 'true',
          explanation: 'Based on the provided content.',
          difficulty: 'medium'
        })
      }
    }

    return questions
  }

  // Normalize question object structure
  private normalizeQuestion(item: any, index: number, expectedType: QuizType): QuizQuestion {
    const questionType = item.type || (item.options ? 'mcq' : 'true_false')
    
    if (questionType === 'mcq') {
      return {
        id: `mcq_${index}`,
        type: 'mcq',
        question: this.cleanText(item.question || ''),
        options: this.normalizeOptions(item.options || []),
        correctAnswer: this.validateCorrectAnswer(item.correctAnswer),
        explanation: this.cleanText(item.explanation || ''),
        difficulty: this.validateDifficulty(item.difficulty),
        topic: item.topic || ''
      }
    } else {
      return {
        id: `tf_${index}`,
        type: 'true_false',
        statement: this.cleanText(item.statement || item.question || ''),
        isTrue: Boolean(item.isTrue),
        explanation: this.cleanText(item.explanation || ''),
        difficulty: this.validateDifficulty(item.difficulty),
        topic: item.topic || ''
      }
    }
  }

  // Clean and validate text content
  private cleanText(text: string): string {
    return text
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Normalize MCQ options
  private normalizeOptions(options: any[]): string[] {
    if (!Array.isArray(options) || options.length < 2) {
      return ['Option A', 'Option B', 'Option C', 'Option D']
    }
    
    // Ensure exactly 4 options
    const normalized = options.slice(0, 4).map(opt => this.cleanText(String(opt)))
    
    while (normalized.length < 4) {
      normalized.push(`Option ${String.fromCharCode(65 + normalized.length)}`)
    }
    
    return normalized
  }

  // Validate correct answer index
  private validateCorrectAnswer(answer: any): number {
    if (typeof answer === 'number' && answer >= 0 && answer <= 3) {
      return answer
    }
    
    if (typeof answer === 'string') {
      const index = ['A', 'B', 'C', 'D', '0', '1', '2', '3'].indexOf(answer.toUpperCase())
      if (index >= 0) {
        return index >= 4 ? index - 4 : index
      }
    }
    
    return 0 // Default to first option
  }

  // Validate difficulty level
  private validateDifficulty(difficulty: any): 'easy' | 'medium' | 'hard' {
    if (['easy', 'medium', 'hard'].includes(difficulty)) {
      return difficulty
    }
    return 'medium' // Default
  }

  // Check if question is valid
  private isValidQuestion(question: QuizQuestion): boolean {
    if (question.type === 'mcq') {
      return question.question.length > 10 &&
             question.options.length === 4 &&
             question.options.every(opt => opt.length > 0) &&
             question.correctAnswer >= 0 && question.correctAnswer <= 3
    } else {
      return question.statement.length > 10 &&
             typeof question.isTrue === 'boolean'
    }
  }

  // Apply difficulty distribution for mixed difficulty
  private processDifficulty(questions: QuizQuestion[], difficulty: QuizDifficulty): QuizQuestion[] {
    if (difficulty !== 'mixed') {
      return questions.map(q => ({ ...q, difficulty: difficulty as 'easy' | 'medium' | 'hard' }))
    }

    // Apply 33-34-33 distribution
    const total = questions.length
    const easyCount = Math.floor(total * 0.33)
    const mediumCount = Math.floor(total * 0.34)
    const hardCount = total - easyCount - mediumCount

    return questions.map((question, index) => {
      let assignedDifficulty: 'easy' | 'medium' | 'hard'
      
      if (index < easyCount) {
        assignedDifficulty = 'easy'
      } else if (index < easyCount + mediumCount) {
        assignedDifficulty = 'medium'
      } else {
        assignedDifficulty = 'hard'
      }

      return { ...question, difficulty: assignedDifficulty }
    })
  }

  // Enrich questions with additional metadata
  private enrichQuestions(questions: QuizQuestion[]): QuizQuestion[] {
    return questions.map((question, index) => ({
      ...question,
      id: question.id || `${question.type}_${Date.now()}_${index}`,
      topic: question.topic || this.inferTopic(question)
    }))
  }

  // Infer topic from question content
  private inferTopic(question: QuizQuestion): string {
    const content = question.type === 'mcq' ? question.question : question.statement
    const words = content.toLowerCase().split(' ')
    
    // Simple topic extraction - look for capitalized words or long words
    const potentialTopics = content.match(/[A-Z][a-z]{4,}/g) || 
                          words.filter(word => word.length > 6)
    
    return potentialTopics.length > 0 ? potentialTopics[0] : 'General'
  }

  // Calculate quality score for generated questions
  private calculateQualityScore(questions: QuizQuestion[], request: QuizGenerationRequest): number {
    let score = 0.5 // Base score

    // Check count accuracy
    const expectedCount = request.count
    const actualCount = questions.length
    const countAccuracy = Math.min(1, actualCount / expectedCount)
    score += countAccuracy * 0.2

    // Check content quality
    let qualityPoints = 0
    
    questions.forEach(question => {
      if (question.type === 'mcq') {
        const mcq = question as MCQQuestion
        if (mcq.question.length > 20 && mcq.explanation.length > 15) qualityPoints++
        if (mcq.options.every(opt => opt.length > 5)) qualityPoints++
      } else {
        const tf = question as TrueFalseQuestion
        if (tf.statement.length > 20 && tf.explanation.length > 15) qualityPoints++
      }
    })
    
    score += (qualityPoints / (questions.length * 2)) * 0.2

    // Check variety
    const uniqueQuestions = new Set(
      questions.map(q => q.type === 'mcq' ? q.question : q.statement)
    )
    
    if (uniqueQuestions.size === questions.length) {
      score += 0.1 // All unique questions
    }

    // Check difficulty distribution (for mixed)
    if (request.difficulty === 'mixed') {
      const easyCount = questions.filter(q => q.difficulty === 'easy').length
      const mediumCount = questions.filter(q => q.difficulty === 'medium').length
      const hardCount = questions.filter(q => q.difficulty === 'hard').length
      
      const total = questions.length
      const easyRatio = easyCount / total
      const mediumRatio = mediumCount / total
      const hardRatio = hardCount / total
      
      // Check if close to target distribution (33-34-33)
      if (Math.abs(easyRatio - 0.33) < 0.1 && Math.abs(mediumRatio - 0.34) < 0.1 && Math.abs(hardRatio - 0.33) < 0.1) {
        score += 0.1
      }
    }

    return Math.min(1.0, score)
  }

  // Calculate distribution statistics
  private calculateDistribution(questions: QuizQuestion[]) {
    const mcqCount = questions.filter(q => q.type === 'mcq').length
    const trueFalseCount = questions.filter(q => q.type === 'true_false').length
    const easyCount = questions.filter(q => q.difficulty === 'easy').length
    const mediumCount = questions.filter(q => q.difficulty === 'medium').length
    const hardCount = questions.filter(q => q.difficulty === 'hard').length

    return {
      mcq: mcqCount,
      trueFalse: trueFalseCount,
      easy: easyCount,
      medium: mediumCount,
      hard: hardCount
    }
  }

  // Generate emergency quiz questions when all else fails
  private generateEmergencyQuiz(request: QuizGenerationRequest): QuizQuestion[] {
    const questions: QuizQuestion[] = []
    
    // Extract sentences from content
    const sentences = request.content
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 30)
      .slice(0, request.count)

    const shouldGenerateMCQ = request.type === 'mcq' || request.type === 'mixed'
    const shouldGenerateTF = request.type === 'true_false' || request.type === 'mixed'

    for (let i = 0; i < Math.min(request.count, sentences.length); i++) {
      const sentence = sentences[i]
      
      // Alternate between MCQ and True/False for mixed type
      const generateMCQ = shouldGenerateMCQ && (request.type === 'mcq' || i % 2 === 0)
      
      if (generateMCQ) {
        questions.push({
          id: `emergency_mcq_${i}`,
          type: 'mcq',
          question: `According to the content: ${sentence.substring(0, 60)}...`,
          options: [
            'This information is correct as stated',
            'This information is incorrect',
            'This information is not mentioned',
            'This information needs more context'
          ],
          correctAnswer: 0,
          explanation: 'This statement appears in the provided content.',
          difficulty: 'medium'
        })
      } else if (shouldGenerateTF) {
        questions.push({
          id: `emergency_tf_${i}`,
          type: 'true_false',
          statement: sentence,
          isTrue: true,
          explanation: 'This statement is found in the provided content.',
          difficulty: 'medium'
        })
      }
    }

    // Fill remaining slots if needed
    while (questions.length < request.count) {
      const isLastMCQ = questions.length > 0 && questions[questions.length - 1].type === 'mcq'
      const shouldMakeMCQ = shouldGenerateMCQ && (!shouldGenerateTF || !isLastMCQ)
      
      if (shouldMakeMCQ) {
        questions.push({
          id: `emergency_mcq_${questions.length}`,
          type: 'mcq',
          question: `Study question ${questions.length + 1} from your uploaded content`,
          options: [
            'Based on the uploaded content',
            'Not mentioned in the content',
            'Partially correct',
            'Requires more context'
          ],
          correctAnswer: 0,
          explanation: 'This question is generated from your uploaded content.',
          difficulty: 'medium'
        })
      } else {
        questions.push({
          id: `emergency_tf_${questions.length}`,
          type: 'true_false',
          statement: `Statement ${questions.length + 1} derived from your uploaded content`,
          isTrue: true,
          explanation: 'This statement reflects information from your uploaded document.',
          difficulty: 'medium'
        })
      }
    }

    return questions
  }

  // Validate quiz meets quality standards
  validateQuiz(questions: QuizQuestion[]): { valid: boolean; issues: string[] } {
    const issues: string[] = []

    if (questions.length === 0) {
      issues.push('No questions generated')
      return { valid: false, issues }
    }

    // Check each question
    questions.forEach((question, index) => {
      if (!this.isValidQuestion(question)) {
        issues.push(`Question ${index + 1}: Invalid question structure`)
      }

      if (question.type === 'mcq') {
        const mcq = question as MCQQuestion
        if (mcq.correctAnswer < 0 || mcq.correctAnswer >= mcq.options.length) {
          issues.push(`Question ${index + 1}: Invalid correct answer index`)
        }
      }
    })

    return {
      valid: issues.length === 0,
      issues
    }
  }

  // Format quiz for different export formats
  formatForExport(questions: QuizQuestion[], format: 'json' | 'csv' | 'moodle'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(questions, null, 2)
        
      case 'csv':
        const headers = 'Type,Question,Options,Correct Answer,Explanation,Difficulty'
        const rows = questions.map(q => {
          if (q.type === 'mcq') {
            const mcq = q as MCQQuestion
            return `"MCQ","${mcq.question}","${mcq.options.join('; ')}","${mcq.correctAnswer}","${mcq.explanation}","${mcq.difficulty}"`
          } else {
            const tf = q as TrueFalseQuestion
            return `"True/False","${tf.statement}","True; False","${tf.isTrue ? 'True' : 'False'}","${tf.explanation}","${tf.difficulty}"`
          }
        })
        return [headers, ...rows].join('\n')
        
      case 'moodle':
        // Moodle XML format (simplified)
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n'
        
        questions.forEach((q, index) => {
          if (q.type === 'mcq') {
            const mcq = q as MCQQuestion
            xml += `  <question type="multichoice">\n`
            xml += `    <name><text>Question ${index + 1}</text></name>\n`
            xml += `    <questiontext format="html"><text><![CDATA[<p>${mcq.question}</p>]]></text></questiontext>\n`
            
            mcq.options.forEach((option, optIndex) => {
              const fraction = optIndex === mcq.correctAnswer ? '100' : '0'
              xml += `    <answer fraction="${fraction}" format="html"><text><![CDATA[<p>${option}</p>]]></text></answer>\n`
            })
            
            xml += `    <generalfeedback format="html"><text><![CDATA[<p>${mcq.explanation}</p>]]></text></generalfeedback>\n`
            xml += `  </question>\n`
          } else {
            const tf = q as TrueFalseQuestion
            xml += `  <question type="truefalse">\n`
            xml += `    <name><text>Question ${index + 1}</text></name>\n`
            xml += `    <questiontext format="html"><text><![CDATA[<p>${tf.statement}</p>]]></text></questiontext>\n`
            xml += `    <answer fraction="${tf.isTrue ? '100' : '0'}"><text>true</text></answer>\n`
            xml += `    <answer fraction="${tf.isTrue ? '0' : '100'}"><text>false</text></answer>\n`
            xml += `    <generalfeedback format="html"><text><![CDATA[<p>${tf.explanation}</p>]]></text></generalfeedback>\n`
            xml += `  </question>\n`
          }
        })
        
        xml += '</quiz>'
        return xml
        
      default:
        return JSON.stringify(questions, null, 2)
    }
  }

  // Calculate quiz statistics
  calculateStatistics(questions: QuizQuestion[]) {
    const totalQuestions = questions.length
    const mcqCount = questions.filter(q => q.type === 'mcq').length
    const trueFalseCount = questions.filter(q => q.type === 'true_false').length
    
    const difficultyBreakdown = {
      easy: questions.filter(q => q.difficulty === 'easy').length,
      medium: questions.filter(q => q.difficulty === 'medium').length,
      hard: questions.filter(q => q.difficulty === 'hard').length
    }
    
    const topicBreakdown = questions.reduce((acc, question) => {
      const topic = question.topic || 'General'
      acc[topic] = (acc[topic] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const avgQuestionLength = questions.reduce((sum, q) => {
      const text = q.type === 'mcq' ? q.question : q.statement
      return sum + text.length
    }, 0) / totalQuestions
    
    const avgExplanationLength = questions.reduce((sum, q) => {
      return sum + q.explanation.length
    }, 0) / totalQuestions

    return {
      totalQuestions,
      typeBreakdown: {
        mcq: mcqCount,
        trueFalse: trueFalseCount
      },
      difficultyBreakdown,
      topicBreakdown,
      averageQuestionLength: Math.round(avgQuestionLength),
      averageExplanationLength: Math.round(avgExplanationLength),
      estimatedCompletionTime: Math.ceil(totalQuestions * 1.5) // 1.5 minutes per question
    }
  }

  // Shuffle quiz questions for randomization
  shuffleQuestions(questions: QuizQuestion[]): QuizQuestion[] {
    const shuffled = [...questions]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  // Filter questions by criteria
  filterQuestions(
    questions: QuizQuestion[],
    criteria: {
      type?: 'mcq' | 'true_false'
      difficulty?: 'easy' | 'medium' | 'hard'
      topic?: string
      minLength?: number
    }
  ): QuizQuestion[] {
    return questions.filter(question => {
      if (criteria.type && question.type !== criteria.type) return false
      if (criteria.difficulty && question.difficulty !== criteria.difficulty) return false
      if (criteria.topic && question.topic !== criteria.topic) return false
      
      if (criteria.minLength) {
        const text = question.type === 'mcq' ? question.question : question.statement
        if (text.length < criteria.minLength) return false
      }
      
      return true
    })
  }
}

// Export singleton instance
export const quizGenerator = new QuizGenerator()

export default {
  QuizGenerator,
  quizGenerator
}