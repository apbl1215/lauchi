// ============================================
// lib/prompts/flashcard-prompts.ts
// Specialized Flashcard Prompt Templates
// ============================================

export interface FlashcardPromptConfig {
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed'
  count: number
  style?: string
  focusAreas?: string[]
  customPrompt?: string
}

// Base system prompt for flashcard generation
export const FLASHCARD_SYSTEM_PROMPT = `You are an expert educational content creator specializing in flashcard generation. Your expertise includes:

- Creating clear, testable questions from any content type
- Designing comprehensive answers that reinforce learning
- Balancing difficulty levels appropriately
- Ensuring questions are answerable from the provided content only
- Using effective pedagogical techniques for memory retention

CORE PRINCIPLES:
1. CONTENT FIDELITY: Only use information explicitly stated in the provided content
2. CLARITY: Questions must be unambiguous and clearly worded
3. COMPLETENESS: Answers should be comprehensive but concise
4. EDUCATIONAL VALUE: Focus on the most important and testable concepts
5. VARIETY: Create different types of questions (definitions, explanations, applications, examples)

You will receive content and create flashcards that help users learn and retain the key information effectively.`

// Difficulty-specific instructions
export const DIFFICULTY_PROMPTS = {
  easy: `Focus on basic facts, definitions, and simple recall questions. These should test fundamental knowledge that requires minimal analysis.

Examples of EASY flashcard types:
- "What is [term]?" → "Definition from content"
- "Who/What/When/Where" questions
- Direct fact recall
- Simple terminology`,

  medium: `Focus on understanding, relationships, and application of concepts. These should require comprehension and connection of ideas.

Examples of MEDIUM flashcard types:
- "How does [concept] work?" → "Process explanation"
- "What is the relationship between X and Y?"
- "Why is [concept] important?"
- Cause and effect relationships`,

  hard: `Focus on analysis, synthesis, and complex applications. These should require critical thinking and deep understanding.

Examples of HARD flashcard types:
- "Compare and contrast [concepts]" → "Detailed comparison"
- "What would happen if [scenario]?"
- "How would you apply [concept] to [situation]?"
- Multi-step problem solving`,

  mixed: `Create a balanced distribution:
- 33% Easy (basic recall and definitions)
- 34% Medium (understanding and relationships)
- 33% Hard (analysis and application)

Ensure variety in question types and cognitive levels.`
}

// Style-specific modifications
export const STYLE_MODIFIERS = {
  formal: 'Use formal academic language and complete sentences. Maintain professional tone throughout.',
  conversational: 'Use clear, conversational language that feels natural and approachable.',
  detailed: 'Provide comprehensive explanations with examples and context in answers.',
  concise: 'Keep questions and answers brief and to the point while maintaining accuracy.',
  visual: 'When possible, describe visual elements, diagrams, or spatial relationships mentioned in the content.',
  practical: 'Focus on real-world applications and practical implications of concepts.'
}

// Generate main flashcard prompt
export function generateFlashcardPrompt(content: string, config: FlashcardPromptConfig): string {
  let prompt = `Create exactly ${config.count} high-quality flashcards from the provided content.

DIFFICULTY LEVEL: ${config.difficulty.toUpperCase()}
${DIFFICULTY_PROMPTS[config.difficulty]}

RESPONSE FORMAT:
Respond with a valid JSON array only, using this exact structure:

[
  {
    "question": "Clear, specific question based on the content",
    "answer": "Comprehensive answer with details from the content",
    "difficulty": "easy|medium|hard",
    "topic": "Main topic/concept being tested",
    "type": "definition|explanation|application|example|comparison"
  }
]

QUALITY REQUIREMENTS:
- Questions must be answerable using ONLY the provided content
- Each flashcard should test a different concept or piece of information
- Answers should be complete but not overly long (2-4 sentences ideal)
- Include specific details and examples from the content when relevant
- Vary the question types and formats for engagement`

  // Add style modifications
  if (config.style && STYLE_MODIFIERS[config.style as keyof typeof STYLE_MODIFIERS]) {
    prompt += `\n\nSTYLE REQUIREMENTS:\n${STYLE_MODIFIERS[config.style as keyof typeof STYLE_MODIFIERS]}`
  }

  // Add focus areas
  if (config.focusAreas && config.focusAreas.length > 0) {
    prompt += `\n\nFOCUS AREAS:\nPay special attention to these topics: ${config.focusAreas.join(', ')}`
  }

  // Add custom instructions
  if (config.customPrompt) {
    prompt += `\n\nCUSTOM INSTRUCTIONS:\n${config.customPrompt}`
  }

  prompt += `\n\nCONTENT TO PROCESS:\n\n${content}`

  return prompt
}

// Generate fallback flashcard prompt (simpler, more reliable)
export function generateFallbackFlashcardPrompt(content: string, count: number): string {
  return `Create ${count} simple flashcards from this content. Use this format:

[
  {"question": "Question here", "answer": "Answer here", "difficulty": "medium"}
]

Only use information from the provided content. Make questions clear and answers complete.

Content:
${content.substring(0, 2000)}`
}

// Prompt for specific flashcard types
export const FLASHCARD_TYPE_PROMPTS = {
  definition: `Focus on creating definition-based flashcards:
- "What is [term]?" → Definition and key characteristics
- "Define [concept]" → Clear, comprehensive definition
- Include context and examples when provided in the content`,

  explanation: `Focus on how/why explanation flashcards:
- "How does [process] work?" → Step-by-step explanation
- "Why is [concept] important?" → Significance and implications
- "What causes [phenomenon]?" → Causal relationships`,

  application: `Focus on application and example flashcards:
- "Give an example of [concept]" → Specific examples from content
- "How is [concept] used in [context]?" → Practical applications
- "What would happen if [scenario]?" → Applied scenarios`,

  comparison: `Focus on comparison and relationship flashcards:
- "How are [A] and [B] different?" → Key differences
- "What do [concepts] have in common?" → Similarities
- "Compare [A] vs [B]" → Detailed comparison`,

  sequence: `Focus on process and sequence flashcards:
- "What are the steps in [process]?" → Sequential steps
- "What happens first/next/last in [process]?" → Order-based questions
- "List the stages of [process]" → Chronological information`
}

// Generate prompts for different content types
export function generateContentTypePrompt(contentType: 'academic' | 'technical' | 'business' | 'general'): string {
  const contentPrompts = {
    academic: `This is academic content. Focus on:
- Key theories, concepts, and principles
- Important definitions and terminology
- Research findings and evidence
- Methodologies and approaches
- Historical context and developments`,

    technical: `This is technical content. Focus on:
- Procedures and processes
- Technical specifications and requirements
- System components and relationships
- Implementation details
- Troubleshooting and problem-solving`,

    business: `This is business content. Focus on:
- Strategies and methodologies
- Key performance indicators
- Processes and workflows
- Regulations and compliance
- Best practices and standards`,

    general: `This is general content. Focus on:
- Main ideas and key concepts
- Important facts and information
- Cause and effect relationships
- Examples and illustrations
- Practical applications`
  }

  return contentPrompts[contentType] || contentPrompts.general
}

// Validation prompts for quality checking
export const VALIDATION_PROMPTS = {
  accuracy: 'Verify that all information in the flashcards is accurately represented from the source content.',
  completeness: 'Ensure that answers are complete and provide sufficient information for learning.',
  clarity: 'Check that questions are clear and unambiguous, and answers are well-structured.',
  difficulty: 'Confirm that the difficulty level matches the requested complexity.',
  variety: 'Ensure there is good variety in question types and topics covered.'
}

export default {
  FLASHCARD_SYSTEM_PROMPT,
  DIFFICULTY_PROMPTS,
  STYLE_MODIFIERS,
  generateFlashcardPrompt,
  generateFallbackFlashcardPrompt,
  FLASHCARD_TYPE_PROMPTS,
  generateContentTypePrompt,
  VALIDATION_PROMPTS
}