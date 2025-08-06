import * as React from 'react'
import { cn } from '@/lib/utils'

export interface LayoutShellProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  sidebar?: React.ReactNode
  header?: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  centered?: boolean
}

const LayoutShell = React.forwardRef<HTMLDivElement, LayoutShellProps>(
  ({ 
    children, 
    sidebar, 
    header, 
    footer, 
    maxWidth = 'full', 
    centered = false, 
    className, 
    ...props 
  }, ref) => {
    const maxWidthClasses = {
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-4xl',
      xl: 'max-w-6xl',
      '2xl': 'max-w-7xl',
      full: 'max-w-full'
    }

    return (
      <div
        ref={ref}
        className={cn(
          'min-h-screen bg-gray-50',
          className
        )}
        {...props}
      >
        {/* Header */}
        {header && (
          <header className="sticky top-0 z-40 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className={cn(
              'container mx-auto px-4',
              maxWidthClasses[maxWidth]
            )}>
              {header}
            </div>
          </header>
        )}

        {/* Main Content Area */}
        <div className={cn(
          'flex flex-1',
          maxWidthClasses[maxWidth],
          centered && 'mx-auto'
        )}>
          {/* Sidebar */}
          {sidebar && (
            <aside className="w-64 border-r bg-white p-6 hidden lg:block">
              {sidebar}
            </aside>
          )}

          {/* Main Content */}
          <main className={cn(
            'flex-1 p-6',
            sidebar && 'lg:ml-0'
          )}>
            {children}
          </main>
        </div>

        {/* Footer */}
        {footer && (
          <footer className="border-t bg-white">
            <div className={cn(
              'container mx-auto px-4 py-6',
              maxWidthClasses[maxWidth]
            )}>
              {footer}
            </div>
          </footer>
        )}
      </div>
    )
  }
)
LayoutShell.displayName = 'LayoutShell'

export { LayoutShell }