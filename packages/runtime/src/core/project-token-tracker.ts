/**
 * 项目级别 Token 统计
 * 
 * 功能：
 * - 累计项目所有工作流的 token 消耗
 * - 按工作流类型分类统计（开发/迭代/bugfix等）
 * - 记录每次执行的详细信息
 * - 提供查询接口
 */

import * as fs from 'fs';
import * as path from 'path';
import { MODEL_TOKEN_LIMITS } from './token-tracker';

// ============================================
// 类型定义
// ============================================

export interface TokenUsageRecord {
  executionId: string;
  workflowId: string;
  workflowType: 'development' | 'iteration' | 'bugfix' | 'planning' | 'release' | 'other';
  timestamp: number;
  duration: number;
  model: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  steps: Array<{
    stepId: string;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
  }>;
}

export interface WorkflowTypeStats {
  count: number;           // 执行次数
  totalTokens: number;     // 总 token
  inputTokens: number;     // 总输入 token
  outputTokens: number;    // 总输出 token
  avgTokensPerExecution: number;  // 平均每次执行
  avgDuration: number;     // 平均执行时间（毫秒）
}

export interface ProjectTokenStats {
  projectId: string;
  projectName: string;
  createdAt: number;
  updatedAt: number;
  
  // 总计
  totalExecutions: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDuration: number;
  
  // 按工作流类型统计
  byWorkflowType: Record<string, WorkflowTypeStats>;
  
  // 按模型统计
  byModel: Record<string, {
    count: number;
    totalTokens: number;
  }>;
  
  // 最近执行记录
  recentExecutions: TokenUsageRecord[];
  
  // 步骤统计（跨所有执行）
  stepStats: Record<string, {
    count: number;
    totalTokens: number;
    avgTokens: number;
  }>;
}

export interface ProjectTokenTrackerOptions {
  projectPath: string;
  projectName?: string;
  maxRecentExecutions?: number;  // 保留最近 N 次执行记录
}

// ============================================
// 上下文管理
// ============================================

export interface ContextUsage {
  currentModel: string;           // 当前使用的模型
  contextLimit: number;           // 上下文限制
  projectTokensUsed: number;      // 项目累计 token
  currentExecutionTokens: number; // 当前执行已用 token
  totalUsed: number;              // 总计已用
  effectiveRemaining: number;     // 剩余可用上下文
  percentage: number;             // 占用百分比
  status: 'normal' | 'warning' | 'critical' | 'exceeded';
  suggestion: string;             // 智能建议
}

export interface ContextSuggestion {
  action: 'continue' | 'compress' | 'switch_model' | 'reduce_history';
  reason: string;
  recommendedModel?: string;
  compressThreshold?: number;
}

/**
 * 上下文占用阈值
 */
export const CONTEXT_THRESHOLDS = {
  normal: 50,      // < 50% 正常
  warning: 70,     // 50-70% 警告
  critical: 85,    // 70-85% 严重
  // > 85% 超限
};

// ============================================
// 工作流类型映射
// ============================================

const WORKFLOW_TYPE_MAP: Record<string, TokenUsageRecord['workflowType']> = {
  'wf-full': 'development',
  'wf-planning': 'planning',
  'wf-continue': 'development',
  'wf-iterate': 'iteration',
  'wf-bugfix': 'bugfix',
  'wf-quick': 'development',
  'wf-patch': 'bugfix',
  'wf-release': 'release',
};

function getWorkflowType(workflowId: string): TokenUsageRecord['workflowType'] {
  return WORKFLOW_TYPE_MAP[workflowId] || 'other';
}

// ============================================
// 项目 Token 追踪器
// ============================================

export class ProjectTokenTracker {
  private projectPath: string;
  private projectName: string;
  private maxRecentExecutions: number;
  private statsPath: string;
  private stats: ProjectTokenStats;

  constructor(options: ProjectTokenTrackerOptions) {
    this.projectPath = options.projectPath;
    this.projectName = options.projectName || path.basename(options.projectPath);
    this.maxRecentExecutions = options.maxRecentExecutions || 50;
    
    // 存储路径
    const agentDir = path.join(options.projectPath, '.agent-runtime');
    this.statsPath = path.join(agentDir, 'token-usage.json');
    
    // 加载或创建统计
    this.stats = this.loadOrCreate();
  }

  // ============================================
  // 加载/保存
  // ============================================

  private loadOrCreate(): ProjectTokenStats {
    if (fs.existsSync(this.statsPath)) {
      try {
        const content = fs.readFileSync(this.statsPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        // 加载失败，创建新的
      }
    }

    return {
      projectId: this.projectPath,
      projectName: this.projectName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalExecutions: 0,
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalDuration: 0,
      byWorkflowType: {},
      byModel: {},
      recentExecutions: [],
      stepStats: {},
    };
  }

  private save(): void {
    this.stats.updatedAt = Date.now();
    
    const agentDir = path.dirname(this.statsPath);
    if (!fs.existsSync(agentDir)) {
      fs.mkdirSync(agentDir, { recursive: true });
    }
    
    fs.writeFileSync(this.statsPath, JSON.stringify(this.stats, null, 2), 'utf-8');
  }

  // ============================================
  // 记录使用
  // ============================================

  /**
   * 记录工作流执行的 token 使用
   */
  recordExecution(data: {
    executionId: string;
    workflowId: string;
    duration: number;
    tokenUsage: {
      model: string;
      used: number;
      steps: Array<{
        stepId: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      }>;
    };
  }): TokenUsageRecord {
    const { executionId, workflowId, duration, tokenUsage } = data;
    const workflowType = getWorkflowType(workflowId);
    
    // 计算总 token
    const totalTokens = tokenUsage.used;
    const inputTokens = tokenUsage.steps.reduce((sum, s) => sum + s.inputTokens, 0);
    const outputTokens = tokenUsage.steps.reduce((sum, s) => sum + s.outputTokens, 0);
    
    // 创建记录
    const record: TokenUsageRecord = {
      executionId,
      workflowId,
      workflowType,
      timestamp: Date.now(),
      duration,
      model: tokenUsage.model,
      totalTokens,
      inputTokens,
      outputTokens,
      steps: tokenUsage.steps.map(s => ({
        stepId: s.stepId,
        tokens: s.totalTokens,
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
      })),
    };
    
    // 更新总计
    this.stats.totalExecutions++;
    this.stats.totalTokens += totalTokens;
    this.stats.totalInputTokens += inputTokens;
    this.stats.totalOutputTokens += outputTokens;
    this.stats.totalDuration += duration;
    
    // 按工作流类型统计
    if (!this.stats.byWorkflowType[workflowType]) {
      this.stats.byWorkflowType[workflowType] = {
        count: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        avgTokensPerExecution: 0,
        avgDuration: 0,
      };
    }
    const typeStats = this.stats.byWorkflowType[workflowType];
    typeStats.count++;
    typeStats.totalTokens += totalTokens;
    typeStats.inputTokens += inputTokens;
    typeStats.outputTokens += outputTokens;
    typeStats.avgTokensPerExecution = Math.round(typeStats.totalTokens / typeStats.count);
    typeStats.avgDuration = Math.round(this.stats.totalDuration / typeStats.count);
    
    // 按模型统计
    if (!this.stats.byModel[tokenUsage.model]) {
      this.stats.byModel[tokenUsage.model] = { count: 0, totalTokens: 0 };
    }
    this.stats.byModel[tokenUsage.model].count++;
    this.stats.byModel[tokenUsage.model].totalTokens += totalTokens;
    
    // 步骤统计
    for (const step of tokenUsage.steps) {
      if (!this.stats.stepStats[step.stepId]) {
        this.stats.stepStats[step.stepId] = { count: 0, totalTokens: 0, avgTokens: 0 };
      }
      const stepStats = this.stats.stepStats[step.stepId];
      stepStats.count++;
      stepStats.totalTokens += step.totalTokens;
      stepStats.avgTokens = Math.round(stepStats.totalTokens / stepStats.count);
    }
    
    // 最近执行记录
    this.stats.recentExecutions.unshift(record);
    if (this.stats.recentExecutions.length > this.maxRecentExecutions) {
      this.stats.recentExecutions = this.stats.recentExecutions.slice(0, this.maxRecentExecutions);
    }
    
    this.save();
    
    return record;
  }

  // ============================================
  // 查询
  // ============================================

  /**
   * 获取完整统计
   */
  getStats(): ProjectTokenStats {
    return { ...this.stats };
  }

  /**
   * 获取项目总消耗
   */
  getTotalUsage(): {
    executions: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
    duration: number;  // 毫秒
  } {
    return {
      executions: this.stats.totalExecutions,
      tokens: this.stats.totalTokens,
      inputTokens: this.stats.totalInputTokens,
      outputTokens: this.stats.totalOutputTokens,
      duration: this.stats.totalDuration,
    };
  }

  /**
   * 按工作流类型获取统计
   */
  getByWorkflowType(type: TokenUsageRecord['workflowType']): WorkflowTypeStats | undefined {
    return this.stats.byWorkflowType[type];
  }

  /**
   * 获取所有工作流类型统计
   */
  getAllWorkflowTypeStats(): Record<string, WorkflowTypeStats> {
    return { ...this.stats.byWorkflowType };
  }

  /**
   * 获取步骤统计（按消耗排序）
   */
  getStepStatsSorted(limit?: number): Array<{
    stepId: string;
    count: number;
    totalTokens: number;
    avgTokens: number;
  }> {
    const steps = Object.entries(this.stats.stepStats)
      .map(([stepId, stats]) => ({
        stepId,
        ...stats,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);
    
    return limit ? steps.slice(0, limit) : steps;
  }

  /**
   * 获取最近执行
   */
  getRecentExecutions(limit?: number): TokenUsageRecord[] {
    const executions = this.stats.recentExecutions;
    return limit ? executions.slice(0, limit) : [...executions];
  }

  /**
   * 生成报告
   */
  generateReport(): string {
    const lines: string[] = [
      `# 📊 项目 Token 使用报告`,
      ``,
      `**项目**: ${this.stats.projectName}`,
      `**统计周期**: ${new Date(this.stats.createdAt).toLocaleDateString()} - ${new Date(this.stats.updatedAt).toLocaleDateString()}`,
      ``,
      `## 总计`,
      ``,
      `| 指标 | 数值 |`,
      `|------|------|`,
      `| 执行次数 | ${this.stats.totalExecutions} |`,
      `| 总 Token | ${this.stats.totalTokens.toLocaleString()} |`,
      `| 输入 Token | ${this.stats.totalInputTokens.toLocaleString()} |`,
      `| 输出 Token | ${this.stats.totalOutputTokens.toLocaleString()} |`,
      `| 总耗时 | ${Math.round(this.stats.totalDuration / 60000)} 分钟 |`,
      ``,
      `## 按工作流类型`,
      ``,
    ];

    for (const [type, stats] of Object.entries(this.stats.byWorkflowType)) {
      lines.push(`### ${type}`);
      lines.push(``);
      lines.push(`- 执行次数: ${stats.count}`);
      lines.push(`- 总 Token: ${stats.totalTokens.toLocaleString()}`);
      lines.push(`- 平均每次: ${stats.avgTokensPerExecution.toLocaleString()} tokens`);
      lines.push(``);
    }

    lines.push(`## 消耗最多的步骤 (Top 10)`);
    lines.push(``);
    
    const topSteps = this.getStepStatsSorted(10);
    lines.push(`| 步骤 | 执行次数 | 总 Token | 平均 |`);
    lines.push(`|------|----------|----------|------|`);
    
    for (const step of topSteps) {
      lines.push(`| ${step.stepId} | ${step.count} | ${step.totalTokens.toLocaleString()} | ${step.avgTokens.toLocaleString()} |`);
    }

    return lines.join('\n');
  }

  /**
   * 生成简短摘要（用于 UI 展示）
   */
  generateSummary(): string {
    const { totalExecutions, totalTokens, totalDuration } = this.stats;
    const durationMin = Math.round(totalDuration / 60000);
    
    return `📊 Token 总计: ${totalTokens.toLocaleString()} (${totalExecutions} 次执行, ${durationMin} 分钟)`;
  }

  // ============================================
  // 上下文管理
  // ============================================

  /**
   * 获取上下文使用情况
   * @param currentModel 当前使用的模型
   * @param currentExecutionTokens 当前执行已使用的 token（可选）
   */
  getContextUsage(currentModel: string, currentExecutionTokens: number = 0): ContextUsage {
    const contextLimit = MODEL_TOKEN_LIMITS[currentModel] || MODEL_TOKEN_LIMITS['default'];
    const projectTokensUsed = this.stats.totalTokens;
    const totalUsed = projectTokensUsed + currentExecutionTokens;
    const effectiveRemaining = Math.max(0, contextLimit - totalUsed);
    const percentage = Math.min(100, Math.round((totalUsed / contextLimit) * 100));
    
    // 判断状态
    let status: ContextUsage['status'];
    if (percentage >= 100) {
      status = 'exceeded';
    } else if (percentage >= CONTEXT_THRESHOLDS.critical) {
      status = 'critical';
    } else if (percentage >= CONTEXT_THRESHOLDS.warning) {
      status = 'warning';
    } else {
      status = 'normal';
    }
    
    // 生成建议
    const suggestion = this.generateContextSuggestion({
      currentModel,
      contextLimit,
      percentage,
      status,
      totalUsed,
    });
    
    return {
      currentModel,
      contextLimit,
      projectTokensUsed,
      currentExecutionTokens,
      totalUsed,
      effectiveRemaining,
      percentage,
      status,
      suggestion,
    };
  }

  /**
   * 生成上下文建议
   */
  private generateContextSuggestion(context: {
    currentModel: string;
    contextLimit: number;
    percentage: number;
    status: ContextUsage['status'];
    totalUsed: number;
  }): string {
    const { currentModel, contextLimit, percentage, status, totalUsed } = context;
    
    switch (status) {
      case 'normal':
        return `上下文充足，可继续执行`;
        
      case 'warning':
        return `上下文占用 ${percentage}%，建议关注进度`;
        
      case 'critical':
        // 查找更大上下文的模型
        const largerModels = this.getLargerContextModels(contextLimit);
        if (largerModels.length > 0) {
          return `上下文占用 ${percentage}%，建议切换到 ${largerModels[0]} 或压缩历史`;
        }
        return `上下文占用 ${percentage}%，建议压缩历史输出`;
        
      case 'exceeded':
        const models = this.getLargerContextModels(totalUsed);
        if (models.length > 0) {
          return `⚠️ 已超限 ${totalUsed.toLocaleString()} / ${contextLimit.toLocaleString()}，必须切换到 ${models[0]} 或重置上下文`;
        }
        return `⚠️ 已超限 ${totalUsed.toLocaleString()} / ${contextLimit.toLocaleString()}，必须压缩历史或重置上下文`;
        
      default:
        return '';
    }
  }

  /**
   * 获取更大上下文的模型列表
   */
  private getLargerContextModels(requiredTokens: number): string[] {
    const models: string[] = [];
    
    for (const [model, limit] of Object.entries(MODEL_TOKEN_LIMITS)) {
      if (limit >= requiredTokens && model !== 'default') {
        models.push(model);
      }
    }
    
    return models.sort((a, b) => {
      const limitA = MODEL_TOKEN_LIMITS[a] || 0;
      const limitB = MODEL_TOKEN_LIMITS[b] || 0;
      return limitA - limitB;  // 按上下文大小升序
    });
  }

  /**
   * 获取推荐的下一个模型（基于上下文需求）
   */
  getRecommendedModel(currentModel: string, currentExecutionTokens: number = 0): string | null {
    const usage = this.getContextUsage(currentModel, currentExecutionTokens);
    
    if (usage.status === 'normal' || usage.status === 'warning') {
      return null;  // 不需要切换
    }
    
    const largerModels = this.getLargerContextModels(usage.totalUsed);
    return largerModels.length > 0 ? largerModels[0] : null;
  }

  /**
   * 生成上下文状态摘要（用于 UI）
   */
  generateContextSummary(currentModel: string, currentExecutionTokens: number = 0): string {
    const usage = this.getContextUsage(currentModel, currentExecutionTokens);
    const { contextLimit, totalUsed, percentage, status } = usage;
    
    const statusEmoji = {
      normal: '✅',
      warning: '⚠️',
      critical: '🔴',
      exceeded: '❌',
    }[status];
    
    return `${statusEmoji} 上下文: ${totalUsed.toLocaleString()} / ${contextLimit.toLocaleString()} (${percentage}%)`;
  }

  // ============================================
  // 管理
  // ============================================

  /**
   * 清空统计
   */
  clear(): void {
    this.stats = {
      projectId: this.projectPath,
      projectName: this.projectName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalExecutions: 0,
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalDuration: 0,
      byWorkflowType: {},
      byModel: {},
      recentExecutions: [],
      stepStats: {},
    };
    this.save();
  }

  /**
   * 合并其他项目的统计
   */
  merge(other: ProjectTokenStats): void {
    // 合并总计
    this.stats.totalExecutions += other.totalExecutions;
    this.stats.totalTokens += other.totalTokens;
    this.stats.totalInputTokens += other.totalInputTokens;
    this.stats.totalOutputTokens += other.totalOutputTokens;
    this.stats.totalDuration += other.totalDuration;
    
    // 合并工作流类型统计
    for (const [type, stats] of Object.entries(other.byWorkflowType)) {
      if (!this.stats.byWorkflowType[type]) {
        this.stats.byWorkflowType[type] = { ...stats };
      } else {
        const existing = this.stats.byWorkflowType[type];
        existing.count += stats.count;
        existing.totalTokens += stats.totalTokens;
        existing.inputTokens += stats.inputTokens;
        existing.outputTokens += stats.outputTokens;
        existing.avgTokensPerExecution = Math.round(existing.totalTokens / existing.count);
        existing.avgDuration = Math.round((existing.avgDuration + stats.avgDuration) / 2);
      }
    }
    
    // 合并模型统计
    for (const [model, stats] of Object.entries(other.byModel)) {
      if (!this.stats.byModel[model]) {
        this.stats.byModel[model] = { ...stats };
      } else {
        this.stats.byModel[model].count += stats.count;
        this.stats.byModel[model].totalTokens += stats.totalTokens;
      }
    }
    
    // 合并步骤统计
    for (const [stepId, stats] of Object.entries(other.stepStats)) {
      if (!this.stats.stepStats[stepId]) {
        this.stats.stepStats[stepId] = { ...stats };
      } else {
        const existing = this.stats.stepStats[stepId];
        existing.count += stats.count;
        existing.totalTokens += stats.totalTokens;
        existing.avgTokens = Math.round(existing.totalTokens / existing.count);
      }
    }
    
    this.save();
  }
}

// ============================================
// 全局实例管理
// ============================================

const projectTrackers = new Map<string, ProjectTokenTracker>();

/**
 * 获取项目 Token 追踪器
 */
export function getProjectTokenTracker(projectPath: string): ProjectTokenTracker {
  let tracker = projectTrackers.get(projectPath);
  if (!tracker) {
    tracker = new ProjectTokenTracker({ projectPath });
    projectTrackers.set(projectPath, tracker);
  }
  return tracker;
}

/**
 * 创建项目 Token 追踪器
 */
export function createProjectTokenTracker(options: ProjectTokenTrackerOptions): ProjectTokenTracker {
  const tracker = new ProjectTokenTracker(options);
  projectTrackers.set(options.projectPath, tracker);
  return tracker;
}
