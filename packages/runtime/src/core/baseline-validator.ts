/**
 * Baseline Validator - baselineDecision 检查
 * 
 * 功能：
 * 1. 解析 baselineDecision
 * 2. 分析实际行为（git diff）
 * 3. 对比检测偏离
 * 4. 风险评估
 * 
 * WA-008: baseline-validator.ts（1h）
 */

/**
 * BaselineDecision 结构
 */
export interface BaselineDecision {
  decisions: Decision[];
  constraints: Constraint[];
}

/**
 * 决策
 */
export interface Decision {
  id: string;
  type: string;        // db_choice | api_design | auth_choice | tech_choice | etc
  content: string;     // 决策内容
  rationale?: string;  // 决策理由
}

/**
 * 约束
 */
export interface Constraint {
  type: 'must_use' | 'must_not_use';
  value: string;       // 约束值
}

/**
 * 偏离
 */
export interface Deviation {
  id: string;
  type: string;        // constraint_violation | tech_deviation | db_deviation | etc
  severity: 'minor' | 'major' | 'critical';
  description: string;
  baselineDecision?: string;
  actualBehavior?: string;
}

/**
 * 风险评估
 */
export interface RiskAssessment {
  riskLevel: number;     // 0-18
  constraintLevel: 'L1' | 'L2' | 'L3' | 'L4';
  autoDecision: 'approve' | 'reject' | 'need_review';
  recommendation: string;
}

/**
 * 风险因素
 */
export interface RiskFactors {
  severity?: number;      // 1-4（偏离类型权重）
  impact: number;         // 1-4（影响范围）
  reversibility: number;  // 0-3（可逆性）
  urgency: number;        // 0-2（紧急程度）
}

/**
 * 解析 baselineDecision
 */
export function parseBaselineDecision(baseline: string): BaselineDecision {
  const lines = baseline.split('\n').filter(l => l.trim());
  
  const decisions: Decision[] = [];
  const constraints: Constraint[] = [];
  
  for (const line of lines) {
    // 决策行：- xxx：yyy
    const decisionMatch = line.match(/^-\s*(.+)：(.+)$/);
    if (decisionMatch) {
      const [, type, content] = decisionMatch;
      decisions.push({
        id: generateDecisionId(type, content),
        type: normalizeType(type),
        content: content.trim(),
      });
    }
    
    // 约束行：必须/禁止
    if (line.includes('必须')) {
      constraints.push({
        type: 'must_use',
        value: line.replace('必须', '').replace('使用', '').trim(),
      });
    }
    if (line.includes('禁止')) {
      constraints.push({
        type: 'must_not_use',
        value: line.replace('禁止', '').replace('使用', '').trim(),
      });
    }
  }
  
  return { decisions, constraints };
}

/**
 * 标准化类型
 */
function normalizeType(type: string): string {
  const typeMap: Record<string, string> = {
    '数据库': 'db_choice',
    'API 风格': 'api_design',
    'API风格': 'api_design',
    '认证方式': 'auth_choice',
    '技术栈': 'tech_choice',
    '技术决策': 'tech_choice',
  };
  
  return typeMap[type.trim()] || type.trim();
}

/**
 * 生成决策 ID
 */
function generateDecisionId(type: string, content: string): string {
  return `${normalizeType(type)}-${content.slice(0, 20).replace(/\s+/g, '-')}`;
}

/**
 * 实际行为
 */
export interface ActualBehavior {
  techChoices: TechChoice[];
  constraintsViolated: string[];
}

export interface TechChoice {
  type: string;
  value: string;
  source: string;  // 来源（文件、代码）
}

/**
 * 从 git diff 提取技术选择
 */
export function extractTechChoicesFromGitDiff(diff: string): TechChoice[] {
  const choices: TechChoice[] = [];
  
  // 检测数据库选择
  if (diff.includes('import { Pool } from "pg"') || diff.includes('postgresql')) {
    choices.push({
      type: 'db_choice',
      value: 'PostgreSQL',
      source: 'import statement',
    });
  }
  
  if (diff.includes('mysql') || diff.includes('MySQL')) {
    choices.push({
      type: 'db_choice',
      value: 'MySQL',
      source: 'import statement',
    });
  }
  
  // 检测 ORM
  if (diff.includes('Sequelize')) {
    choices.push({
      type: 'orm_choice',
      value: 'Sequelize',
      source: 'import statement',
    });
  }
  
  if (diff.includes('Prisma')) {
    choices.push({
      type: 'orm_choice',
      value: 'Prisma',
      source: 'import statement',
    });
  }
  
  if (diff.includes('TypeORM')) {
    choices.push({
      type: 'orm_choice',
      value: 'TypeORM',
      source: 'import statement',
    });
  }
  
  // 检测 API 风格
  if (diff.includes('router.get') || diff.includes('router.post')) {
    choices.push({
      type: 'api_design',
      value: 'RESTful',
      source: 'router definition',
    });
  }
  
  if (diff.includes('graphql') || diff.includes('GraphQL')) {
    choices.push({
      type: 'api_design',
      value: 'GraphQL',
      source: 'import statement',
    });
  }
  
  // 检测认证方式
  if (diff.includes('jsonwebtoken') || diff.includes('jwt')) {
    choices.push({
      type: 'auth_choice',
      value: 'JWT',
      source: 'import statement',
    });
  }
  
  return choices;
}

/**
 * 检测约束违规
 */
export function detectConstraintViolations(diff: string, constraints: Constraint[]): string[] {
  const violations: string[] = [];
  
  // 检测是否违反 must_use
  for (const constraint of constraints) {
    if (constraint.type === 'must_use') {
      // 检查是否使用了必须的技术
      if (constraint.value.includes('TypeScript')) {
        const jsFiles = diff.match(/\.js['"]/g);
        if (jsFiles) {
          violations.push(`使用了 JavaScript 文件（约束：必须使用 ${constraint.value}）`);
        }
      }
    }
    
    if (constraint.type === 'must_not_use') {
      // 检查是否使用了禁止的技术
      if (constraint.value.includes('ORM')) {
        const ormImports = diff.match(/import.*Sequelize|import.*Prisma|import.*TypeORM/g);
        if (ormImports) {
          violations.push(`使用了 ORM（约束：禁止使用 ${constraint.value}）`);
        }
      }
    }
  }
  
  return violations;
}

/**
 * 对比 baseline vs actual
 */
export function compareBaselineVsActual(
  baseline: BaselineDecision,
  actual: ActualBehavior
): Deviation[] {
  const deviations: Deviation[] = [];
  
  // 检查约束违规
  for (const violation of actual.constraintsViolated) {
    deviations.push({
      id: `violation-${generateId(violation)}`,
      type: 'constraint_violation',
      severity: 'critical',  // 约束违规通常是严重
      description: violation,
    });
  }
  
  // 检查决策偏离
  for (const decision of baseline.decisions) {
    const actualChoice = actual.techChoices.find(c => c.type === decision.type);
    
    if (actualChoice && actualChoice.value !== decision.content) {
      deviations.push({
        id: `dev-${decision.id}`,
        type: `${decision.type}_deviation`,
        severity: calculateDeviationSeverity(decision.type, actualChoice.value),
        description: `决策偏离：${decision.type} 从 "${decision.content}" 改为 "${actualChoice.value}"`,
        baselineDecision: decision.content,
        actualBehavior: actualChoice.value,
      });
    }
  }
  
  return deviations;
}

/**
 * 计算偏离严重程度
 */
function calculateDeviationSeverity(type: string, newValue: string): 'minor' | 'major' | 'critical' {
  // 数据库变更：严重
  if (type === 'db_choice') {
    return 'critical';
  }
  
  // API 风格变更：中等
  if (type === 'api_design') {
    return 'major';
  }
  
  // 其他：轻微
  return 'minor';
}

/**
 * 评估风险
 */
export function assessRisk(
  deviations: Deviation[],
  factors: RiskFactors
): RiskAssessment {
  // 计算 Severity
  let severity = factors.severity ?? 1;
  
  if (deviations.some(d => d.type === 'constraint_violation')) {
    severity = 4;  // 约束违规 = 最高严重度
  } else if (deviations.some(d => d.severity === 'critical')) {
    severity = 4;
  } else if (deviations.some(d => d.severity === 'major')) {
    severity = 3;
  } else if (deviations.length > 0) {
    severity = 2;
  }
  
  // 计算 RiskScore
  const riskScore = severity * factors.impact - factors.reversibility + factors.urgency;
  
  // 限制范围 0-18
  const clampedRisk = Math.max(0, Math.min(18, riskScore));
  
  // 映射约束级别
  const constraintLevel = mapRiskToConstraintLevel(clampedRisk);
  
  // 生成自动决策
  const autoDecision = generateAutoDecision(constraintLevel, clampedRisk);
  
  // 生成建议
  const recommendation = generateRecommendation(constraintLevel, deviations);
  
  return {
    riskLevel: clampedRisk,
    constraintLevel,
    autoDecision,
    recommendation,
  };
}

/**
 * 映射风险到约束级别
 */
function mapRiskToConstraintLevel(riskScore: number): 'L1' | 'L2' | 'L3' | 'L4' {
  if (riskScore >= 11) return 'L4';
  if (riskScore >= 6) return 'L3';
  if (riskScore >= 3) return 'L2';
  return 'L1';
}

/**
 * 生成自动决策
 */
function generateAutoDecision(
  constraintLevel: 'L1' | 'L2' | 'L3' | 'L4',
  riskScore: number
): 'approve' | 'reject' | 'need_review' {
  // L1：自动批准
  if (constraintLevel === 'L1') {
    return 'approve';
  }
  
  // L2：低风险批准，高风险需要评审
  if (constraintLevel === 'L2') {
    if (riskScore <= 3) {
      return 'approve';
    }
    return 'need_review';
  }
  
  // L3/L4：都需要评审
  return 'need_review';
}

/**
 * 生成建议
 */
function generateRecommendation(
  constraintLevel: 'L1' | 'L2' | 'L3' | 'L4',
  deviations: Deviation[]
): string {
  if (constraintLevel === 'L1') {
    return '偏离风险低，建议自动批准';
  }
  
  if (constraintLevel === 'L2') {
    return '偏离风险中等，建议快速评审后批准';
  }
  
  if (constraintLevel === 'L3') {
    return `偏离风险较高，需要 ${deviations.length} 个偏离评审`;
  }
  
  if (constraintLevel === 'L4') {
    return `偏离风险极高，建议架构师 + CEO 参与评审`;
  }
  
  return '';
}

/**
 * 生成 ID
 */
function generateId(content: string): string {
  return content.slice(0, 20).replace(/\s+/g, '-').toLowerCase();
}

/**
 * 验证 baselineDecision 偏离
 */
export async function verifyBaselineDeviation(
  baseline: string,
  gitDiff: string
): Promise<{ passed: boolean; deviation?: Deviation; assessment?: RiskAssessment }> {
  // 解析 baseline
  const baselineParsed = parseBaselineDecision(baseline);
  
  // 提取实际行为
  const techChoices = extractTechChoicesFromGitDiff(gitDiff);
  const constraintsViolated = detectConstraintViolations(gitDiff, baselineParsed.constraints);
  
  const actual: ActualBehavior = {
    techChoices,
    constraintsViolated,
  };
  
  // 对比检测偏离
  const deviations = compareBaselineVsActual(baselineParsed, actual);
  
  if (deviations.length === 0) {
    return { passed: true };
  }
  
  // 评估风险
  const assessment = assessRisk(deviations, {
    impact: 2,        // 默认单个模块
    reversibility: 2, // 默认可回滚
    urgency: 0,       // 默认不紧急
  });
  
  return {
    passed: false,
    deviation: deviations[0],
    assessment,
  };
}