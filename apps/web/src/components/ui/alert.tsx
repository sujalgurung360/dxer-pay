'use client';

import { HTMLAttributes } from 'react';

export function Alert({
  className = '',
  variant = 'default',
  children,
  ...props
}: { variant?: 'default' | 'destructive' } & HTMLAttributes<HTMLDivElement>) {
  const variants: Record<string, string> = {
    default: 'border-gray-200 bg-gray-50 text-gray-900',
    destructive: 'border-red-200 bg-red-50 text-red-900',
  };
  return (
    <div
      role="alert"
      className={`rounded-lg border p-4 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function AlertTitle({ className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h5 className={`font-semibold mb-1 ${className}`} {...props} />;
}

export function AlertDescription({
  className = '',
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`text-sm opacity-90 ${className}`} {...props} />;
}
