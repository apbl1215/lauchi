// ============================================
// lib/prompts/quiz-prompts.ts
// Specialized Quiz Prompt Templates
// ============================================

export type QuizType = 'mcq' | 'true_false' | 'mixed'
export type QuizDifficulty = 'easy' | 'medium' | 'hard' | 'mixed'

export interface QuizPromptConfig {
  type: QuizType
  difficulty: QuizDifficulty
  count: number
  style?: string
  focusAreas?: string[]
  customPrompt?: string
}

// Base system prompt for quiz generation
export const QUIZ_SYSTEM_PROMPT = `You are an expert quiz creator with extensive experience in educational assessment. Your expertise includes:

- Designing effective multiple choice questions with plausible distractors
- Creating clear true/false statements that test important concepts
- Balancing difficulty levels to match learning objectives
- Ensuring all questions are answerable from the provided content only
- Using assessment best practices for accurate knowledge evaluation

CORE PRINCIPLES:
1. CONTENT FIDELITY: Base all questions strictly on the provided content
2. FAIR ASSESSMENT: Questions should have one clearly correct answer
3. EDUCATIONAL VALUE: Focus on the most important and testable concepts
4. CLARITY: Questions and options must be unambiguous
5. APPROPRIATE DIFFICULTY: Match cognitive load to specified difficulty level

You will create quizzes that effectively assess understanding of the provided content.`

// Multiple Choice Question prompts
export const MCQ_PROMPTS = {
  system: `Create multiple choice questions with exactly 4 options each. Follow these guidelines:

QUESTION CONSTRUCTION:
- Base questions only on explicit information in the content
- Make questions clear and specific
- Test important concepts, not trivial details
- Vary question types (recall, understanding, application)

OPTION CREATION:
- Provide exactly 4 options labeled A, B, C, D
- Make one option clearly and unambiguously correct
- Create plausible but incorrect distractors
- Avoid "all of the above" or "none of the above" unless necessary
- Don't make options too similar or confusing

DISTRACTOR GUIDELINES:
- Use common misconceptions or partial information
- Make distractors believable but clearly wrong
- Avoid trick questions or overly subtle differences
- Base distractors on content when possible`,

  easy: `Create EASY multiple choice questions focusing on:
- Basic fact recall
- Simple definitions
- Direct information from the content
- Recognition rather than analysis

Example: "According to the content, what is [term]?"`,

  medium: `Create MEDIUM multiple choice questions focusing on:
- Understanding relationships between concepts
- Application of information
- Cause and effect connections
- Comparisons between different elements

Example: "What is the main difference between [concept A] and [concept B]?"`,

  hard: `Create HARD multiple choice questions focusing on:
- Analysis and synthesis of multiple concepts
- Application to new scenarios
- Evaluation and judgment
- Complex reasoning based on the content

Example: "Based on the information provided, what would be the most likely outcome if [scenario]?"`,

  mixed: `Create a balanced mix of difficulty levels:
- 33% Easy (basic recall and recognition)
- 34% Medium (understanding and application)
- 33% Hard (analysis and evaluation)`
}

// True/False question prompts
export const TRUE_FALSE_PROMPTS = {
  system: `Create true/false questions that test important concepts. Follow these guidelines:

STATEMENT CONSTRUCTION:
- Create clear, unambiguous statements
- Base statements strictly on the provided content
- Make statements definitively true or false (avoid gray areas)
- Test significant information, not trivial details
- Include explanations for why the statement is true or false

BALANCE:
- Aim for roughly 50% true and 50% false statements
- Avoid patterns (like all true statements first)
- Make false statements plausible but clearly incorrect

EXPLANATION REQUIREMENTS:
- Provide clear explanations referencing the content
- Explain why true statements are correct
- Explain why false statements are incorrect and what would be true instead`,

  easy: `Create EASY true/false questions focusing on:
- Direct facts from the content
- Simple yes/no information
- Basic definitions and characteristics
- Straightforward information

Example: "[Specific fact from content]" → True/False with explanation`,

  medium: `Create MEDIUM true/false questions focusing on:
- Relationships between concepts
- Cause and effect statements
- Comparisons and contrasts
- Process descriptions

Example: "[Statement about relationship/process]" → True/False with explanation`,

  hard: `Create HARD true/false questions focusing on:
- Complex implications and consequences
- Synthesis of multiple pieces of information
- Subtle distinctions and nuances
- Advanced applications

Example: "[Complex analytical statement]" → True/False with detailed explanation`,

  mixed: `Create a balanced mix of difficulty levels:
- 33% Easy (direct facts and definitions)
- 34% Medium (relationships and processes)
- 33% Hard (complex analysis and implications)`
}

// Generate quiz prompt based on configuration
export function generateQuizPrompt(content: string, config: QuizPromptConfig): string {
  let prompt = ''

  // Add appropriate system prompt based on quiz type
  if (config.type === 'mcq') {
    prompt += MCQ_PROMPTS.system + '\n\n'
    prompt += MCQ_PROMPTS[config.difficulty] || MCQ_PROMPTS.mixed
  } else if (config.type === 'true_false') {
    prompt += TRUE_FALSE_PROMPTS.system + '\n\n'
    prompt += TRUE_FALSE_PROMPTS[config.difficulty] || TRUE_FALSE_PROMPTS.mixed
  } else {
    // Mixed quiz type
    prompt += `Create a mixed quiz with both multiple choice and true/false questions.\n\n`
    prompt += MCQ_PROMPTS.system + '\n\n'
    prompt += TRUE_FALSE_PROMPTS.system
  }

  prompt += `\n\nCREATE: ${config.count} questions\n`

  // Add response format
  if (config.type === 'mcq') {
    prompt += `\nRESPONSE FORMAT - Multiple Choice:
[
  {
    "question": "Clear question based on the content",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": 0,
    "explanation": "Why this answer is correct, referencing the content",
    "difficulty": "easy|medium|hard",
    "topic": "Main topic being tested"
  }
]`
  } else if (config.type === 'true_false') {
    prompt += `\nRESPONSE FORMAT - True/False:
[
  {
    "statement": "Clear statement based on the content",
    "isTrue": true,
    "explanation": "Why this statement is true/false, referencing the content",
    "difficulty": "easy|medium|hard",
    "topic": "Main topic being tested"
  }
]`
  } else {
    prompt += `\nRESPONSE FORMAT - Mixed:
[
  {
    "type": "mcq|true_false",
    "question": "For MCQ questions",
    "statement": "For true/false questions",
    "options": ["Only for MCQ questions"],
    "correctAnswer": 0,
    "isTrue": true,
    "explanation": "Explanation for the correct answer",
    "difficulty": "easy|medium|hard",
    "topic": "Main topic being tested"
  }
]`
  }

  // Add style requirements
  if (config.style) {
    const styleInstructions = {
      formal: 'Use formal academic language and complete sentences.',
      conversational: 'Use clear, conversational language that students can easily understand.',
      detailed: 'Provide comprehensive explanations with examples from the content.',
      concise: 'Keep questions and explanations brief while maintaining clarity.',
      analytical: 'Focus on analysis and critical thinking questions.',
      practical: 'Emphasize real-world applications and practical implications.'
    }

    const styleInstruction = styleInstructions[config.style as keyof typeof styleInstructions]
    if (styleInstruction) {
      prompt += `\n\nSTYLE REQUIREMENTS:\n${styleInstruction}`
    }
  }

  // Add focus areas
  if (config.focusAreas && config.focusAreas.length > 0) {
    prompt += `\n\nFOCUS AREAS:\nPay special attention to these topics: ${config.focusAreas.join(', ')}`
  }

  // Add custom instructions
  if (config.customPrompt) {
    prompt += `\n\nCUSTOM INSTRUCTIONS:\n${config.customPrompt}`
  }

  // Add quality requirements
  prompt += `\n\nQUALITY REQUIREMENTS:
- All questions must be answerable using ONLY the provided content
- Ensure one clearly correct answer for each question
- Create plausible but incorrect distractors for MCQ
- Make true/false statements unambiguously true or false
- Provide clear explanations that reference the source content
- Test important concepts, not trivial details
- Vary question types and topics for comprehensive assessment`

  prompt += `\n\nCONTENT TO PROCESS:\n\n${content}`

  return prompt
}

// Generate fallback quiz prompt (simpler, more reliable)
export function generateFallbackQuizPrompt(content: string, type: QuizType, count: number): string {
  if (type === 'mcq') {
    return `Create ${count} multiple choice questions from this content:

[
  {"question": "Question here", "options": ["A", "B", "C", "D"], "correctAnswer": 0, "explanation": "Why this is correct"}
]

Content: ${content.substring(0, 2000)}`
  } else {
    return `Create ${count} true/false questions from this content:

[
  {"statement": "Statement here", "isTrue": true, "explanation": "Why this is true/false"}
]

Content: ${content.substring(0, 2000)}`
  }
}

// Specialized quiz prompts for different content types
export const CONTENT_TYPE_QUIZ_PROMPTS = {
  academic: `For academic content, focus on:
- Key theories and concepts
- Research findings and evidence
- Methodological approaches
- Analytical and critical thinking questions
- Application of theoretical knowledge`,

  technical: `For technical content, focus on:
- Procedures and processes
- System specifications and requirements
- Troubleshooting scenarios
- Implementation details
- Technical problem-solving`,

  business: `For business content, focus on:
- Strategic concepts and frameworks
- Process workflows and procedures
- Performance metrics and KPIs
- Regulatory and compliance issues
- Best practices and case applications`
}

// Question type specific prompts
export const QUESTION_TYPE_PROMPTS = {
  recall: 'Focus on testing memory and recognition of facts, terms, and basic concepts.',
  understanding: 'Focus on testing comprehension, explanation, and interpretation of information.',
  application: 'Focus on testing the ability to use information in new situations.',
  analysis: 'Focus on testing the ability to break down information and examine relationships.',
  evaluation: 'Focus on testing the ability to make judgments and assess information.',
  synthesis: 'Focus on testing the ability to combine elements and create new understanding.'
}

export default {
  QUIZ_SYSTEM_PROMPT,
  MCQ_PROMPTS,
  TRUE_FALSE_PROMPTS,
  generateQuizPrompt,
  generateFallbackQuizPrompt,
  CONTENT_TYPE_QUIZ_PROMPTS,
  QUESTION_TYPE_PROMPTS
}