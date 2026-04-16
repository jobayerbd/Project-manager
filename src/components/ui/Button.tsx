import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ButtonProps {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  className?: string;
  onClick?: (e: any) => void;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}

export function Button({ 
  children, 
  variant = 'primary', 
  loading, 
  className, 
  disabled, 
  type = 'button',
  onClick,
  ...props 
}: ButtonProps) {
  const variants = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'bg-red-600 text-white px-4 py-2 rounded-lg font-medium transition-all hover:bg-red-700 active:scale-95'
  };

  return (
    <button
      type={type}
      className={cn(variants[variant], className, "flex items-center justify-center gap-2 cursor-pointer")}
      disabled={disabled || loading}
      onClick={onClick}
      {...(props as any)}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}
