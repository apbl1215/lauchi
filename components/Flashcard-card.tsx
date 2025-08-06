'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { 
  RotateCcw, 
  Eye, 
  EyeOff, 
  Volume2, 
  Check, 
  X, 
  Star,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react'

export interface FlashcardData {
  id: string
  question: string
  answer: string
  difficulty: 'easy' | 'medium' | 'hard'
  topic?: string
  type?: string
}

interface FlashcardCardProps {
  flashcard: FlashcardData
  isFlipped: boolean
  onFlip: () => void
  onCorrect?: () => void
  onIncorrect?: () => void
  onFavorite?: () => void
  showControls?: boolean
  autoFlip?: boolean
  autoFlipDelay?: number
  className?: string
  size?: 'sm' | 'md' | 'lg'
  interactive?: boolean
  showDifficulty?: boolean
  showTopic?: boolean
  isFavorited?: boolean
}

export function FlashcardCard({
  flashcard,
  isFlipped,
  onFlip,
  onCorrect,
  onIncorrect,
  onFavorite,
  showControls = true,
  autoFlip = false,
  autoFlipDelay = 3000,
  className,
  size = 'md',
  interactive = true,
  showDifficulty = true,
  showTopic = true,
  isFavorited = false
}: FlashcardCardProps) {
  const [isAnimating, setIsAnimating] = useState(false)
  const [hasBeenViewed, setHasBeenViewed] = useState(false)

  // Auto flip functionality
  useEffect(() => {
    if (autoFlip && !isFlipped && !hasBeenViewed) {
      const timer = setTimeout(() => {
        onFlip()
        setHasBeenViewed(true)
      }, autoFlipDelay)
      
      return () => clearTimeout(timer)
    }
  }, [autoFlip, isFlipped, hasBeenViewed, autoFlipDelay, onFlip])

  // Handle flip animation
  const handleFlip = () => {
    if (!interactive) return
    
    setIsAnimating(true)
    setTimeout(() => {
      onFlip()
      setIsAnimating(false)
    }, 150)
  }

  // Handle keyboard navigation
  useEffect(() => {
    if (!interactive) return

    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault()
          handleFlip()
          break
        case 'ArrowRight':
          e.preventDefault()
          onCorrect?.()
          break
        case 'ArrowLeft':
          e.preventDefault()
          onIncorrect?.()
          break
        case 'f':
          e.preventDefault()
          onFavorite?.()
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [interactive, onCorrect, onIncorrect, onFavorite])

  // Get difficulty color
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'text-green-600 bg-green-50 border-green-200'
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200'
      case 'hard': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  // Get card size classes
  const getSizeClasses = () => {
    switch (size) {
      case 'sm': return 'h-48 text-sm'
      case 'md': return 'h-64 text-base'
      case 'lg': return 'h-80 text-lg'
      default: return 'h-64 text-base'
    }
  }

  // Text to speech functionality
  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.8
      utterance.pitch = 1
      utterance.volume = 0.8
      speechSynthesis.speak(utterance)
    }
  }

  return (
    <div className={cn('relative w-full max-w-md mx-auto', className)}>
      {/* Flashcard */}
      <Card 
        className={cn(
          'relative cursor-pointer transition-all duration-300 ease-in-out transform-gpu',
          getSizeClasses(),
          interactive && 'hover:scale-105 hover:shadow-lg',
          isAnimating && 'scale-95',
          isFlipped && 'bg-blue-50 border-blue-200',
          !isFlipped && 'bg-white border-gray-200'
        )}
        onClick={interactive ? handleFlip : undefined}
      >
        {/* Flip indicator */}
        <div className="absolute top-2 right-2 z-10">
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
            isFlipped 
              ? 'bg-blue-100 text-blue-600' 
              : 'bg-gray-100 text-gray-600'
          )}>
            {isFlipped ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </div>
        </div>

        {/* Favorite indicator */}
        {isFavorited && (
          <div className="absolute top-2 left-2 z-10">
            <Star className="h-5 w-5 text-yellow-500 fill-current" />
          </div>
        )}

        <CardContent className="h-full flex flex-col justify-center items-center p-6 text-center">
          {/* Question Side */}
          {!isFlipped && (
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">
                Question
              </div>
              <div className="text-gray-900 leading-relaxed">
                {flashcard.question}
              </div>
              {interactive && (
                <div className="text-xs text-gray-400 mt-4">
                  Click to reveal answer
                </div>
              )}
            </div>
          )}

          {/* Answer Side */}
          {isFlipped && (
            <div className="space-y-4">
              <div className="text-xs uppercase tracking-wide text-blue-500 font-medium">
                Answer
              </div>
              <div className="text-gray-900 leading-relaxed">
                {flashcard.answer}
              </div>
            </div>
          )}
        </CardContent>

        {/* Metadata Bar */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gray-50 border-t flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {showDifficulty && (
              <span className={cn(
                'px-2 py-1 rounded-full text-xs font-medium border',
                getDifficultyColor(flashcard.difficulty)
              )}>
                {flashcard.difficulty}
              </span>
            )}
            {showTopic && flashcard.topic && (
              <span className="text-gray-600">
                {flashcard.topic}
              </span>
            )}
          </div>
          
          {/* Text to Speech */}
          <Button
            onClick={(e) => {
              e.stopPropagation()
              speakText(isFlipped ? flashcard.answer : flashcard.question)
            }}
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
          >
            <Volume2 className="h-3 w-3" />
          </Button>
        </div>
      </Card>

      {/* Control Buttons */}
      {showControls && isFlipped && (
        <div className="flex justify-center gap-2 mt-4">
          {onIncorrect && (
            <Button
              onClick={onIncorrect}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
            >
              <X className="h-4 w-4" />
              Incorrect
            </Button>
          )}
          
          {onCorrect && (
            <Button
              onClick={onCorrect}
              variant="outline"
              size="sm"
              className="flex items-center gap-2 text-green-600 border-green-200 hover:bg-green-50"
            >
              <Check className="h-4 w-4" />
              Correct
            </Button>
          )}
          
          {onFavorite && (
            <Button
              onClick={onFavorite}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Star className={cn(
                'h-4 w-4',
                isFavorited ? 'text-yellow-500 fill-current' : ''
              )} />
              {isFavorited ? 'Favorited' : 'Favorite'}
            </Button>
          )}
        </div>
      )}

      {/* Keyboard Shortcuts Help */}
      {interactive && showControls && (
        <div className="mt-2 text-center text-xs text-gray-400">
          <div>Space: Flip • ← Wrong • → Correct • F: Favorite</div>
        </div>
      )}
    </div>
  )
}

// Flashcard Deck Component for multiple cards
interface FlashcardDeckProps {
  flashcards: FlashcardData[]
  currentIndex: number
  onNext: () => void
  onPrevious: () => void
  onFlip: (index: number) => void
  flippedStates: boolean[]
  onCorrect?: (index: number) => void
  onIncorrect?: (index: number) => void
  onFavorite?: (index: number) => void
  favoritedStates?: boolean[]
  showProgress?: boolean
  className?: string
}

export function FlashcardDeck({
  flashcards,
  currentIndex,
  onNext,
  onPrevious,
  onFlip,
  flippedStates,
  onCorrect,
  onIncorrect,
  onFavorite,
  favoritedStates = [],
  showProgress = true,
  className
}: FlashcardDeckProps) {
  const currentFlashcard = flashcards[currentIndex]
  const totalCards = flashcards.length

  if (!currentFlashcard) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No flashcards available</p>
      </div>
    )
  }

  return (
    <div className={cn('w-full max-w-2xl mx-auto space-y-4', className)}>
      {/* Progress Bar */}
      {showProgress && (
        <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
          <span>Card {currentIndex + 1} of {totalCards}</span>
          <div className="flex-1 mx-4 bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
            />
          </div>
          <span>{Math.round(((currentIndex + 1) / totalCards) * 100)}%</span>
        </div>
      )}

      {/* Flashcard */}
      <FlashcardCard
        flashcard={currentFlashcard}
        isFlipped={flippedStates[currentIndex] || false}
        onFlip={() => onFlip(currentIndex)}
        onCorrect={() => onCorrect?.(currentIndex)}
        onIncorrect={() => onIncorrect?.(currentIndex)}
        onFavorite={() => onFavorite?.(currentIndex)}
        isFavorited={favoritedStates[currentIndex] || false}
      />

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <Button
          onClick={onPrevious}
          disabled={currentIndex === 0}
          variant="outline"
          className="flex items-center gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>

        <div className="flex gap-2">
          <Button
            onClick={() => onFlip(currentIndex)}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Flip
          </Button>
        </div>

        <Button
          onClick={onNext}
          disabled={currentIndex === totalCards - 1}
          variant="outline"
          className="flex items-center gap-2"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Study Progress Summary */}
      {showProgress && (
        <div className="flex justify-center gap-4 text-xs text-gray-500 pt-2">
          <span>Viewed: {flippedStates.filter(Boolean).length}/{totalCards}</span>
          {favoritedStates.length > 0 && (
            <span>Favorited: {favoritedStates.filter(Boolean).length}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default FlashcardCard