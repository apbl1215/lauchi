'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowser } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { isValidEmail, isValidPassword } from '@/lib/utils'
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react'

interface RegisterForm {
  fullName: string
  email: string
  password: string
  confirmPassword: string
  acceptTerms: boolean
}

interface RegisterErrors {
  fullName?: string
  email?: string
  password?: string
  confirmPassword?: string
  acceptTerms?: string
  general?: string
}

type VerificationStep = 'register' | 'verify-otp'

export default function RegisterPage() {
  const [step, setStep] = useState<VerificationStep>('register')
  const [form, setForm] = useState<RegisterForm>({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false
  })
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpError, setOtpError] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const router = useRouter()
  const supabase = createSupabaseBrowser()

  const validateForm = (): boolean => {
    const newErrors: RegisterErrors = {}

    // Full Name validation
    if (!form.fullName.trim()) {
      newErrors.fullName = 'Full name is required'
    } else if (form.fullName.trim().length < 2) {
      newErrors.fullName = 'Full name must be at least 2 characters'
    }

    // Email validation
    if (!form.email) {
      newErrors.email = 'Email is required'
    } else if (!isValidEmail(form.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    // Password validation using utils.ts
    const passwordValidation = isValidPassword(form.password)
    if (!passwordValidation.isValid) {
      newErrors.password = passwordValidation.errors[0] // Show first error
    }

    // Confirm password validation
    if (!form.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    // Terms acceptance validation
    if (!form.acceptTerms) {
      newErrors.acceptTerms = 'You must accept the terms and conditions'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setLoading(true)
    setErrors({})

    try {
      // Step 1: Send OTP to email
      const { error } = await supabase.auth.signInWithOtp({
        email: form.email,
        options: {
          data: {
            full_name: form.fullName,
            // We'll create the account after OTP verification
          }
        }
      })

      if (error) {
        if (error.message.includes('already registered')) {
          setErrors({ email: 'This email is already registered. Try signing in instead.' })
        } else {
          setErrors({ general: error.message })
        }
        return
      }

      setStep('verify-otp')
    } catch (err) {
      setErrors({ general: 'An unexpected error occurred. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!otpCode.trim()) {
      setOtpError('Please enter the verification code')
      return
    }

    if (otpCode.length !== 6) {
      setOtpError('Verification code must be 6 digits')
      return
    }

    setLoading(true)
    setOtpError('')

    try {
      // Verify OTP
      const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
        email: form.email,
        token: otpCode,
        type: 'signup'
      })

      if (otpError) {
        if (otpError.message.includes('expired')) {
          setOtpError('Verification code has expired. Please request a new one.')
        } else if (otpError.message.includes('invalid')) {
          setOtpError('Invalid verification code. Please check and try again.')
        } else {
          setOtpError(otpError.message)
        }
        return
      }

      if (otpData.user) {
        // Now create the user account with password
        const { error: signUpError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            data: {
              full_name: form.fullName,
            }
          }
        })

        if (signUpError) {
          setOtpError(signUpError.message)
          return
        }

        // Redirect to dashboard
        router.push('/dashboard')
      }
    } catch (err) {
      setOtpError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    setResendLoading(true)
    setOtpError('')

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: form.email
      })

      if (error) {
        setOtpError('Failed to resend code. Please try again.')
      } else {
        setOtpError('')
        // Show success message temporarily
        setOtpError('New verification code sent!')
        setTimeout(() => setOtpError(''), 3000)
      }
    } catch (err) {
      setOtpError('Failed to resend code. Please try again.')
    } finally {
      setResendLoading(false)
    }
  }

  const handleSocialRegister = async (provider: 'google' | 'facebook') => {
    setLoading(true)
    setErrors({})

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/dashboard`
        }
      })

      if (error) {
        setErrors({ general: `Failed to register with ${provider}. Please try again.` })
      }
    } catch (err) {
      setErrors({ general: 'An unexpected error occurred. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: keyof RegisterForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (field === 'acceptTerms') {
      setForm(prev => ({ ...prev, [field]: (e.target as HTMLInputElement).checked }))
    } else {
      setForm(prev => ({ ...prev, [field]: e.target.value }))
    }
    
    // Clear field-specific error when user starts typing/changing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  if (step === 'verify-otp') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold text-gray-900">
              Verify Your Email
            </CardTitle>
            <CardDescription className="text-gray-600">
              We've sent a 6-digit code to<br />
              <span className="font-medium text-blue-600">{form.email}</span>
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {otpError && (
              <div className={`flex items-center gap-2 p-3 text-sm rounded-md ${
                otpError.includes('sent!') 
                  ? 'text-green-700 bg-green-50 border border-green-200' 
                  : 'text-red-700 bg-red-50 border border-red-200'
              }`}>
                {otpError.includes('sent!') ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {otpError}
              </div>
            )}

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <Input
                type="text"
                placeholder="Enter 6-digit code"
                label="Verification Code"
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  setOtpError('')
                }}
                maxLength={6}
                disabled={loading}
                className="text-center text-lg tracking-widest"
              />

              <Button
                type="submit"
                loading={loading}
                className="w-full"
                variant="gradient"
              >
                Verify & Create Account
              </Button>
            </form>

            <div className="text-center space-y-2">
              <p className="text-sm text-gray-600">
                Didn't receive the code?
              </p>
              <Button
                onClick={handleResendOtp}
                loading={resendLoading}
                variant="ghost"
                className="text-sm"
              >
                Resend Code
              </Button>
            </div>

            <div className="text-center">
              <Button
                onClick={() => setStep('register')}
                variant="ghost"
                className="text-sm"
              >
                ← Back to registration
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Create Your Account
          </CardTitle>
          <CardDescription className="text-gray-600">
            Join AI Study Buddy and start learning smarter
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {errors.general && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {errors.general}
            </div>
          )}

          {/* Social Registration Buttons */}
          <div className="space-y-2">
            <Button
              onClick={() => handleSocialRegister('google')}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>

            <Button
              onClick={() => handleSocialRegister('facebook')}
              disabled={loading}
              variant="outline"
              className="w-full"
            >
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Continue with Facebook
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
            </div>
          </div>

          {/* Registration Form */}
          <form onSubmit={handleRegister} className="space-y-4">
            <Input
              type="text"
              placeholder="Enter your full name"
              label="Full Name"
              leftIcon={<User className="h-4 w-4" />}
              value={form.fullName}
              onChange={handleChange('fullName')}
              error={errors.fullName}
              disabled={loading}
            />

            <Input
              type="email"
              placeholder="Enter your email"
              label="Email"
              leftIcon={<Mail className="h-4 w-4" />}
              value={form.email}
              onChange={handleChange('email')}
              error={errors.email}
              disabled={loading}
            />

            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Create a password"
              label="Password"
              leftIcon={<Lock className="h-4 w-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              value={form.password}
              onChange={handleChange('password')}
              error={errors.password}
              disabled={loading}
            />

            <Input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm your password"
              label="Confirm Password"
              leftIcon={<Lock className="h-4 w-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="hover:text-gray-600"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              value={form.confirmPassword}
              onChange={handleChange('confirmPassword')}
              error={errors.confirmPassword}
              disabled={loading}
            />

            {/* Terms and Conditions */}
            <div className="space-y-2">
              <div className="flex items-start space-x-2">
                <input
                  type="checkbox"
                  id="acceptTerms"
                  checked={form.acceptTerms}
                  onChange={handleChange('acceptTerms')}
                  disabled={loading}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="acceptTerms" className="text-sm text-gray-700">
                  I agree to the{' '}
                  <Link href="/terms" className="text-blue-600 hover:text-blue-700 hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-blue-600 hover:text-blue-700 hover:underline">
                    Privacy Policy
                  </Link>
                </label>
              </div>
              {errors.acceptTerms && (
                <p className="text-sm text-red-600">{errors.acceptTerms}</p>
              )}
            </div>

            <Button
              type="submit"
              loading={loading}
              className="w-full"
              variant="gradient"
            >
              Create Account
            </Button>
          </form>

          <div className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link
              href="/auth/login"
              className="text-blue-600 hover:text-blue-700 hover:underline font-medium"
            >
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}