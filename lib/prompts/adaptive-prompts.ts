// ============================================
// lib/prompts/adaptive-prompts.ts
// Adaptive Prompt System - Content-Based Generation
// ============================================

import { ContentAnalysis } from '@/lib/openai'

// Content types for adaptive prompting
export type ContentType = 'academic' | 'technical' | 'professional' | 'general'
export type GenerationType = 'flashcard' | 'mcq' | 'true_false'
export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'mixed'

// Prompt configuration interface
export interface PromptConfig {
  contentType: ContentType
  generationType: GenerationType
  difficulty: DifficultyLevel
  count: number
  customPrompt?: string
  focusAreas?: string[]
  style?: string
  contentAnalysis: ContentAnalysis
}

// System prompts for different content types
const SYSTEM_PROMPTS = {
  academic: `You are an expert academic tutor specializing in creating study materials from academic content. You have deep knowledge across all academic disciplines including sciences, humanities, social sciences, and mathematics. Focus on key concepts, theories, definitions, and their applications.`,

  technical: `You are a technical expert who excels at breaking down complex technical information into digestible study materials. You understand programming, engineering, systems, processes, and technical documentation. Focus on procedures, implementations, specifications, and technical relationships.`,

  professional: `You are a professional training specialist who creates study materials for workplace learning. You understand business processes, regulations, policies, standards, and professional practices. Focus on practical applications, compliance, procedures, and real-world scenarios.`,

  general: `You are a knowledgeable study assistant who creates effective study materials from any type of content. You adapt your approach based on the content while maintaining clarity and educational value.`
}

// Base prompt instructions for each generation type
const BASE_INSTRUCTIONS = {
  flashcard: {
    primary: `Create flashcards that test understanding of the key concepts from the provided content. Each flashcard should have a clear, concise question on one side and a comprehensive answer on the other.

CRITICAL RULES:
1. ONLY use information explicitly stated in the provided content
2. Do NOT add external knowledge or information not in the content
3. Questions must be answerable from the content alone
4. Include specific details, examples, and context from the content
5. Vary question types: definitions, explanations, examples, applications, comparisons`,

    fallback: `Create simple flashcards from the content provided. Make questions clear and answers complete. Only use information from the given content.`
  },

  mcq: {
    primary: `Create multiple-choice questions that test comprehension and application of the content. Each question should have one clearly correct answer and plausible distractors.

CRITICAL RULES:
1. ONLY use information from the provided content
2. Create 4 options (A, B, C, D) for each question
3. Make distractors plausible but clearly incorrect
4. Ensure the correct answer is unambiguously right based on the content
5. Test different cognitive levels: recall, understanding, application, analysis
6. Include specific details and context from the content`,

    fallback: `Create multiple choice questions with 4 options each. Base all questions and answers strictly on the provided content only.`
  },

  true_false: {
    primary: `Create true/false statements that test key facts, concepts, and relationships from the content. Include explanations for why each statement is true or false.

CRITICAL RULES:
1. ONLY use information explicitly stated in the content
2. Create statements that are unambiguously true or false based on the content
3. Avoid trick questions or ambiguous wording
4. Include explanations that reference specific parts of the content
5. Test important facts, relationships, and concepts
6. Balance true and false statements`,

    fallback: `Create true/false statements based only on the provided content. Make statements clear and provide explanations.`
  }
}

// Difficulty-specific instructions
const DIFFICULTY_INSTRUCTIONS = {
  easy: 'Focus on basic facts, definitions, and simple concepts that require recall and recognition.',
  medium: 'Focus on understanding relationships, applications, and explanations that require comprehension and analysis.',
  hard: 'Focus on complex applications, synthesis of multiple concepts, and critical thinking that requires evaluation and creation.',
  mixed: 'Create a balanced mix: 33% easy (recall/recognition), 34% medium (comprehension/application), 33% hard (analysis/synthesis).'
}

// Generate adaptive system prompt
export function generateSystemPrompt(config: PromptConfig): string {
  const baseSystem = SYSTEM_PROMPTS[config.contentAnalysis.subjectType] || SYSTEM_PROMPTS.general
  
  let systemPrompt = `${baseSystem}

CONTENT CONTEXT:
- Content Type: ${config.contentAnalysis.subjectType}
- Complexity Level: ${config.contentAnalysis.complexity}
- Word Count: ${config.contentAnalysis.wordCount}
- Technical Terms: ${config.contentAnalysis.technicalTerms}

GENERATION TASK: Create ${config.count} ${config.generationType === 'mcq' ? 'multiple choice questions' : config.generationType === 'true_false' ? 'true/false questions' : 'flashcards'} with ${config.difficulty} difficulty.

DIFFICULTY REQUIREMENTS:
${DIFFICULTY_INSTRUCTIONS[config.difficulty]}

QUALITY STANDARDS:
- Accuracy: All content must be factually correct based on the source
- Clarity: Questions and answers must be clearly written and unambiguous
- Relevance: Focus on the most important and testable information
- Educational Value: Help users learn and retain key concepts
- Source Fidelity: Never add information not present in the source content`

  // Add custom style if specified
  if (config.style) {
    systemPrompt += `\n\nSTYLE REQUIREMENTS: ${config.style}`
  }

  // Add focus areas if specified
  if (config.focusAreas && config.focusAreas.length > 0) {
    systemPrompt += `\n\nFOCUS AREAS: Pay special attention to these topics: ${config.focusAreas.join(', ')}`
  }

  return systemPrompt
}

// Generate main prompt with content
export function generateMainPrompt(config: PromptConfig, content: string): string {
  const baseInstructions = BASE_INSTRUCTIONS[config.generationType]
  const mainInstructions = baseInstructions.primary

  let prompt = `${mainInstructions}

COUNT: Generate exactly ${config.count} items.

FORMAT: Respond with a valid JSON array. Use this exact structure:`

  // Add format examples based on type
  switch (config.generationType) {
    case 'flashcard':
      prompt += `
[
  {
    "question": "Clear, specific question from the content",
    "answer": "Comprehensive answer with details from the content",
    "difficulty": "easy|medium|hard"
  }
]`
      break

    case 'mcq':
      prompt += `
[
  {
    "question": "Question based on the content",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "explanation": "Why this answer is correct, referencing the content",
    "difficulty": "easy|medium|hard"
  }
]`
      break

    case 'true_false':
      prompt += `
[
  {
    "statement": "Statement based on the content",
    "isTrue": true,
    "explanation": "Explanation referencing specific content",
    "difficulty": "easy|medium|hard"
  }
]`
      break
  }

  // Add custom prompt if provided
  if (config.customPrompt) {
    prompt += `\n\nADDITIONAL REQUIREMENTS: ${config.customPrompt}`
  }

  prompt += `\n\nCONTENT TO PROCESS:\n\n${content}`

  return prompt
}

// Generate fallback prompt (simpler, more reliable)
export function generateFallbackPrompt(config: PromptConfig, content: string): string {
  const fallbackInstructions = BASE_INSTRUCTIONS[config.generationType].fallback

  let prompt = `${fallbackInstructions}

Create ${config.count} ${config.generationType === 'mcq' ? 'multiple choice questions' : config.generationType === 'true_false' ? 'true/false questions' : 'flashcards'}.

Respond with valid JSON only:`

  // Simplified format examples
  switch (config.generationType) {
    case 'flashcard':
      prompt += `
[{"question": "...", "answer": "..."}]`
      break

    case 'mcq':
      prompt += `
[{"question": "...", "options": ["A", "B", "C", "D"], "correctAnswer": 0}]`
      break

    case 'true_false':
      prompt += `
[{"statement": "...", "isTrue": true}]`
      break
  }

  prompt += `\n\nContent:\n${content.substring(0, 2000)}`  // Truncate for reliability

  return prompt
}

// Analyze content to determine optimal prompting strategy
export function analyzePromptStrategy(content: string, config: PromptConfig): {
  shouldUseAdvanced: boolean
  contentChunks: string[]
  estimatedComplexity: 'low' | 'medium' | 'high'
} {
  const wordCount = content.split(/\s+/).length
  const hasStructuredContent = /\d+\.|•|\*|\n\s*-/.test(content) // Lists, bullets, numbers
  const hasTechnicalTerms = /[A-Z]{2,}|\b\w{10,}\b/.test(content) // Acronyms or long words
  
  // Determine if we should use advanced prompting
  const shouldUseAdvanced = wordCount < 10000 && 
                           config.contentAnalysis.complexity !== 'high' &&
                           !config.customPrompt

  // Split content into chunks if needed (for very long content)
  const chunkSize = config.contentAnalysis.complexity === 'high' ? 3000 : 5000
  const contentChunks = wordCount > chunkSize 
    ? chunkContent(content, chunkSize)
    : [content]

  // Estimate complexity for this specific generation
  let estimatedComplexity: 'low' | 'medium' | 'high' = 'low'
  if (hasStructuredContent && hasTechnicalTerms) estimatedComplexity = 'high'
  else if (hasStructuredContent || hasTechnicalTerms) estimatedComplexity = 'medium'

  return {
    shouldUseAdvanced,
    contentChunks,
    estimatedComplexity
  }
}

// Chunk content for processing large documents
function chunkContent(content: string, maxWords: number): string[] {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const chunks: string[] = []
  let currentChunk = ''
  let currentWordCount = 0

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).length
    
    if (currentWordCount + sentenceWords > maxWords && currentChunk.length > 0) {
      chunks.push(currentChunk.trim())
      currentChunk = sentence.trim() + '.'
      currentWordCount = sentenceWords
    } else {
      currentChunk += sentence.trim() + '.'
      currentWordCount += sentenceWords
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.trim())
  }

  return chunks.length > 0 ? chunks : [content]
}

// Generate prompts for semantic caching
export function generateCacheKey(config: PromptConfig, contentHash: string): string {
  const configKey = `${config.generationType}-${config.difficulty}-${config.count}-${config.contentAnalysis.subjectType}`
  const focusKey = config.focusAreas ? config.focusAreas.sort().join(',') : ''
  const styleKey = config.style || ''
  const customKey = config.customPrompt || ''
  
  return `${configKey}-${focusKey}-${styleKey}-${customKey}-${contentHash}`.replace(/\s+/g, '-')
}

export default {
  generateSystemPrompt,
  generateMainPrompt,
  generateFallbackPrompt,
  analyzePromptStrategy,
  generateCacheKey,
  SYSTEM_PROMPTS,
  BASE_INSTRUCTIONS,
  DIFFICULTY_INSTRUCTIONS
}