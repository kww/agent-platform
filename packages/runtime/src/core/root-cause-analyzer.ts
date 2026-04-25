/**
 * 失败归因分析器
 * 
 * 功能：
 * 1. 分析执行失败的根本原因
 * 2. 识别能力缺口
 * 3. 生成 Gap Report
 * 4. 支持自动归因和人工复核
 * 
 * 复用：
 * - classifySpawnError() 错误分类
 * - IndexBuilder 错误索引
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  FailureRootCause,
  GapType,
  GapReport,
  GapSuggestion,
  RootCauseRule,
  RootCauseCondition,
  RootCauseAnalysisResult,
  ConstraintLevel,
  ErrorType,
  ClassifiedError,
} from './types';
import { classifySpawnError } from '../executors/spawn';

// ============================================
// 默认归因规则
// ============================================

const DEFAULT_RULES: RootCauseRule[] = [
  // 1. 外部失败（优先级最高）
  {
    cause: 'external_failure',
    error_types: ['NETWORK', 'RATE_LIMIT', 'API_ERROR', 'TIMEOUT'],
    auto_classify: true,
    priority: 1,
  },
  
  // 2. 能力缺失
  {
    cause: 'capability_missing',
    patterns: [
      "我不知道如何",
      "我不知道该怎么做",
      "缺少.*能力",
      "无法.*因为.*没有.*能力",
      "需要.*工具",
      "需要.*步骤",
      "I don't know how to",
      "I'm not sure how to",
      "missing capability",
      "required capability",
    ],
    auto_classify: true,
    priority: 2,
  },
  
  // 3. 上下文不足
  {
    cause: 'context_insufficient',
    patterns: [
      "缺少.*信息",
      "需要.*上下文",
      "无法确定.*因为",
      "需要更多.*信息",
      "不清楚.*是什么",
      "missing context",
      "insufficient information",
      "need more context",
      "unclear what",
    ],
    auto_classify: true,
    priority: 3,
  },
  
  // 4. 约束过严
  {
    cause: 'constraint_too_strict',
    conditions: [
      { constraint_level: ['L3', 'L4'], retry_count: '>3', test_passed: false },
    ],
    auto_classify: true,
    priority: 4,
  },
  
  // 5. Agent 限制
  {
    cause: 'agent_limitation',
    patterns: [
      "超出.*能力范围",
      "模型无法",
      "context.*too.*long",
      "token.*limit",
      "超出上下文",
      "beyond my capabilities",
      "I cannot",
      "model limitation",
    ],
    auto_classify: true,
    priority: 5,
  },
  
  // 6. 约束过松（需要人工评审）
  {
    cause: 'constraint_too_loose',
    conditions: [
      { skipped_required_step: true },
      { test_passed: false, constraint_level: ['L1', 'L2'] },
    ],
    auto_classify: false,
    priority: 6,
  },
  
  // 7. 工作流缺陷（需要人工评审）
  {
    cause: 'workflow_defect',
    conditions: [
      { step_order_invalid: true },
    ],
    patterns: [
      "步骤.*顺序.*错误",
      "缺少.*步骤",
      "工作流.*问题",
      "step order",
      "missing step",
      "workflow error",
    ],
    auto_classify: false,
    priority: 7,
  },
];

// ============================================
// 归因分析器
// ============================================

export class RootCauseAnalyzer {
  private rules: RootCauseRule[];
  private workDir: string;
  
  constructor(options: { workDir?: string; rules?: RootCauseRule[] } = {}) {
    this.workDir = options.workDir || process.cwd();
    this.rules = options.rules || DEFAULT_RULES;
    this.loadCustomRules();
  }
  
  /**
   * 加载自定义规则
   */
  private loadCustomRules(): void {
    const rulesPath = path.join(this.workDir, '.agent', 'root-cause-rules.yml');
    if (fs.existsSync(rulesPath)) {
      try {
        const yaml = require('js-yaml');
        const content = fs.readFileSync(rulesPath, 'utf-8');
        const customRules = yaml.load(content) as RootCauseRule[];
        if (Array.isArray(customRules)) {
          // 自定义规则优先
          this.rules = [...customRules, ...this.rules];
        }
      } catch (error) {
        console.warn(`[RootCauseAnalyzer] 加载自定义规则失败: ${error}`);
      }
    }
  }
  
  /**
   * 分析失败原因
   */
  analyze(options: {
    executionId: string;
    workflowId: string;
    stepId: string;
    roleId?: string;
    errorMessage: string;
    errorType?: ErrorType;
    exitCode?: number;
    context?: {
      constraintLevel?: ConstraintLevel;
      retryCount?: number;
      testPassed?: boolean;
      skippedRequiredStep?: boolean;
      stepOrderInvalid?: boolean;
    };
  }): RootCauseAnalysisResult {
    const {
      executionId,
      workflowId,
      stepId,
      roleId,
      errorMessage,
      errorType,
      exitCode,
      context = {},
    } = options;
    
    // 1. 如果没有错误类型，先分类
    let classifiedError: ClassifiedError | undefined;
    let resolvedErrorType = errorType;
    if (!resolvedErrorType && errorMessage) {
      classifiedError = classifySpawnError(errorMessage, exitCode);
      resolvedErrorType = classifiedError.type;
    }
    
    // 2. 按优先级匹配规则
    const sortedRules = [...this.rules].sort((a, b) => a.priority - b.priority);
    
    for (const rule of sortedRules) {
      const match = this.matchRule(rule, {
        errorMessage,
        errorType: resolvedErrorType,
        context,
      });
      
      if (match.matched) {
        // 3. 生成 Gap Report
        const gapReport = this.generateGapReport({
          executionId,
          workflowId,
          stepId,
          roleId,
          rootCause: rule.cause,
          confidence: match.confidence,
          matchedPattern: match.pattern,
          errorMessage,
          errorType: resolvedErrorType,
          context,
        });
        
        return {
          rootCause: rule.cause,
          confidence: match.confidence,
          matchedRule: rule,
          matchedPattern: match.pattern,
          gapReport,
        };
      }
    }
    
    // 4. 未匹配任何规则，归因为 unknown
    const gapReport = this.generateGapReport({
      executionId,
      workflowId,
      stepId,
      roleId,
      rootCause: 'unknown',
      confidence: 0.3,
      matchedPattern: undefined,
      errorMessage,
      errorType: resolvedErrorType,
      context,
    });
    
    return {
      rootCause: 'unknown',
      confidence: 0.3,
      gapReport,
    };
  }
  
  /**
   * 匹配规则
   */
  private matchRule(
    rule: RootCauseRule,
    options: {
      errorMessage: string;
      errorType?: ErrorType;
      context: {
        constraintLevel?: ConstraintLevel;
        retryCount?: number;
        testPassed?: boolean;
        skippedRequiredStep?: boolean;
        stepOrderInvalid?: boolean;
      };
    }
  ): { matched: boolean; confidence: number; pattern?: string } {
    const { errorMessage, errorType, context } = options;
    
    // 匹配错误类型
    if (rule.error_types && errorType) {
      if (rule.error_types.includes(errorType)) {
        return { matched: true, confidence: 0.95 };
      }
    }
    
    // 匹配文本模式
    if (rule.patterns) {
      const lowerError = errorMessage.toLowerCase();
      for (const pattern of rule.patterns) {
        // 简单的通配符匹配
        const regex = new RegExp(pattern.toLowerCase().replace(/\.\*/g, '.*'));
        if (regex.test(lowerError)) {
          return { matched: true, confidence: 0.85, pattern };
        }
      }
    }
    
    // 匹配条件
    if (rule.conditions) {
      for (const condition of rule.conditions) {
        const matchResult = this.matchCondition(condition, context);
        if (matchResult.matched) {
          return { matched: true, confidence: matchResult.confidence };
        }
      }
    }
    
    return { matched: false, confidence: 0 };
  }
  
  /**
   * 匹配条件
   */
  private matchCondition(
    condition: RootCauseCondition,
    context: {
      constraintLevel?: ConstraintLevel;
      retryCount?: number;
      testPassed?: boolean;
      skippedRequiredStep?: boolean;
      stepOrderInvalid?: boolean;
    }
  ): { matched: boolean; confidence: number } {
    let matchedCount = 0;
    let totalConditions = 0;
    
    // 约束级别
    if (condition.constraint_level) {
      totalConditions++;
      if (context.constraintLevel && condition.constraint_level.includes(context.constraintLevel)) {
        matchedCount++;
      }
    }
    
    // 重试次数
    if (condition.retry_count) {
      totalConditions++;
      const operator = condition.retry_count.match(/[><=]+/)?.[0] || '>=';
      const value = parseInt(condition.retry_count.replace(/[><=]+/, ''));
      const retryCount = context.retryCount || 0;
      
      if (
        (operator === '>' && retryCount > value) ||
        (operator === '>=' && retryCount >= value) ||
        (operator === '<' && retryCount < value) ||
        (operator === '<=' && retryCount <= value) ||
        (operator === '==' && retryCount === value)
      ) {
        matchedCount++;
      }
    }
    
    // 测试是否通过
    if (condition.test_passed !== undefined) {
      totalConditions++;
      if (context.testPassed === condition.test_passed) {
        matchedCount++;
      }
    }
    
    // 是否跳过必做步骤
    if (condition.skipped_required_step !== undefined) {
      totalConditions++;
      if (context.skippedRequiredStep === condition.skipped_required_step) {
        matchedCount++;
      }
    }
    
    // 步骤顺序是否无效
    if (condition.step_order_invalid !== undefined) {
      totalConditions++;
      if (context.stepOrderInvalid === condition.step_order_invalid) {
        matchedCount++;
      }
    }
    
    if (totalConditions === 0) {
      return { matched: false, confidence: 0 };
    }
    
    const allMatched = matchedCount === totalConditions;
    return {
      matched: allMatched,
      confidence: allMatched ? 0.9 : 0,
    };
  }
  
  /**
   * 生成 Gap Report
   */
  private generateGapReport(options: {
    executionId: string;
    workflowId: string;
    stepId: string;
    roleId?: string;
    rootCause: FailureRootCause;
    confidence: number;
    matchedPattern?: string;
    errorMessage: string;
    errorType?: ErrorType;
    context: {
      constraintLevel?: ConstraintLevel;
      retryCount?: number;
      testPassed?: boolean;
    };
  }): GapReport {
    const {
      executionId,
      workflowId,
      stepId,
      roleId,
      rootCause,
      confidence,
      matchedPattern,
      errorMessage,
      errorType,
      context,
    } = options;
    
    // 生成 ID
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const id = `GAP-${dateStr}-${uuidv4().slice(0, 6)}`;
    
    // 推断缺口详情
    const gap = this.inferGap(rootCause, errorMessage, matchedPattern);
    
    // 生成建议
    const suggestions = this.generateSuggestions(rootCause, gap);
    
    return {
      id,
      timestamp: date.getTime(),
      executionId,
      workflowId,
      stepId,
      roleId,
      rootCause,
      confidence,
      gap,
      impact: {
        affected_workflows: [workflowId],
        affected_roles: roleId ? [roleId] : [],
        frequency_estimate: this.estimateFrequency(rootCause),
      },
      suggestions,
      originalError: errorMessage,
      errorType,
      status: 'open',
    };
  }
  
  /**
   * 推断缺口详情
   */
  private inferGap(
    rootCause: FailureRootCause,
    errorMessage: string,
    matchedPattern?: string
  ): GapReport['gap'] {
    const gapTypes: Record<FailureRootCause, GapType> = {
      capability_missing: 'tool',
      context_insufficient: 'context',
      constraint_too_strict: 'constraint',
      constraint_too_loose: 'constraint',
      workflow_defect: 'workflow',
      agent_limitation: 'knowledge',
      external_failure: 'tool',
      unknown: 'knowledge',
    };
    
    // 尝试从错误消息中提取缺失的能力名
    let gapName = 'unknown';
    if (rootCause === 'capability_missing') {
      // 尝试匹配 "需要 xxx 工具" 或 "缺少 xxx 能力"
      const toolMatch = errorMessage.match(/需要\s+(\S+)\s+(工具|能力|步骤)/);
      const missingMatch = errorMessage.match(/缺少\s+(\S+)\s+(能力|工具)/);
      gapName = toolMatch?.[1] || missingMatch?.[1] || 'unspecified_capability';
    } else if (rootCause === 'context_insufficient') {
      const infoMatch = errorMessage.match(/需要\s+(\S+)\s+(信息|上下文)/);
      gapName = infoMatch?.[1] || 'unspecified_context';
    } else {
      gapName = rootCause;
    }
    
    // 推断严重性
    const severity = this.inferSeverity(rootCause, errorMessage);
    
    return {
      type: gapTypes[rootCause],
      name: gapName,
      description: this.generateGapDescription(rootCause, gapName, errorMessage),
      severity,
    };
  }
  
  /**
   * 推断严重性
   */
  private inferSeverity(
    rootCause: FailureRootCause,
    errorMessage: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    // 外部失败通常是临时的，严重性较低
    if (rootCause === 'external_failure') {
      return 'low';
    }
    
    // 能力缺失影响较大
    if (rootCause === 'capability_missing') {
      return 'high';
    }
    
    // 工作流缺陷可能影响多个任务
    if (rootCause === 'workflow_defect') {
      return 'medium';
    }
    
    // 约束问题
    if (rootCause === 'constraint_too_strict' || rootCause === 'constraint_too_loose') {
      return 'medium';
    }
    
    // Agent 限制可能需要切换模型
    if (rootCause === 'agent_limitation') {
      return 'high';
    }
    
    // 上下文不足通常是信息问题
    if (rootCause === 'context_insufficient') {
      return 'medium';
    }
    
    return 'low';
  }
  
  /**
   * 生成缺口描述
   */
  private generateGapDescription(
    rootCause: FailureRootCause,
    gapName: string,
    errorMessage: string
  ): string {
    const descriptions: Record<FailureRootCause, string> = {
      capability_missing: `角色缺少 ${gapName} 能力，无法完成当前任务`,
      context_insufficient: `缺少 ${gapName} 上下文信息，无法做出正确判断`,
      constraint_too_strict: '当前约束级别过严，角色无法在限制内完成任务',
      constraint_too_loose: '当前约束级别过松，角色可能跳过必要步骤',
      workflow_defect: `工作流步骤设计存在问题: ${gapName}`,
      agent_limitation: `Agent 模型能力限制: ${gapName}`,
      external_failure: `外部环境问题: ${errorMessage.slice(0, 100)}`,
      unknown: `未知原因导致的失败: ${errorMessage.slice(0, 100)}`,
    };
    
    return descriptions[rootCause];
  }
  
  /**
   * 估算发生频率
   */
  private estimateFrequency(rootCause: FailureRootCause): number {
    const frequencies: Record<FailureRootCause, number> = {
      external_failure: 0.1,      // 外部问题偶尔发生
      capability_missing: 0.3,    // 能力缺失会持续发生
      context_insufficient: 0.2,  // 上下文问题较常见
      constraint_too_strict: 0.1, // 约束问题较少
      constraint_too_loose: 0.05, // 约束过松较少
      workflow_defect: 0.1,       // 工作流缺陷会在特定场景触发
      agent_limitation: 0.15,     // 模型限制较常见
      unknown: 0.05,              // 未知问题较少
    };
    
    return frequencies[rootCause] || 0.1;
  }
  
  /**
   * 生成进化建议
   */
  private generateSuggestions(
    rootCause: FailureRootCause,
    gap: GapReport['gap']
  ): GapSuggestion[] {
    const suggestions: GapSuggestion[] = [];
    
    switch (rootCause) {
      case 'capability_missing':
        suggestions.push({
          type: 'add_capability',
          description: `为角色添加 ${gap.name} 能力`,
          effort: 'medium',
          impact: 'high',
          recommended: true,
        });
        suggestions.push({
          type: 'fix_workflow',
          description: '调整工作流，在有该能力的角色间分配任务',
          effort: 'low',
          impact: 'medium',
          recommended: false,
        });
        break;
        
      case 'context_insufficient':
        suggestions.push({
          type: 'enhance_context',
          description: `提供 ${gap.name} 上下文信息`,
          effort: 'low',
          impact: 'high',
          recommended: true,
        });
        break;
        
      case 'constraint_too_strict':
        suggestions.push({
          type: 'adjust_constraint',
          description: '降低约束级别或增加重试次数',
          effort: 'low',
          impact: 'medium',
          recommended: true,
        });
        break;
        
      case 'constraint_too_loose':
        suggestions.push({
          type: 'adjust_constraint',
          description: '提高约束级别或添加必做步骤检查',
          effort: 'low',
          impact: 'high',
          recommended: true,
        });
        break;
        
      case 'workflow_defect':
        suggestions.push({
          type: 'fix_workflow',
          description: '修复工作流步骤设计问题',
          effort: 'medium',
          impact: 'high',
          recommended: true,
        });
        break;
        
      case 'agent_limitation':
        suggestions.push({
          type: 'upgrade_agent',
          description: '切换到能力更强的模型',
          effort: 'low',
          impact: 'high',
          recommended: true,
        });
        suggestions.push({
          type: 'add_capability',
          description: '通过工具扩展 Agent 能力',
          effort: 'medium',
          impact: 'medium',
          recommended: false,
        });
        break;
        
      case 'external_failure':
        suggestions.push({
          type: 'add_capability',
          description: '添加重试机制或备用方案',
          effort: 'low',
          impact: 'low',
          recommended: false,
        });
        break;
        
      default:
        suggestions.push({
          type: 'add_capability',
          description: '需要人工分析并添加相应能力',
          effort: 'medium',
          impact: 'medium',  // 修复：使用有效值
          recommended: false,
        });
    }
    
    return suggestions;
  }
  
  /**
   * 将严重性映射为优先级
   */
  private mapSeverityToPriority(severity: 'low' | 'medium' | 'high' | 'critical'): 'high' | 'medium' | 'low' {
    const mapping: Record<string, 'high' | 'medium' | 'low'> = {
      critical: 'high',
      high: 'high',
      medium: 'medium',
      low: 'low',
    };
    return mapping[severity] || 'medium';
  }
  
  /**
   * 保存 Gap Report 到进化待办
   */
  saveGapReport(gapReport: GapReport): void {
    const backlogPath = path.join(this.workDir, '.agent', 'evolution-backlog.yml');
    
    // 确保目录存在
    const dir = path.dirname(backlogPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // 读取现有待办
    let items: any[] = [];
    if (fs.existsSync(backlogPath)) {
      try {
        const yaml = require('js-yaml');
        const content = fs.readFileSync(backlogPath, 'utf-8');
        const data = yaml.load(content) as { items?: any[] };
        items = data.items || [];
      } catch (error) {
        console.warn(`[RootCauseAnalyzer] 读取进化待办失败: ${error}`);
      }
    }
    
    // 添加新项
    const backlogItem = {
      id: gapReport.id,
      type: 'evolution',
      title: `[${gapReport.rootCause}] ${gapReport.gap.name}`,
      priority: this.mapSeverityToPriority(gapReport.gap.severity),
      status: 'open',
      gap_report_id: gapReport.id,
      root_cause: gapReport.rootCause,
      suggested_solution: gapReport.suggestions.find(s => s.recommended)?.description || '待分析',
      estimated_effort: gapReport.suggestions.find(s => s.recommended)?.effort || 'medium',
      created_at: gapReport.timestamp,
    };
    
    items.push(backlogItem);
    
    // 保存
    const yaml = require('js-yaml');
    const content = yaml.dump({ project: this.workDir, items }, { lineWidth: -1 });
    fs.writeFileSync(backlogPath, content, 'utf-8');
    
    console.log(`[RootCauseAnalyzer] Gap Report 已保存: ${gapReport.id}`);
  }
}

// ============================================
// 便捷函数
// ============================================

let defaultAnalyzer: RootCauseAnalyzer | undefined;

export function getRootCauseAnalyzer(workDir?: string): RootCauseAnalyzer {
  if (!defaultAnalyzer || workDir) {
    defaultAnalyzer = new RootCauseAnalyzer({ workDir });
  }
  return defaultAnalyzer;
}

export function analyzeRootCause(options: {
  executionId: string;
  workflowId: string;
  stepId: string;
  roleId?: string;
  errorMessage: string;
  errorType?: ErrorType;
  exitCode?: number;
  context?: {
    constraintLevel?: ConstraintLevel;
    retryCount?: number;
    testPassed?: boolean;
    skippedRequiredStep?: boolean;
    stepOrderInvalid?: boolean;
  };
  workDir?: string;
}): RootCauseAnalysisResult {
  const analyzer = getRootCauseAnalyzer(options.workDir);
  return analyzer.analyze(options);
}

export function saveGapReport(gapReport: GapReport, workDir?: string): void {
  const analyzer = getRootCauseAnalyzer(workDir);
  analyzer.saveGapReport(gapReport);
}
