/**
 * 能力缺失分析 CLI
 *
 * 利用现有 Prometheus 指标分析任务执行失败
 *
 * 数据来源：
 * - metrics-listener.ts 的 workflowFailed / stepFailed 指标
 *
 * 用法：
 *   openclaw capability analyze --hours 24
 */

import { register } from './metrics-listener';

// ============================================
// 类型定义
// ============================================

export interface CapabilityGapReport {
  generatedAt: string;
  periodHours: number;
  
  workflowFailures: {
    workflowId: string;
    workflowName: string;
    errorType: string;
    count: number;
  }[];
  
  stepFailures: {
    workflowId: string;
    stepId: string;
    stepName: string;
    errorType: string;
    count: number;
  }[];
  
  summary: {
    totalWorkflowFailures: number;
    totalStepFailures: number;
    executionErrors: number;  // 可能的能力缺失
  };
}

// ============================================
// 分析函数
// ============================================

/**
 * 从 Prometheus 注册表提取 Counter 数据
 */
function getCounterValues(metricName: string): Array<{
  labels: Record<string, string>;
  value: number;
}> {
  try {
    const metric = register.getSingleMetric(metricName);
    if (!metric) return [];
    
    const results: Array<{ labels: Record<string, string>; value: number }> = [];
    const hashMap = (metric as any).hashMap || {};
    
    for (const key of Object.keys(hashMap)) {
      const item = hashMap[key];
      results.push({
        labels: item?.labels || {},
        value: parseFloat(item?.value || 0),
      });
    }
    
    return results;
  } catch {
    return [];
  }
}

/**
 * 分析能力缺失
 */
export function analyzeCapabilityGaps(): CapabilityGapReport {
  const workflowFailedValues = getCounterValues('workflow_failed_total');
  const stepFailedValues = getCounterValues('step_failed_total');
  
  // 处理 Workflow 失败
  const workflowFailures = workflowFailedValues
    .filter(v => v.value > 0)
    .map(v => ({
      workflowId: v.labels.workflow_id || 'unknown',
      workflowName: v.labels.workflow_name || 'unknown',
      errorType: v.labels.error_type || 'unknown',
      count: v.value,
    }));
  
  // 处理 Step 失败
  const stepFailures = stepFailedValues
    .filter(v => v.value > 0)
    .map(v => ({
      workflowId: v.labels.workflow_id || 'unknown',
      stepId: v.labels.step_id || 'unknown',
      stepName: v.labels.step_name || 'unknown',
      errorType: v.labels.error_type || 'unknown',
      count: v.value,
    }));
  
  // 统计执行错误（可能的能力缺失）
  const executionErrors = workflowFailures
    .filter(f => f.errorType === 'execution_error' || f.errorType === 'unknown')
    .reduce((sum, f) => sum + f.count, 0);
  
  return {
    generatedAt: new Date().toISOString(),
    periodHours: 24,  // Prometheus 默认采集周期
    
    workflowFailures,
    stepFailures,
    
    summary: {
      totalWorkflowFailures: workflowFailures.reduce((sum, f) => sum + f.count, 0),
      totalStepFailures: stepFailures.reduce((sum, f) => sum + f.count, 0),
      executionErrors,
    },
  };
}

/**
 * 生成文本报告
 */
export function generateCapabilityReport(report: CapabilityGapReport): string {
  const lines: string[] = [];
  
  lines.push('# Capability Gap Report');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Period: ${report.periodHours}h`);
  lines.push('');
  
  // 汇总
  lines.push('## Summary');
  lines.push(`- Workflow Failures: ${report.summary.totalWorkflowFailures}`);
  lines.push(`- Step Failures: ${report.summary.totalStepFailures}`);
  lines.push(`- Execution Errors (potential gaps): ${report.summary.executionErrors}`);
  lines.push('');
  
  // Workflow 失败详情
  if (report.workflowFailures.length > 0) {
    lines.push('## Workflow Failures');
    lines.push('');
    lines.push('| Workflow | Error Type | Count |');
    lines.push('|----------|------------|:-----:|');
    
    for (const f of report.workflowFailures) {
      lines.push(`| ${f.workflowName} | ${f.errorType} | ${f.count} |`);
    }
    lines.push('');
  }
  
  // Step 失败详情
  if (report.stepFailures.length > 0) {
    lines.push('## Step Failures');
    lines.push('');
    lines.push('| Step | Workflow | Error Type | Count |');
    lines.push('|------|----------|------------|:-----:|');
    
    for (const f of report.stepFailures) {
      lines.push(`| ${f.stepName} | ${f.workflowId} | ${f.errorType} | ${f.count} |`);
    }
    lines.push('');
  }
  
  // 建议
  if (report.summary.executionErrors > 5) {
    lines.push('## ⚠️ Potential Capability Gaps');
    lines.push('');
    lines.push(`Detected ${report.summary.executionErrors} execution errors.`);
    lines.push('管理员请检查是否需要新增 Workflow。');
  } else if (report.summary.executionErrors > 0) {
    lines.push('## ℹ️ Minor Execution Errors');
    lines.push('');
    lines.push(`Detected ${report.summary.executionErrors} execution errors.`);
    lines.push('数量较少，暂不需要新增 Workflow。');
  } else {
    lines.push('## ✅ No Capability Gaps Detected');
  }
  
  return lines.join('\n');
}

/**
 * CLI 入口
 */
export async function runCapabilityAnalyze(): Promise<string> {
  const report = analyzeCapabilityGaps();
  return generateCapabilityReport(report);
}