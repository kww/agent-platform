/**
 * 本地数据源适配器
 * 
 * 复用现有模块的数据，避免重复 HTTP 查询
 * 
 * 数据来源：
 * - Prometheus 指标注册表（内存）
 * - ProgressTracker（步骤状态）
 * - TokenTracker（Token 使用）
 */

import { register } from './metrics-listener';

// 类型定义
export interface LocalWorkflowMetrics {
  workflowId: string;
  timestamp: string;
  
  duration?: {
    p50: number;
    p90: number;
    p99: number;
    avg: number;
    samples: number;
  };
  
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  
  steps?: {
    total: number;
    completed: number;
    failed: number;
    cached: number;
  };
  
  successRate?: number;
}

/**
 * 从 Prometheus 注册表获取直方图数据
 */
function getHistogramValues(metricName: string, labelFilter: Record<string, string>): number[] {
  try {
    const metric = register.getSingleMetric(metricName);
    if (!metric) return [];
    
    const values: number[] = [];
    const hashMap = (metric as any).hashMap || {};
    
    for (const key of Object.keys(hashMap)) {
      const item = hashMap[key];
      
      // 检查标签匹配
      if (labelFilter) {
        const labels = item?.labels || {};
        let match = true;
        for (const [k, v] of Object.entries(labelFilter)) {
          if (labels[k] !== v) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }
      
      const value = parseFloat(item?.value || 0);
      if (value > 0) {
        values.push(value * 1000); // 转换为毫秒
      }
    }
    
    return values;
  } catch {
    return [];
  }
}

/**
 * 从 Prometheus 注册表获取计数器值
 */
function getCounterValue(metricName: string, labels: Record<string, string>): number {
  try {
    const metric = register.getSingleMetric(metricName);
    if (!metric) return 0;
    
    const hashMap = (metric as any).hashMap || {};
    
    for (const key of Object.keys(hashMap)) {
      const item = hashMap[key];
      const itemLabels = item?.labels || {};
      
      let match = true;
      for (const [k, v] of Object.entries(labels)) {
        if (itemLabels[k] !== v) {
          match = false;
          break;
        }
      }
      
      if (match) {
        return parseFloat(item?.value || 0);
      }
    }
    
    return 0;
  } catch {
    return 0;
  }
}

/**
 * 计算百分位数
 */
function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

/**
 * 获取本地工作流指标
 */
export function getLocalWorkflowMetrics(workflowId: string): LocalWorkflowMetrics {
  const result: LocalWorkflowMetrics = {
    workflowId,
    timestamp: new Date().toISOString(),
  };
  
  // 1. 获取耗时数据
  const durations = getHistogramValues('workflow_duration_seconds', { workflow_id: workflowId });
  
  if (durations.length > 0) {
    result.duration = {
      p50: calculatePercentile(durations, 50),
      p90: calculatePercentile(durations, 90),
      p99: calculatePercentile(durations, 99),
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      samples: durations.length,
    };
  }
  
  // 2. 获取 Token 数据
  const inputTokens = getCounterValue('token_usage_total', { 
    workflow_id: workflowId, 
    type: 'input' 
  });
  const outputTokens = getCounterValue('token_usage_total', { 
    workflow_id: workflowId, 
    type: 'output' 
  });
  
  if (inputTokens > 0 || outputTokens > 0) {
    result.tokens = {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens,
    };
  }
  
  // 3. 获取步骤统计
  const stepsCompleted = getCounterValue('step_completed_total', { workflow_id: workflowId });
  const stepsFailed = getCounterValue('step_failed_total', { workflow_id: workflowId });
  const stepsCached = getCounterValue('step_cached_total', { workflow_id: workflowId });
  
  if (stepsCompleted > 0 || stepsFailed > 0) {
    result.steps = {
      total: stepsCompleted + stepsFailed,
      completed: stepsCompleted,
      failed: stepsFailed,
      cached: stepsCached,
    };
  }
  
  // 4. 计算成功率
  const workflowCompleted = getCounterValue('workflow_completed_total', { workflow_id: workflowId });
  const workflowStarted = getCounterValue('workflow_started_total', { workflow_id: workflowId });
  
  if (workflowStarted > 0) {
    result.successRate = workflowCompleted / workflowStarted;
  }
  
  return result;
}

/**
 * 获取所有工作流的指标
 */
export function getAllWorkflowMetrics(): Map<string, LocalWorkflowMetrics> {
  const result = new Map<string, LocalWorkflowMetrics>();
  
  try {
    // 从注册表获取所有工作流 ID
    const startedMetric = register.getSingleMetric('workflow_started_total');
    if (!startedMetric) return result;
    
    const hashMap = (startedMetric as any).hashMap || {};
    const workflowIds = new Set<string>();
    
    for (const key of Object.keys(hashMap)) {
      const item = hashMap[key];
      const workflowId = item?.labels?.workflow_id;
      if (workflowId) {
        workflowIds.add(workflowId);
      }
    }
    
    // 获取每个工作流的指标
    for (const workflowId of workflowIds) {
      result.set(workflowId, getLocalWorkflowMetrics(workflowId));
    }
  } catch {
    // 忽略错误
  }
  
  return result;
}

/**
 * 检查本地数据是否可用
 */
export function isLocalDataAvailable(): boolean {
  try {
    const metric = register.getSingleMetric('workflow_started_total');
    return metric !== undefined;
  } catch {
    return false;
  }
}

/**
 * 步骤成功率统计
 */
export interface StepSuccessRate {
  stepId: string;
  stepName?: string;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  cached: number;
  successRate: number;
  avgDuration?: number;
}

/**
 * 获取步骤成功率统计（按 step_id 分组）
 * 
 * 复用 Prometheus 指标：
 * - step_started_total
 * - step_completed_total
 * - step_failed_total
 * - step_skipped_total
 * - step_cached_total
 * - step_duration_seconds
 */
export function getStepSuccessRate(workflowId?: string): StepSuccessRate[] {
  const result: StepSuccessRate[] = [];
  const stepStats = new Map<string, {
    started: number;
    completed: number;
    failed: number;
    skipped: number;
    cached: number;
    durations: number[];
    name?: string;
  }>();
  
  try {
    // 1. 收集 started 数据
    const startedMetric = register.getSingleMetric('step_started_total');
    if (startedMetric) {
      const hashMap = (startedMetric as any).hashMap || {};
      for (const key of Object.keys(hashMap)) {
        const item = hashMap[key];
        const labels = item?.labels || {};
        
        // 过滤 workflow_id
        if (workflowId && labels.workflow_id !== workflowId) continue;
        
        const stepId = labels.step_id;
        if (!stepId) continue;
        
        const value = parseFloat(item?.value || 0);
        if (!stepStats.has(stepId)) {
          stepStats.set(stepId, { started: 0, completed: 0, failed: 0, skipped: 0, cached: 0, durations: [], name: labels.step_name });
        }
        stepStats.get(stepId)!.started += value;
      }
    }
    
    // 2. 收集 completed 数据
    const completedMetric = register.getSingleMetric('step_completed_total');
    if (completedMetric) {
      const hashMap = (completedMetric as any).hashMap || {};
      for (const key of Object.keys(hashMap)) {
        const item = hashMap[key];
        const labels = item?.labels || {};
        
        if (workflowId && labels.workflow_id !== workflowId) continue;
        
        const stepId = labels.step_id;
        if (!stepId) continue;
        
        const value = parseFloat(item?.value || 0);
        if (!stepStats.has(stepId)) {
          stepStats.set(stepId, { started: 0, completed: 0, failed: 0, skipped: 0, cached: 0, durations: [], name: labels.step_name });
        }
        stepStats.get(stepId)!.completed += value;
      }
    }
    
    // 3. 收集 failed 数据
    const failedMetric = register.getSingleMetric('step_failed_total');
    if (failedMetric) {
      const hashMap = (failedMetric as any).hashMap || {};
      for (const key of Object.keys(hashMap)) {
        const item = hashMap[key];
        const labels = item?.labels || {};
        
        if (workflowId && labels.workflow_id !== workflowId) continue;
        
        const stepId = labels.step_id;
        if (!stepId) continue;
        
        const value = parseFloat(item?.value || 0);
        if (!stepStats.has(stepId)) {
          stepStats.set(stepId, { started: 0, completed: 0, failed: 0, skipped: 0, cached: 0, durations: [], name: labels.step_name });
        }
        stepStats.get(stepId)!.failed += value;
      }
    }
    
    // 4. 收集 skipped 数据
    const skippedMetric = register.getSingleMetric('step_skipped_total');
    if (skippedMetric) {
      const hashMap = (skippedMetric as any).hashMap || {};
      for (const key of Object.keys(hashMap)) {
        const item = hashMap[key];
        const labels = item?.labels || {};
        
        if (workflowId && labels.workflow_id !== workflowId) continue;
        
        const stepId = labels.step_id;
        if (!stepId) continue;
        
        const value = parseFloat(item?.value || 0);
        if (!stepStats.has(stepId)) {
          stepStats.set(stepId, { started: 0, completed: 0, failed: 0, skipped: 0, cached: 0, durations: [], name: labels.step_name });
        }
        stepStats.get(stepId)!.skipped += value;
      }
    }
    
    // 5. 收集 cached 数据
    const cachedMetric = register.getSingleMetric('step_cached_total');
    if (cachedMetric) {
      const hashMap = (cachedMetric as any).hashMap || {};
      for (const key of Object.keys(hashMap)) {
        const item = hashMap[key];
        const labels = item?.labels || {};
        
        if (workflowId && labels.workflow_id !== workflowId) continue;
        
        const stepId = labels.step_id;
        if (!stepId) continue;
        
        const value = parseFloat(item?.value || 0);
        if (!stepStats.has(stepId)) {
          stepStats.set(stepId, { started: 0, completed: 0, failed: 0, skipped: 0, cached: 0, durations: [], name: labels.step_name });
        }
        stepStats.get(stepId)!.cached += value;
      }
    }
    
    // 6. 收集 duration 数据
    const durationMetric = register.getSingleMetric('step_duration_seconds');
    if (durationMetric) {
      const hashMap = (durationMetric as any).hashMap || {};
      for (const key of Object.keys(hashMap)) {
        const item = hashMap[key];
        const labels = item?.labels || {};
        
        if (workflowId && labels.workflow_id !== workflowId) continue;
        
        const stepId = labels.step_id;
        if (!stepId) continue;
        
        const value = parseFloat(item?.value || 0);
        if (!stepStats.has(stepId)) {
          stepStats.set(stepId, { started: 0, completed: 0, failed: 0, skipped: 0, cached: 0, durations: [], name: labels.step_name });
        }
        stepStats.get(stepId)!.durations.push(value * 1000); // 转为毫秒
      }
    }
    
    // 7. 计算成功率
    for (const [stepId, stats] of stepStats) {
      const total = stats.started - stats.skipped; // 跳过的不计入总数
      const successRate = total > 0 ? stats.completed / total : 0;
      const avgDuration = stats.durations.length > 0 
        ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length 
        : undefined;
      
      result.push({
        stepId,
        stepName: stats.name,
        total,
        completed: stats.completed,
        failed: stats.failed,
        skipped: stats.skipped,
        cached: stats.cached,
        successRate,
        avgDuration,
      });
    }
    
    // 按成功率排序（成功率低的排前面，便于发现问题）
    result.sort((a, b) => a.successRate - b.successRate);
  } catch {
    // 忽略错误
  }
  
  return result;
}

/**
 * 获取指标摘要（用于调试）
 */
export function getMetricsSummary(): Record<string, number> {
  const summary: Record<string, number> = {};
  
  try {
    const metrics = register.getMetricsAsArray();
    
    for (const metric of metrics) {
      const name = metric.name;
      const hashMap = (metric as any).hashMap || {};
      
      let total = 0;
      for (const key of Object.keys(hashMap)) {
        total += parseFloat(hashMap[key]?.value || 0);
      }
      
      summary[name] = total;
    }
  } catch {
    // 忽略错误
  }
  
  return summary;
}