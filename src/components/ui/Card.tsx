import React from 'react';
import { cn } from '../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  onClick?: any;
  key?: any;
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
