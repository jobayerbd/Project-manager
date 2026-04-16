import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps {
  children?: React.ReactNode;
  className?: string;
  onClick?: (e: any) => void;
}

export function Card({ children, className, onClick, ...props }: CardProps) {
  return (
    <div 
      className={cn("glass-card p-6", className)} 
      onClick={onClick}
      {...(props as any)}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, className, ...props }: CardProps) {
  return (
    <h3 className={cn("text-lg font-semibold mb-4", className)} {...(props as any)}>
      {children}
    </h3>
  );
}
