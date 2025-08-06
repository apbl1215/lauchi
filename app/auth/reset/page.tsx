'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseBrowser } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { isValidEmail, isValidPassword } from '@/lib/utils'
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react'

interface ResetErrors {
  email?: string
  password?: string
  confirmPassword?: string
  otp?: string
  general?: string
}

type ResetStep = 'email' | 'verify-otp' | 'new-password' | 'success'

export default function ResetPasswordPage() {
  const [step, setStep] = useState<ResetStep>('email')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<ResetErrors>({})
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const router = useRouter()
  const supabase = createSupabaseBrowser()

  const handleSendResetEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email) {
      setErrors({ email: 'Email is required' })
      return
    }

    if (!isValidEmail(email)) {
      setErrors({ email: 'Please enter a valid email address' })
      return
    }

    setLoading(true)
    setErrors({})

    try {
      // Send OTP for password reset
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false // Don't create user if doesn't exist
        }
      })

      if (error) {
        if (error.message.includes('not found') || error.message.includes('invalid')) {
          setErrors({ email: 'No account found with this email address' })
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
      setErrors({ otp: 'Please enter the verification code' })
      return
    }

    if (otpCode.length !== 6) {
      setErrors({ otp: 'Verification code must be 6 digits' })
      return
    }

    setLoading(true)
    setErrors({})

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: 'recovery'
      })

      if (error) {
        if (error.message.includes('expired')) {
          setErrors({ otp: 'Verification code has expired. Please request a new one.' })
        } else if (error.message.includes('invalid')) {
          setErrors({ otp: 'Invalid verification code. Please check and try again.' })
        } else {
          setErrors({ general: error.message })
        }
        return
      }

      setStep('new-password')
    } catch (err) {
      setErrors({ general: 'An unexpected error occurred. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const passwordValidation = isValidPassword(newPassword)
    if (!passwordValidation.isValid) {
      setErrors({ password: passwordValidation.errors[0] })
      return
    }

    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: 'Passwords do not match' })
      return
    }

    setLoading(true)
    setErrors({})

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) {
        setErrors({ general: error.message })
        return
      }

      setStep('success')
    } catch (err) {
      setErrors({ general: 'An unexpected error occurred. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  const handleResendOtp = async () => {
    setResendLoading(true)
    setErrors({})

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false
        }
      })

      if (error) {
        setErrors({ general: 'Failed to resend code. Please try again.' })
      } else {
        setErrors({ general: 'New verification code sent!' })
        setTimeout(() => setErrors({}), 3000)
      }
    } catch (err) {
      setErrors({ general: 'Failed to resend code. Please try again.' })
    } finally {
      setResendLoading(false)
    }
  }

  // Success Step
  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Password Updated!
            </CardTitle>
            <CardDescription className="text-gray-600">
              Your password has been successfully updated.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Button
              onClick={() => router.push('/auth/login')}
              className="w-full"
              variant="gradient"
            >
              Sign In Now
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // New Password Step
  if (step === 'new-password') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold text-gray-900">
              Create New Password
            </CardTitle>
            <CardDescription className="text-gray-600">
              Enter a strong password to secure your account
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {errors.general && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="h-4 w-4" />
                {errors.general}
              </div>
            )}

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                label="New Password"
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
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setErrors(prev => ({ ...prev, password: undefined }))
                }}
                error={errors.password}
                disabled={loading}
              />

              <Input
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
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
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setErrors(prev => ({ ...prev, confirmPassword: undefined }))
                }}
                error={errors.confirmPassword}
                disabled={loading}
              />

              <Button
                type="submit"
                loading={loading}
                className="w-full"
                variant="gradient"
              >
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  // OTP Verification Step
  if (step === 'verify-otp') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold text-gray-900">
              Check Your Email
            </CardTitle>
            <CardDescription className="text-gray-600">
              We've sent a 6-digit code to<br />
              <span className="font-medium text-blue-600">{email}</span>
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {errors.general && (
              <div className={`flex items-center gap-2 p-3 text-sm rounded-md ${
                errors.general.includes('sent!') 
                  ? 'text-green-700 bg-green-50 border border-green-200' 
                  : 'text-red-700 bg-red-50 border border-red-200'
              }`}>
                {errors.general.includes('sent!') ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                {errors.general}
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
                  setErrors(prev => ({ ...prev, otp: undefined }))
                }}
                error={errors.otp}
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
                Verify Code
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
                onClick={() => setStep('email')}
                variant="ghost"
                className="text-sm"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
              >
                Back to email
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Email Input Step (Default)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Reset Your Password
          </CardTitle>
          <CardDescription className="text-gray-600">
            Enter your email address and we'll send you a verification code
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {errors.general && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-4 w-4" />
              {errors.general}
            </div>
          )}

          <form onSubmit={handleSendResetEmail} className="space-y-4">
            <Input
              type="email"
              placeholder="Enter your email"
              label="Email Address"
              leftIcon={<Mail className="h-4 w-4" />}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setErrors(prev => ({ ...prev, email: undefined }))
              }}
              error={errors.email}
              disabled={loading}
            />

            <Button
              type="submit"
              loading={loading}
              className="w-full"
              variant="gradient"
            >
              Send Verification Code
            </Button>
          </form>

          <div className="text-center space-y-2">
            <p className="text-sm text-gray-600">
              Remember your password?
            </p>
            <Link
              href="/auth/login"
              className="text-blue-600 hover:text-blue-700 hover:underline font-medium text-sm"
            >
              Back to Sign In
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}