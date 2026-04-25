/**
 * 进化步骤处理器
 * 
 * 处理：
 * - evolution/report-gap: 生成能力缺口报告
 * - evolution/prioritize: 进化建议优先级排序
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as yaml from 'js-yaml';
import {
  GapReport,
  FailureRootCause,
  GapType,
  RootCauseRule,
  EvolutionBacklogItem,
} from '../core/types';
import {
  analyzeRootCause,
  saveGapReport,
} from '../core/root-cause-analyzer';

// ============================================
// evolution/report-gap 处理器
// ============================================

export interface ReportGapInput {
  project_path: string;
  execution_id: string;
  workflow_id: string;
  step_id: string;
  error_message: string;
  error_type?: string;
  role_id?: string;
  context?: {
    constraint_level?: string;
    retry_count?: number;
    test_passed?: boolean;
    skipped_required_step?: boolean;
  };
}

export interface ReportGapOutput {
  gap_report: GapReport;
  backlog_item: EvolutionBacklogItem;
  report_path: string;
}

/**
 * 处理 evolution/report-gap 步骤
 */
export async function handleReportGap(input: ReportGapInput): Promise<ReportGapOutput> {
  const {
    project_path,
    execution_id,
    workflow_id,
    step_id,
    error_message,
    error_type,
    role_id,
    context,
  } = input;

  // 1. 调用归因分析
  const analysisResult = analyzeRootCause({
    executionId: execution_id,
    workflowId: workflow_id,
    stepId: step_id,
    roleId: role_id,
    errorMessage: error_message,
    errorType: error_type as any,
    context: context as any,
    workDir: project_path,
  });

  const gapReport = analysisResult.gapReport;

  // 2. 保存 Gap Report
  saveGapReport(gapReport, project_path);

  // 3. 创建 Backlog Item
  const backlogItem: EvolutionBacklogItem = {
    id: gapReport.id,
    type: 'evolution',
    title: `[${gapReport.rootCause}] ${gapReport.gap.name}`,
    priority: mapSeverityToPriority(gapReport.gap.severity),
    status: 'open',
    gap_report_id: gapReport.id,
    root_cause: gapReport.rootCause,
    suggested_solution: gapReport.suggestions.find(s => s.recommended)?.description || '待分析',
    estimated_effort: gapReport.suggestions.find(s => s.recommended)?.effort || 'medium',
    created_at: gapReport.timestamp,
  };

  // 4. 保存报告文件
  const reportDir = path.join(project_path, '.agent', 'reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const reportPath = path.join(reportDir, `gap-${gapReport.id}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(gapReport, null, 2), 'utf-8');

  return {
    gap_report: gapReport,
    backlog_item: backlogItem,
    report_path: reportPath,
  };
}

// ============================================
// evolution/prioritize 处理器
// ============================================

export interface PrioritizeInput {
  project_path: string;
  max_items?: number;
  min_severity?: 'low' | 'medium' | 'high' | 'critical';
  status_filter?: string[];
}

export interface PrioritizedItem extends EvolutionBacklogItem {
  score: number;
  rank: number;
}

export interface PrioritizeOutput {
  prioritized_items: PrioritizedItem[];
  statistics: {
    total_items: number;
    by_severity: Record<string, number>;
    by_root_cause: Record<string, number>;
  };
}

// 优先级评分配置
const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 40,
  high: 30,
  medium: 20,
  low: 10,
};

const FREQUENCY_WEIGHTS: Record<string, number> = {
  high: 30,    // > 0.5
  medium: 20,  // 0.3-0.5
  low: 10,     // 0.1-0.3
  rare: 5,     // < 0.1
};

const EFFORT_BONUS: Record<string, number> = {
  low: 10,
  medium: 0,
  high: -10,
};

/**
 * 处理 evolution/prioritize 步骤
 */
export async function handlePrioritize(input: PrioritizeInput): Promise<PrioritizeOutput> {
  const {
    project_path,
    max_items = 10,
    min_severity = 'medium',
    status_filter = ['open'],
  } = input;

  // 1. 加载 evolution-backlog.yml
  const backlogPath = path.join(project_path, '.agent', 'evolution-backlog.yml');
  
  if (!fs.existsSync(backlogPath)) {
    return {
      prioritized_items: [],
      statistics: {
        total_items: 0,
        by_severity: {},
        by_root_cause: {},
      },
    };
  }

  const content = fs.readFileSync(backlogPath, 'utf-8');
  const data = yaml.load(content) as { items?: EvolutionBacklogItem[] };
  const items = data.items || [];

  // 2. 过滤
  const severityOrder = ['low', 'medium', 'high', 'critical'];
  const minSeverityIndex = severityOrder.indexOf(min_severity);

  const filteredItems = items.filter(item => {
    // 状态过滤
    if (!status_filter.includes(item.status)) {
      return false;
    }
    
    // 严重性过滤
    const itemSeverityIndex = severityOrder.indexOf(item.priority);
    if (itemSeverityIndex < minSeverityIndex) {
      return false;
    }
    
    return true;
  });

  // 3. 计算分数
  const scoredItems: PrioritizedItem[] = filteredItems.map(item => {
    let score = 0;

    // 严重性权重
    score += SEVERITY_WEIGHTS[item.priority] || 0;

    // 频率权重（从 Gap Report 估算）
    // 这里简化处理，根据 root_cause 类型估算
    const frequencyByRootCause: Record<string, string> = {
      capability_missing: 'high',
      context_insufficient: 'medium',
      constraint_too_strict: 'low',
      constraint_too_loose: 'rare',
      workflow_defect: 'low',
      agent_limitation: 'medium',
      external_failure: 'rare',
      unknown: 'rare',
    };
    const frequency = frequencyByRootCause[item.root_cause] || 'rare';
    score += FREQUENCY_WEIGHTS[frequency] || 0;

    // 工作量加成
    score += EFFORT_BONUS[item.estimated_effort] || 0;

    return {
      ...item,
      score,
      rank: 0,
    };
  });

  // 4. 排序
  scoredItems.sort((a, b) => b.score - a.score);

  // 5. 分配排名
  scoredItems.forEach((item, index) => {
    item.rank = index + 1;
  });

  // 6. 限制数量
  const limitedItems = scoredItems.slice(0, max_items);

  // 7. 统计
  const statistics = {
    total_items: items.length,
    by_severity: {} as Record<string, number>,
    by_root_cause: {} as Record<string, number>,
  };

  items.forEach(item => {
    statistics.by_severity[item.priority] = (statistics.by_severity[item.priority] || 0) + 1;
    statistics.by_root_cause[item.root_cause] = (statistics.by_root_cause[item.root_cause] || 0) + 1;
  });

  return {
    prioritized_items: limitedItems,
    statistics,
  };
}

// ============================================
// 辅助函数
// ============================================

function mapSeverityToPriority(severity: 'low' | 'medium' | 'high' | 'critical'): 'high' | 'medium' | 'low' {
  const mapping: Record<string, 'high' | 'medium' | 'low'> = {
    critical: 'high',
    high: 'high',
    medium: 'medium',
    low: 'low',
  };
  return mapping[severity] || 'medium';
}

// ============================================
// 导出处理器注册
// ============================================

export const evolutionHandlers = {
  'evolution/report-gap': handleReportGap,
  'evolution/prioritize': handlePrioritize,
};
