/**
 * 立场相关处理器
 * 
 * define-stance: 注入立场 prompt
 * stance-review: 执行立场审核
 */

import { BuiltinHandler } from './builtin-handlers';
import {
  Stance,
  StanceId,
  StanceInjectionConfig,
  StanceReviewConfig,
  StanceReviewResult,
  StanceOpinion,
  StanceIssue,
  StancePromptVariables,
} from '../types/stance';
import {
  getStance,
  getAllStances,
  STANCE_DEFINITIONS,
} from './stances';

// ========== define-stance 处理器 ==========

/**
 * define-stance 处理器
 * 
 * 注入立场 prompt 到 Agent 执行上下文
 */
export const defineStanceHandler: BuiltinHandler = async (input, context) => {
  const { stance_id, task, input_content, context: taskContext, additional_prompt } = input;
  
  // 验证立场 ID
  const stance = getStance(stance_id as StanceId | 'auditor');
  if (!stance) {
    throw new Error(`Unknown stance: ${stance_id}. Available: ${Object.keys(STANCE_DEFINITIONS).join(', ')}`);
  }
  
  // 构建立场 prompt
  const stancePrompt = buildStancePrompt(stance, {
    task,
    input: input_content,
    context: taskContext,
    additionalPrompt: additional_prompt,
  });
  
  // 返回注入后的配置
  return {
    success: true,
    stance: {
      id: stance.id,
      name: stance.name,
      nameZh: stance.nameZh,
      category: stance.category,
    },
    injected_prompt: stancePrompt,
    forbidden_actions: stance.forbiddenActions,
    focus_areas: stance.focusAreas,
    typical_questions: stance.typicalQuestions,
  };
};

/**
 * 构建立场 prompt
 */
function buildStancePrompt(
  stance: Stance,
  variables: StancePromptVariables & { additionalPrompt?: string }
): string {
  const sections: string[] = [];
  
  // 1. 立场核心 prompt
  sections.push(stance.prompt);
  
  // 2. 禁止行为
  sections.push(`\n## 禁止行为\n${stance.forbiddenActions.map(a => `- ${a}`).join('\n')}`);
  
  // 3. 关注重点
  sections.push(`\n## 关注重点\n${stance.focusAreas.map(a => `- ${a}`).join('\n')}`);
  
  // 4. 任务描述（如果有）
  if (variables.task) {
    sections.push(`\n## 当前任务\n${variables.task}`);
  }
  
  // 5. 输入内容（如果有）
  if (variables.input) {
    sections.push(`\n## 输入内容\n${variables.input}`);
  }
  
  // 6. 上下文（如果有）
  if (variables.context) {
    sections.push(`\n## 上下文\n${variables.context}`);
  }
  
  // 7. 额外 prompt（如果有）
  if (variables.additionalPrompt) {
    sections.push(`\n## 补充说明\n${variables.additionalPrompt}`);
  }
  
  return sections.join('\n');
}

/**
 * list-stances 处理器
 * 列出所有可用立场
 */
export const listStancesHandler: BuiltinHandler = async (input, context) => {
  const { category } = input || {};
  
  let stances = getAllStances();
  
  // 按分类筛选
  if (category) {
    stances = stances.filter(s => s.category === category);
  }
  
  return {
    success: true,
    total: stances.length,
    stances: stances.map(s => ({
      id: s.id,
      name: s.name,
      nameZh: s.nameZh,
      category: s.category,
      description: s.description,
      focusAreas: s.focusAreas,
      applicableRoles: s.applicableRoles,
    })),
  };
};

// ========== stance-review 处理器 ==========

/**
 * stance-review 处理器
 * 
 * 执行单立场审核
 */
export const stanceReviewHandler: BuiltinHandler = async (input, context) => {
  const {
    stance_id,
    artifact_type,
    artifact_content,
    review_criteria,
    previous_opinions,
  } = input;
  
  // 验证立场 ID
  const stance = getStance(stance_id as StanceId | 'auditor');
  if (!stance) {
    throw new Error(`Unknown stance: ${stance_id}`);
  }
  
  // 构建审核 prompt
  const reviewPrompt = buildReviewPrompt(stance, {
    artifactType: artifact_type,
    artifactContent: artifact_content,
    reviewCriteria: review_criteria,
    previousOpinions: previous_opinions,
  });
  
  // 返回审核配置（由 Agent 执行实际审核）
  return {
    success: true,
    review_config: {
      stance: {
        id: stance.id,
        name: stance.nameZh,
        category: stance.category,
      },
      artifact_type,
      review_prompt: reviewPrompt,
      forbidden_actions: stance.forbiddenActions,
      focus_areas: stance.focusAreas,
    },
    expected_output: {
      verdict: 'approve | reject | request_changes',
      opinion: 'string',
      issues: 'array of { severity, category, description, suggestion }',
      suggestions: 'array of strings',
    },
  };
};

/**
 * 构建审核 prompt
 */
function buildReviewPrompt(
  stance: Stance,
  options: {
    artifactType?: string;
    artifactContent?: string;
    reviewCriteria?: string[];
    previousOpinions?: StanceOpinion[];
  }
): string {
  const sections: string[] = [];
  
  // 1. 立场核心 prompt
  sections.push(stance.prompt);
  
  // 2. 审核任务说明
  sections.push(`\n## 审核任务\n你正在以「${stance.nameZh}」的立场审核一个${options.artifactType || '方案'}。`);
  
  // 3. 审核标准
  if (options.reviewCriteria && options.reviewCriteria.length > 0) {
    sections.push(`\n## 审核标准\n${options.reviewCriteria.map(c => `- ${c}`).join('\n')}`);
  }
  
  // 4. 禁止行为
  sections.push(`\n## 禁止行为\n${stance.forbiddenActions.map(a => `- ${a}`).join('\n')}`);
  
  // 5. 关注重点
  sections.push(`\n## 关注重点\n${stance.focusAreas.map(a => `- ${a}`).join('\n')}`);
  
  // 6. 典型问题
  sections.push(`\n## 典型问题\n${stance.typicalQuestions.map(q => `- ${q}`).join('\n')}`);
  
  // 7. 其他立场意见（如果有）
  if (options.previousOpinions && options.previousOpinions.length > 0) {
    const otherOpinionsText = options.previousOpinions
      .map(op => `**${op.verdict}** (${STANCE_DEFINITIONS[op.stanceId as StanceId]?.nameZh || op.stanceId}): ${op.opinion}`)
      .join('\n\n');
    sections.push(`\n## 其他立场意见\n${otherOpinionsText}`);
  }
  
  // 8. 输出格式
  sections.push(`
## 输出格式
请按以下格式输出审核结果：

\`\`\`json
{
  "verdict": "approve | reject | request_changes",
  "opinion": "你的详细意见",
  "issues": [
    {
      "severity": "critical | major | minor | suggestion",
      "category": "问题分类",
      "description": "问题描述",
      "suggestion": "改进建议"
    }
  ],
  "suggestions": ["建议1", "建议2"]
}
\`\`\`
`);
  
  return sections.join('\n');
}

/**
 * multi-stance-review 处理器
 * 
 * 多立场并行审核配置
 */
export const multiStanceReviewHandler: BuiltinHandler = async (input, context) => {
  const {
    artifact_type,
    artifact_content,
    stances,
    aggregation_method,
    review_criteria,
  } = input;
  
  // 验证立场
  const validStances: Stance[] = [];
  for (const stanceId of stances || []) {
    const stance = getStance(stanceId as StanceId | 'auditor');
    if (!stance) {
      throw new Error(`Unknown stance: ${stanceId}`);
    }
    validStances.push(stance);
  }
  
  // 默认使用决策类立场
  if (validStances.length === 0) {
    validStances.push(
      STANCE_DEFINITIONS.critic,
      STANCE_DEFINITIONS.supporter,
      STANCE_DEFINITIONS.decider
    );
  }
  
  // 构建多立场审核配置
  const reviewConfigs = validStances.map(stance => ({
    stance_id: stance.id,
    stance_name: stance.nameZh,
    review_prompt: buildReviewPrompt(stance, {
      artifactType: artifact_type,
      artifactContent: artifact_content,
      reviewCriteria: review_criteria,
    }),
  }));
  
  return {
    success: true,
    multi_review_config: {
      artifact_type,
      stances: reviewConfigs,
      aggregation: aggregation_method || 'decider',
      parallel: true,
    },
    expected_workflow: [
      {
        step: 'parallel_reviews',
        description: '各立场并行审核',
        stances: validStances.map(s => s.id),
      },
      {
        step: 'aggregate_opinions',
        description: '汇聚审核意见',
        method: aggregation_method || 'decider',
      },
      {
        step: 'final_decision',
        description: '最终决策',
        role: 'tech-lead',
      },
    ],
  };
};

/**
 * aggregate-opinions 处理器
 * 
 * 汇聚多立场审核意见
 */
export const aggregateOpinionsHandler: BuiltinHandler = async (input, context) => {
  const {
    opinions,
    aggregation_method,
    decider_role,
  } = input;
  
  // 统计各立场意见
  const stats = {
    approve: 0,
    reject: 0,
    request_changes: 0,
    total: opinions.length,
  };
  
  for (const opinion of opinions) {
    stats[opinion.verdict as keyof typeof stats]++;
  }
  
  // 根据汇聚方法决定最终结果
  let finalDecision: 'approved' | 'rejected' | 'changes_requested';
  let reason: string;
  
  switch (aggregation_method) {
    case 'consensus':
      // 一致同意
      if (stats.approve === stats.total) {
        finalDecision = 'approved';
        reason = '所有立场一致同意';
      } else if (stats.reject > 0) {
        finalDecision = 'rejected';
        reason = '有立场反对';
      } else {
        finalDecision = 'changes_requested';
        reason = '有立场要求修改';
      }
      break;
      
    case 'majority':
      // 多数同意
      if (stats.approve > stats.total / 2) {
        finalDecision = 'approved';
        reason = `多数同意 (${stats.approve}/${stats.total})`;
      } else if (stats.reject > stats.total / 2) {
        finalDecision = 'rejected';
        reason = `多数反对 (${stats.reject}/${stats.total})`;
      } else {
        finalDecision = 'changes_requested';
        reason = '需要进一步讨论';
      }
      break;
      
    case 'weighted':
      // 加权（critic 权重更高）
      const weights: Record<string, number> = {
        critic: 2.0,
        decider: 1.5,
        supporter: 1.0,
      };
      
      let weightedApprove = 0;
      let weightedReject = 0;
      let totalWeight = 0;
      
      for (const opinion of opinions) {
        const weight = weights[opinion.stanceId] || 1.0;
        totalWeight += weight;
        if (opinion.verdict === 'approve') weightedApprove += weight;
        if (opinion.verdict === 'reject') weightedReject += weight;
      }
      
      if (weightedApprove > totalWeight / 2) {
        finalDecision = 'approved';
        reason = `加权多数同意`;
      } else if (weightedReject > totalWeight / 2) {
        finalDecision = 'rejected';
        reason = `加权多数反对`;
      } else {
        finalDecision = 'changes_requested';
        reason = '需要进一步讨论';
      }
      break;
      
    case 'decider':
    default:
      // 决策者决定
      const deciderOpinion = opinions.find(
        (op: StanceOpinion) => op.stanceId === 'decider'
      );
      
      if (deciderOpinion) {
        finalDecision = deciderOpinion.verdict === 'approve' 
          ? 'approved' 
          : deciderOpinion.verdict === 'reject'
            ? 'rejected'
            : 'changes_requested';
        reason = `决策者决定: ${deciderOpinion.opinion}`;
      } else {
        // 无决策者意见，使用 majority
        if (stats.approve > stats.total / 2) {
          finalDecision = 'approved';
          reason = `多数同意 (${stats.approve}/${stats.total})`;
        } else {
          finalDecision = 'changes_requested';
          reason = '需要决策者介入';
        }
      }
      break;
  }
  
  return {
    success: true,
    aggregation_result: {
      method: aggregation_method,
      statistics: stats,
      final_decision: finalDecision,
      reason,
      opinions,
    },
  };
};

// ========== 注册处理器 ==========

/**
 * 立场相关处理器映射
 */
export const stanceHandlers: Record<string, BuiltinHandler> = {
  'define-stance': defineStanceHandler,
  'list-stances': listStancesHandler,
  'stance-review': stanceReviewHandler,
  'multi-stance-review': multiStanceReviewHandler,
  'aggregate-opinions': aggregateOpinionsHandler,
};
