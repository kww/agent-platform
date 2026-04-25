import axios, { AxiosInstance, AxiosError } from 'axios';
import type { 
  Workflow, 
  Execution, 
  Step, 
  Tool,
  ApiResponse,
  ExecutionEvent 
} from '@/types';

// 创建axios实例
const apiClient: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
apiClient.interceptors.request.use(
  (config) => {
    // 可以在这里添加认证token
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
apiClient.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error: AxiosError<ApiResponse<any>>) => {
    const message = error.response?.data?.error || error.message || '请求失败';
    console.error('API Error:', message);
    return Promise.reject(new Error(message));
  }
);

// 工作流API
export const workflowApi = {
  // 获取所有工作流
  getAll: (): Promise<Workflow[]> => 
    apiClient.get('/workflows'),

  // 获取单个工作流
  getById: (id: string): Promise<Workflow> => 
    apiClient.get(`/workflows/${id}`),

  // 验证工作流配置
  validate: (workflowId: string, tasksYmlPath: string): Promise<{ valid: boolean; errors?: string[] }> => 
    apiClient.post('/validate-tasks', { workflowId, tasksYmlPath }),
};

// 执行API
export const executionApi = {
  // 执行工作流
  execute: (params: { 
    workflow: string; 
    inputs?: Record<string, any>; 
    workdir?: string;
    options?: Record<string, any>;
  }): Promise<{ executionId: string; status: string; workflow: string }> => 
    apiClient.post('/execute', params),

  // 获取执行状态
  getStatus: (executionId: string): Promise<Execution> => 
    apiClient.get(`/executions/${executionId}`),

  // 停止执行
  stop: (executionId: string): Promise<{ success: boolean; status: string }> => 
    apiClient.post(`/executions/${executionId}/stop`, {}),

  // 暂停执行
  pause: (executionId: string): Promise<{ success: boolean; status: string }> => 
    apiClient.post(`/executions/${executionId}/pause`, {}),

  // 恢复执行
  resume: (executionId: string): Promise<{ success: boolean; status: string }> => 
    apiClient.post(`/executions/${executionId}/resume`, {}),

  // 重试执行
  retry: (executionId: string): Promise<{ success: boolean; executionId: string }> => 
    apiClient.post(`/executions/${executionId}/retry`, {}),

  // 重试单个步骤
  retryStep: (executionId: string, stepId: string): Promise<{ success: boolean; message: string }> => 
    apiClient.post(`/executions/${executionId}/steps/${stepId}/retry`, {}),

  // 删除执行记录
  delete: (executionId: string): Promise<{ success: boolean; message: string }> => 
    apiClient.delete(`/executions/${executionId}`),

  // 获取执行列表（通过扫描工作目录）
  getAll: async (): Promise<Execution[]> => {
    // 这里需要后端支持获取所有执行记录
    // 暂时返回空数组，后续可以通过后端API获取
    return [];
  },
};

// 步骤API
export const stepApi = {
  // 获取所有步骤
  getAll: (): Promise<Step[]> => 
    apiClient.get('/steps'),

  // 获取单个步骤
  getById: (id: string): Promise<Step> => 
    apiClient.get(`/steps/${id}`),
};

// 工具API
export const toolApi = {
  // 获取所有工具
  getAll: (): Promise<Tool[]> => 
    apiClient.get('/tools'),

  // 获取单个工具
  getById: (id: string): Promise<Tool> => 
    apiClient.get(`/tools/${id}`),
};

// 健康检查
export const healthApi = {
  check: (): Promise<{ status: string; version?: string }> => 
    apiClient.get('/health'),
};

// WebSocket事件订阅（用于实时更新）
export class ExecutionEventSource {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, ((event: ExecutionEvent) => void)[]> = new Map();

  connect(executionId: string) {
    // 如果后端支持SSE，可以使用EventSource
    // 这里作为演示，使用轮询方式
    this.startPolling(executionId);
  }

  private startPolling(executionId: string) {
    const poll = async () => {
      try {
        const status = await executionApi.getStatus(executionId);
        const listeners = this.listeners.get(executionId) || [];
        listeners.forEach(callback => {
          callback({
            type: 'status_update',
            executionId,
            workflow: status.workflow || '',
            timestamp: new Date().toISOString(),
            data: status,
          });
        });

        // 如果还在运行中，继续轮询
        if (['running', 'pending', 'paused'].includes(status.status)) {
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error('Polling error:', error);
        setTimeout(poll, 5000);
      }
    };

    poll();
  }

  subscribe(executionId: string, callback: (event: ExecutionEvent) => void) {
    if (!this.listeners.has(executionId)) {
      this.listeners.set(executionId, []);
    }
    this.listeners.get(executionId)!.push(callback);
  }

  unsubscribe(executionId: string, callback: (event: ExecutionEvent) => void) {
    const listeners = this.listeners.get(executionId);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  disconnect() {
    // 清理所有轮询
    this.listeners.clear();
  }
}

export default apiClient;
