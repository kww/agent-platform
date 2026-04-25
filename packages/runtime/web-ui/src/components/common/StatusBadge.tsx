import React from 'react';
import { ExecutionStatus } from '@/types';

interface StatusBadgeProps {
  status: ExecutionStatus;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<ExecutionStatus, { label: string; className: string; dotClass: string }> = {
  pending: {
    label: '等待中',
    className: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    dotClass: 'bg-yellow-500',
  },
  running: {
    label: '运行中',
    className: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500 animate-pulse',
  },
  completed: {
    label: '已完成',
    className: 'bg-green-50 text-green-700 border-green-200',
    dotClass: 'bg-green-500',
  },
  failed: {
    label: '失败',
    className: 'bg-red-50 text-red-700 border-red-200',
    dotClass: 'bg-red-500',
  },
  stopped: {
    label: '已停止',
    className: 'bg-gray-50 text-gray-700 border-gray-200',
    dotClass: 'bg-gray-500',
  },
  paused: {
    label: '已暂停',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    dotClass: 'bg-orange-500',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const config = statusConfig[status];
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };
  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${config.className} ${sizeClasses[size]}`}
    >
      <span className={`rounded-full ${config.dotClass} ${dotSizes[size]}`} />
      {config.label}
    </span>
  );
};
