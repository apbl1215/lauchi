import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabaseServer'
import { generateRandomId, formatFileSize } from '@/lib/utils'

// Maximum file size per plan (in bytes)
const FILE_SIZE_LIMITS = {
  free: 5 * 1024 * 1024,    // 5MB
  basic: 20 * 1024 * 1024,  // 20MB
  pro: 50 * 1024 * 1024     // 50MB
}

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
]

// File type mappings
const MIME_TO_EXTENSION = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServer()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in to continue.' },
        { status: 401 }
      )
    }

    // Get user profile and plan limits
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
          error: `You've reached your daily limit of ${planLimits.daily_generations} generations. Please try again tomorrow or upgrade your plan.` 
        },
        { status: 429 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided.' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { 
          error: `File type '${file.type}' is not supported. Please upload PDF, Word, or text files only.` 
        },
        { status: 400 }
      )
    }

    // Validate file size
    const maxSize = planLimits.max_file_size_mb * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { 
          error: `File size (${formatFileSize(file.size)}) exceeds your plan limit of ${formatFileSize(maxSize)}.` 
        },
        { status: 400 }
      )
    }

    // Validate file name
    if (file.name.length > 100) {
      return NextResponse.json(
        { error: 'File name is too long. Please use a shorter file name (max 100 characters).' },
        { status: 400 }
      )
    }

    // Check if file is empty
    if (file.size === 0) {
      return NextResponse.json(
        { error: 'File appears to be empty. Please upload a valid document.' },
        { status: 400 }
      )
    }

    // Generate unique upload ID and storage path
    const uploadId = generateRandomId(12)
    const fileExtension = MIME_TO_EXTENSION[file.type as keyof typeof MIME_TO_EXTENSION] || 'unknown'
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${user.id}/${uploadId}/${safeFileName}`

    // Upload file to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('study-materials')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file to storage. Please try again.' },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('study-materials')
      .getPublicUrl(storagePath)

    // Extract text content (simplified for demo - in production, use proper parsers)
    let extractedText = ''
    let wordCount = 0
    let metadata = {}

    try {
      if (file.type === 'text/plain') {
        extractedText = await file.text()
      } else {
        // For PDF and Word files, simulate text extraction
        // In production, integrate with pdf-parse, mammoth, etc.
        extractedText = `Extracted content from ${file.name}. This would contain the actual document text in production.`
      }

      wordCount = extractedText.split(/\s+/).filter(word => word.length > 0).length

      // Check word count limits
      if (wordCount > planLimits.max_words) {
        // Delete the uploaded file since it exceeds limits
        await supabase.storage
          .from('study-materials')
          .remove([storagePath])

        return NextResponse.json(
          { 
            error: `Document contains ${wordCount} words, but your plan allows only ${planLimits.max_words} words. Please use a shorter document or upgrade your plan.` 
          },
          { status: 400 }
        )
      }

      // Generate metadata based on file type
      metadata = {
        pages: Math.ceil(wordCount / 250), // Rough estimation
        title: file.name.replace(/\.[^/.]+$/, ""),
        author: 'Unknown',
        extractedAt: new Date().toISOString()
      }

    } catch (error) {
      console.error('Text extraction error:', error)
      
      // Clean up uploaded file on extraction failure
      await supabase.storage
        .from('study-materials')
        .remove([storagePath])

      return NextResponse.json(
        { error: 'Failed to extract text from document. Please ensure the file is not corrupted.' },
        { status: 400 }
      )
    }

    // Calculate deletion time (24 hours from now)
    const deleteAt = new Date()
    deleteAt.setHours(deleteAt.getHours() + 24)

    // Save document record to database
    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        file_name: file.name,
        file_url: urlData.publicUrl,
        storage_path: storagePath,
        word_count: wordCount,
        file_size: file.size,
        file_type: fileExtension,
        processing_status: 'completed',
        delete_at: deleteAt.toISOString()
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database insert error:', dbError)
      
      // Clean up uploaded file on database failure
      await supabase.storage
        .from('study-materials')
        .remove([storagePath])

      return NextResponse.json(
        { error: 'Failed to save document record. Please try again.' },
        { status: 500 }
      )
    }

    // Log the upload action
    await supabase
      .from('usage_logs')
      .insert({
        user_id: user.id,
        action: 'file_upload',
        credits_used: 0, // File upload doesn't use credits, generation does
        metadata: {
          file_id: documentData.id,
          file_name: file.name,
          file_size: file.size,
          word_count: wordCount
        }
      })

    // Return success response
    return NextResponse.json({
      success: true,
      document: {
        id: documentData.id,
        fileName: file.name,
        fileSize: file.size,
        wordCount: wordCount,
        fileType: fileExtension,
        publicUrl: urlData.publicUrl,
        extractedText: extractedText,
        metadata: metadata,
        deleteAt: deleteAt.toISOString(),
        uploadId: uploadId
      },
      usage: {
        remainingGenerations: planLimits.daily_generations - totalUsedToday,
        maxWords: planLimits.max_words,
        maxFileSize: planLimits.max_file_size_mb
      }
    })

  } catch (error) {
    console.error('Upload API error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred during upload. Please try again.' },
      { status: 500 }
    )
  }
}

// Handle file size limit for Next.js
export const runtime = 'nodejs'
export const preferredRegion = 'auto'

// Configure body size limit (50MB to support pro users)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}