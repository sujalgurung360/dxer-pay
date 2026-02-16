'use client';

import { ButtonHTMLAttributes, forwardRef, isValidElement } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', disabled, asChild, children, ...props }, ref) => {
    if (asChild && children && typeof children === 'object' && isValidElement(children)) {
      return <>{children}</>;
    }
    const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
    const variants: Record<string, string> = {
      primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
      secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-400',
      outline: 'border border-gray-300 bg-transparent hover:bg-gray-50 focus:ring-gray-400',
      ghost: 'hover:bg-gray-100 focus:ring-gray-400',
      destructive: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    };
    const sizes: Record<string, string> = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };
    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
export { Button };
