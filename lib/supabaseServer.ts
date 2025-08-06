// ============================================
// lib/supabaseServer.ts - SERVER-ONLY FUNCTIONS
// Only import this in Server Components!
// ============================================
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { CookieOptions } from '@supabase/ssr'
import type { Database } from '../types/database'

// ============================================
// SERVER CLIENT (for server components)
// ============================================
export async function createSupabaseServer() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
}

// ============================================
// MIDDLEWARE CLIENT (for middleware.ts)
// ============================================
export async function createSupabaseMiddleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  return { supabase, response }
}

// ============================================
// AUTH HELPERS (Server-side only)
// ============================================
export async function getUser() {
  const supabase = await createSupabaseServer()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return null
  }
  
  return user
}

export async function getSession() {
  const supabase = await createSupabaseServer()
  const { data: { session }, error } = await supabase.auth.getSession()
  
  if (error || !session) {
    return null
  }
  
  return session
}

export async function getUserProfile(userId: string) {
  const supabase = await createSupabaseServer()
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
    
  if (error) {
    console.error('Error fetching user profile:', error)
    return null
  }
  
  return data
}

// ============================================
// STORAGE HELPERS (Server-side only)
// ============================================
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob | ArrayBuffer
) {
  const supabase = await createSupabaseServer()
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false
    })
    
  if (error) {
    console.error('Error uploading file:', error)
    return { data: null, error }
  }
  
  return { data, error: null }
}

export async function getFileUrl(bucket: string, path: string) {
  const supabase = await createSupabaseServer()
  
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path)
    
  return data.publicUrl
}

export async function deleteFile(bucket: string, path: string) {
  const supabase = await createSupabaseServer()
  
  const { error } = await supabase.storage
    .from(bucket)
    .remove([path])
    
  if (error) {
    console.error('Error deleting file:', error)
    return false
  }
  
  return true
}

// ============================================
// USAGE TRACKING HELPERS (Server-side only)
// ============================================
export async function checkUserLimits(userId: string) {
  const supabase = await createSupabaseServer()
  
  // Get user's plan
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan_type')
    .eq('id', userId)
    .single()
    
  if (!profile) return { canGenerate: false, remaining: 0 }
  
  // Get today's usage
  const today = new Date().toISOString().split('T')[0]
  const { data: usage, error } = await supabase
    .from('usage_logs')
    .select('credits_used')
    .eq('user_id', userId)
    .gte('created_at', `${today}T00:00:00`)
    .lte('created_at', `${today}T23:59:59`)
    
  if (error) {
    console.error('Error checking usage:', error)
    return { canGenerate: false, remaining: 0 }
  }
  
  const totalUsedToday = usage?.reduce((sum, log) => sum + (log.credits_used || 0), 0) || 0
  
  // Get limits based on plan
  const limits = {
    free: parseInt(process.env.FREE_TIER_DAILY_GENERATIONS || '1'),
    basic: parseInt(process.env.BASIC_TIER_DAILY_GENERATIONS || '5'),
    pro: parseInt(process.env.PRO_TIER_DAILY_GENERATIONS || '20')
  }
  
  const userLimit = limits[profile.plan_type as keyof typeof limits] || limits.free
  const remaining = userLimit - totalUsedToday
  
  return {
    canGenerate: remaining > 0,
    remaining,
    limit: userLimit,
    used: totalUsedToday
  }
}

export async function trackUsage(
  userId: string,
  action: string,
  creditsUsed: number = 1
) {
  const supabase = await createSupabaseServer()
  
  const { error } = await supabase
    .from('usage_logs')
    .insert({
      user_id: userId,
      action,
      credits_used: creditsUsed
    })
    
  if (error) {
    console.error('Error tracking usage:', error)
    return false
  }
  
  return true
}