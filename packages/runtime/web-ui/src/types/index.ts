// 工作流类型
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  version?: string;
  steps: WorkflowStep[];
  inputs?: WorkflowInput[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  description?: string;
  dependsOn?: string[];
  config?: Record<string, any>;
}

export interface WorkflowInput {
  name: string;
  type: string;
  required?: boolean;
  default?: any;
  description?: string;
}

// 执行类型
export interface Execution {
  executionId: string;
  workflow: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  progress?: number;
  steps: Record<string, StepExecution>;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  error?: string;
}

export type ExecutionStatus = 
  | 'pending' 
  | 'running' 
  | 'completed' 
  | 'failed' 
  | 'stopped' 
  | 'paused';

export interface StepExecution {
  status: ExecutionStatus;
  startedAt?: string;
  completedAt?: string;
  output?: any;
  error?: string;
  logs?: string[];
}

// 步骤类型
export interface Step {
  id: string;
  name: string;
  description?: string;
  handler?: string;
  type?: string;
}

// 工具类型
export interface Tool {
  id: string;
  name: string;
  description?: string;
  type: string;
  config?: Record<string, any>;
}

// API响应类型
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// 事件类型
export interface ExecutionEvent {
  type: string;
  executionId: string;
  workflow: string;
  timestamp: string;
  data?: Record<string, any>;
}
