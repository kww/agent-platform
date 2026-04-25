import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingState: React.FC<LoadingStateProps> = ({ 
  message = '加载中...',
  size = 'md'
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className={`${sizeClasses[size]} text-primary-600 animate-spin mb-4`} />
      <p className={`${textSizes[size]} text-gray-600`}>{message}</p>
    </div>
  );
};
