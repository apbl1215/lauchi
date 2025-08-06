export interface PaymentPlan {
  id: string
  name: string
  price: number
  currency: 'PHP' | 'USD'
  interval: 'monthly' | 'yearly'
  features: string[]
}

export interface PaymentSession {
  id: string
  userId: string
  planId: string
  amount: number
  currency: string
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
  paymongoPaymentIntentId?: string
  paymongoPaymentMethodId?: string
  createdAt: Date
  completedAt?: Date
}

export interface PayMongoWebhookEvent {
  id: string
  type: string
  data: {
    id: string
    type: string
    attributes: Record<string, any>
  }
}

export const PAYMENT_PLANS: PaymentPlan[] = [
  {
    id: 'basic_monthly',
    name: 'Basic Monthly',
    price: 499,
    currency: 'PHP',
    interval: 'monthly',
    features: [
      '5 generations per day',
      '20,000 words per file',
      'Export to PDF/CSV',
      'Email support'
    ]
  },
  {
    id: 'pro_monthly',
    name: 'Pro Monthly',
    price: 1499,
    currency: 'PHP',
    interval: 'monthly',
    features: [
      '20 generations per day',
      '50,000 words per file',
      'All export formats',
      'Priority support',
      'API access'
    ]
  }
]