/**
 * CSO (Concise Skill Optimization) 验证器
 * 
 * 确保所有技能的 description 只描述触发条件，不总结工作流
 */

import { WorkflowMeta, SkillMeta, ToolMeta, StepDefinition } from './types';

/**
 * CSO 验证结果
 */
export interface CSOValidationResult {
  /** 是否符合 CSO 格式 */
  valid: boolean;
  /** 错误消息 */
  message?: string;
  /** 建议的 description */
  suggestion?: string;
  /** 检测到的问题 */
  issues?: CSOIssue[];
}

/**
 * CSO 问题
 */
export interface CSOIssue {
  /** 问题类型 */
  type: 'workflow_summary' | 'step_description' | 'missing_trigger' | 'too_long';
  /** 问题描述 */
  message: string;
  /** 问题位置 */
  position?: {
    start: number;
    end: number;
  };
}

/**
 * CSO 验证器
 */
export class CSOValidator {
  private static instance: CSOValidator;

  // 工作流总结关键词（不应出现在 description 中）
  private static WORKFLOW_KEYWORDS = [
    'step 1',
    'step 2',
    'phase 1',
    'phase 2',
    'first',
    'then',
    'after',
    '流程',
    '步骤',
    '阶段',
    '第一步',
    '第二步',
    '首先',
    '然后',
    '接着',
    '最后',
  ];

  // 触发条件关键词（应该出现在 description 中）
  private static TRIGGER_KEYWORDS = [
    'use when',
    'use before',
    'use after',
    'use for',
    '用于',
    '当',
    '在',
    '适用于',
    '触发',
  ];

  private constructor() {}

  static getInstance(): CSOValidator {
    if (!CSOValidator.instance) {
      CSOValidator.instance = new CSOValidator();
    }
    return CSOValidator.instance;
  }

  /**
   * 验证 Workflow 的 description
   */
  validateWorkflow(workflow: WorkflowMeta): CSOValidationResult {
    return this.validateDescription(workflow.description, 'workflow');
  }

  /**
   * 验证 Step 的 description
   */
  validateStep(step: SkillMeta): CSOValidationResult {
    return this.validateDescription(step.description, 'step');
  }

  /**
   * 验证 Tool 的 description
   */
  validateTool(tool: ToolMeta): CSOValidationResult {
    return this.validateDescription(tool.description, 'tool');
  }

  /**
   * 验证 description 格式
   */
  validateDescription(description: string, type: 'workflow' | 'step' | 'tool'): CSOValidationResult {
    if (!description || description.trim() === '') {
      return {
        valid: false,
        message: 'description 不能为空',
        issues: [{ type: 'missing_trigger', message: '缺少描述' }],
      };
    }

    const issues: CSOIssue[] = [];
    const lowerDescription = description.toLowerCase();

    // 检查是否包含工作流总结关键词
    for (const keyword of CSOValidator.WORKFLOW_KEYWORDS) {
      if (lowerDescription.includes(keyword.toLowerCase())) {
        issues.push({
          type: 'workflow_summary',
          message: `description 不应包含工作流总结关键词: "${keyword}"`,
        });
      }
    }

    // 检查是否包含触发条件关键词
    const hasTriggerKeyword = CSOValidator.TRIGGER_KEYWORDS.some(kw =>
      lowerDescription.includes(kw.toLowerCase())
    );

    if (!hasTriggerKeyword && type === 'tool') {
      // 工具类型不强要求触发条件关键词
    } else if (!hasTriggerKeyword && type === 'step') {
      issues.push({
        type: 'missing_trigger',
        message: 'description 建议包含触发条件（如 "Use when..."）',
      });
    }

    // 检查长度
    if (description.length > 200) {
      issues.push({
        type: 'too_long',
        message: `description 过长（${description.length} 字符），建议不超过 200 字符`,
      });
    }

    // 返回结果
    if (issues.length > 0) {
      return {
        valid: false,
        message: issues[0].message,
        issues,
        suggestion: this.generateTriggerOnlyDescription(type),
      };
    }

    return { valid: true };
  }

  /**
   * 生成只包含触发条件的 description
   */
  private generateTriggerOnlyDescription(type: 'workflow' | 'step' | 'tool'): string {
    const triggers = {
      workflow: 'Use when starting a new development task or project',
      step: 'Use when the task requires this specific step',
      tool: 'Use when the operation matches this tool\'s capability',
    };

    return triggers[type];
  }

  /**
   * 批量验证所有技能
   */
  async validateAll(
    workflows: WorkflowMeta[],
    steps: (SkillMeta | StepDefinition)[],
    tools: ToolMeta[]
  ): Promise<{
    workflows: Array<{ id: string; result: CSOValidationResult }>;
    steps: Array<{ id: string; result: CSOValidationResult }>;
    tools: Array<{ id: string; result: CSOValidationResult }>;
    summary: {
      total: number;
      valid: number;
      invalid: number;
    };
  }> {
    const workflowResults = workflows.map(w => ({
      id: w.id,
      result: this.validateWorkflow(w),
    }));

    const stepResults = steps.map(s => ({
      id: s.id || s.name,
      result: this.validateStep(s as SkillMeta),
    }));

    const toolResults = tools.map(t => ({
      id: t.id,
      result: this.validateTool(t),
    }));

    const allResults = [...workflowResults, ...stepResults, ...toolResults];
    const valid = allResults.filter(r => r.result.valid).length;
    const invalid = allResults.filter(r => !r.result.valid).length;

    return {
      workflows: workflowResults,
      steps: stepResults,
      tools: toolResults,
      summary: {
        total: allResults.length,
        valid,
        invalid,
      },
    };
  }

  /**
   * 优化 description（移除工作流总结，保留触发条件）
   */
  optimizeDescription(description: string, type: 'workflow' | 'step' | 'tool'): string {
    // 如果已经符合 CSO 格式，直接返回
    const result = this.validateDescription(description, type);
    if (result.valid) {
      return description;
    }

    // 否则返回建议的 description
    return result.suggestion || this.generateTriggerOnlyDescription(type);
  }
}

// 导出单例
export const csoValidator = CSOValidator.getInstance();

/**
 * 快捷函数：验证 description
 */
export function validateCSO(
  description: string,
  type: 'workflow' | 'step' | 'tool'
): CSOValidationResult {
  return csoValidator.validateDescription(description, type);
}
