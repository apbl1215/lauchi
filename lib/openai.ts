// ============================================
// lib/openai.ts - OpenAI Client Configuration
// Enterprise-grade AI integration with model selection
// ============================================

import OpenAI from 'openai'
import { countWords, analyzeContent } from '@/lib/utils'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Model pricing per 1K tokens (as of 2024)
export const MODEL_PRICING = {
  'gpt-3.5-turbo': { input: 0.0010, output: 0.0020 },
  'gpt-4': { input: 0.0300, output: 0.0600 },
  'gpt-4-turbo': { input: 0.0100, output: 0.0300 },
  'gpt-4o-mini': { input: 0.000150, output: 0.000600 },
  'gpt-4o': { input: 0.0050, output: 0.0150 }
} as const

export type OpenAIModel = keyof typeof MODEL_PRICING

// Content analysis for model selection
export interface ContentAnalysis {
  complexity: 'low' | 'medium' | 'high'
  wordCount: number
  technicalTerms: number
  subjectType: 'general' | 'technical' | 'academic' | 'professional'
  recommendedModel: OpenAIModel
}

// Generation configuration
export interface GenerationConfig {
  userPlan: 'free' | 'basic' | 'pro'
  contentType: 'flashcard' | 'mcq' | 'true_false' | 'summary'
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  count: number
  customPrompt?: string
  focusAreas?: string[]
  style?: string
}

// Token usage tracking
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
  model: OpenAIModel
}

// Analyze content complexity for model selection
export function analyzeContentForModel(text: string): ContentAnalysis {
  const wordCount = countWords(text)
  const words = text.toLowerCase().split(/\s+/)
  
  // Count technical terms (words longer than 8 characters)
  const technicalTerms = words.filter(word => word.length > 8).length
  const technicalRatio = technicalTerms / wordCount
  
  // Detect subject type based on keywords
  const academicKeywords = ['study', 'research', 'analysis', 'theory', 'concept', 'methodology']
  const technicalKeywords = ['system', 'process', 'function', 'algorithm', 'protocol', 'implementation']
  const professionalKeywords = ['policy', 'regulation', 'compliance', 'standard', 'procedure', 'requirement']
  
  const academicScore = academicKeywords.filter(keyword => text.toLowerCase().includes(keyword)).length
  const technicalScore = technicalKeywords.filter(keyword => text.toLowerCase().includes(keyword)).length
  const professionalScore = professionalKeywords.filter(keyword => text.toLowerCase().includes(keyword)).length
  
  let subjectType: ContentAnalysis['subjectType'] = 'general'
  const maxScore = Math.max(academicScore, technicalScore, professionalScore)
  if (maxScore > 2) {
    if (academicScore === maxScore) subjectType = 'academic'
    else if (technicalScore === maxScore) subjectType = 'technical'
    else subjectType = 'professional'
  }
  
  // Determine complexity
  let complexity: ContentAnalysis['complexity'] = 'low'
  if (technicalRatio > 0.15 || wordCount > 5000) complexity = 'high'
  else if (technicalRatio > 0.08 || wordCount > 2000) complexity = 'medium'
  
  // Recommend model based on complexity and subject
  let recommendedModel: OpenAIModel = 'gpt-3.5-turbo'
  if (complexity === 'high' || subjectType !== 'general') {
    recommendedModel = 'gpt-4o-mini' // Good balance of quality and cost
  }
  
  return {
    complexity,
    wordCount,
    technicalTerms,
    subjectType,
    recommendedModel
  }
}

// Select optimal model based on user plan and content
export function selectModel(userPlan: string, contentAnalysis: ContentAnalysis, userPreference?: OpenAIModel): OpenAIModel {
  // User preference overrides if they're on paid plan
  if (userPreference && userPlan !== 'free') {
    return userPreference
  }
  
  // Plan-based model selection
  switch (userPlan) {
    case 'free':
      return 'gpt-3.5-turbo' // Always use cheapest for free users
    
    case 'basic':
      // Use recommended model but limit to cost-effective options
      if (contentAnalysis.complexity === 'high') return 'gpt-4o-mini'
      return contentAnalysis.recommendedModel
    
    case 'pro':
      // Pro users get best model for their content
      if (contentAnalysis.complexity === 'high') return 'gpt-4-turbo'
      if (contentAnalysis.complexity === 'medium') return 'gpt-4o-mini'
      return 'gpt-3.5-turbo'
    
    default:
      return 'gpt-3.5-turbo'
  }
}

// Estimate token count for cost calculation
export function estimateTokens(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters for English
  // More accurate would use tiktoken library
  return Math.ceil(text.length / 4)
}

// Calculate estimated cost
export function estimateCost(promptText: string, expectedOutputTokens: number, model: OpenAIModel): number {
  const promptTokens = estimateTokens(promptText)
  const pricing = MODEL_PRICING[model]
  
  const inputCost = (promptTokens / 1000) * pricing.input
  const outputCost = (expectedOutputTokens / 1000) * pricing.output
  
  return inputCost + outputCost
}

// Main OpenAI API call with retry logic
export async function callOpenAI(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  model: OpenAIModel,
  maxRetries: number = 3,
  temperature: number = 0.7
): Promise<{ content: string; usage: TokenUsage }> {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`OpenAI attempt ${attempt}/${maxRetries} with model ${model}`)
      
      const completion = await openai.chat.completions.create({
        model,
        messages,
        temperature: temperature,
        max_tokens: 4000, // Generous limit for comprehensive responses
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1,
      })
      
      const usage = completion.usage
      if (!usage || !completion.choices[0]?.message?.content) {
        throw new Error('Invalid response from OpenAI')
      }
      
      const cost = (usage.prompt_tokens / 1000) * MODEL_PRICING[model].input + 
                   (usage.completion_tokens / 1000) * MODEL_PRICING[model].output
      
      return {
        content: completion.choices[0].message.content,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          estimatedCost: cost,
          model
        }
      }
      
    } catch (error) {
      lastError = error as Error
      console.error(`OpenAI attempt ${attempt} failed:`, error)
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000 // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, waitTime))
        
        // On retry, adjust parameters for better success
        temperature = Math.max(0.3, temperature - 0.1) // Reduce temperature
      }
    }
  }
  
  throw new Error(`OpenAI failed after ${maxRetries} attempts. Last error: ${lastError?.message}`)
}

// Retry with different prompt strategy
export async function callOpenAIWithFallback(
  primaryMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  fallbackMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  model: OpenAIModel,
  userPlan: string
): Promise<{ content: string; usage: TokenUsage; attemptUsed: 'primary' | 'fallback' | 'simplified' }> {
  
  try {
    // Try primary prompt first
    const result = await callOpenAI(primaryMessages, model, 2)
    return { ...result, attemptUsed: 'primary' }
    
  } catch (primaryError) {
    console.log('Primary prompt failed, trying fallback...')
    
    try {
      // Try fallback prompt
      const result = await callOpenAI(fallbackMessages, model, 2, 0.5)
      return { ...result, attemptUsed: 'fallback' }
      
    } catch (fallbackError) {
      console.log('Fallback failed, trying simplified approach...')
      
      // Last resort: use simpler model and basic prompt
      const simpleModel = userPlan === 'free' ? 'gpt-3.5-turbo' : 'gpt-4o-mini'
      const simplifiedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: 'You are a study assistant. Generate study materials from the provided content. Keep responses simple and clear.'
        },
        fallbackMessages[fallbackMessages.length - 1] // Use last message (usually the main request)
      ]
      
      try {
        const result = await callOpenAI(simplifiedMessages, simpleModel, 3, 0.3)
        return { ...result, attemptUsed: 'simplified' }
      } catch (simplifiedError) {
        throw new Error('All generation attempts failed. Please try again or contact support.')
      }
    }
  }
}

// Validate OpenAI response format
export function validateResponse(content: string, expectedType: 'flashcard' | 'mcq' | 'true_false'): boolean {
  try {
    const parsed = JSON.parse(content)
    
    switch (expectedType) {
      case 'flashcard':
        return Array.isArray(parsed) && parsed.every(item => 
          item.question && item.answer && typeof item.question === 'string' && typeof item.answer === 'string'
        )
      
      case 'mcq':
        return Array.isArray(parsed) && parsed.every(item =>
          item.question && item.options && item.correctAnswer !== undefined &&
          Array.isArray(item.options) && item.options.length >= 2
        )
      
      case 'true_false':
        return Array.isArray(parsed) && parsed.every(item =>
          item.statement && typeof item.isTrue === 'boolean'
        )
      
      default:
        return false
    }
  } catch {
    return false
  }
}

// Export OpenAI client for advanced usage
export { openai }

export default {
  analyzeContentForModel,
  selectModel,
  estimateTokens,
  estimateCost,
  callOpenAI,
  callOpenAIWithFallback,
  validateResponse,
  MODEL_PRICING
}