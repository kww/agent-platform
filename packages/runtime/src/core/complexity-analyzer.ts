/**
 * 需求复杂度分析器
 * 
 * 判断用户需求是简单需求还是复杂需求
 * - 简单需求：直接执行
 * - 复杂需求：进入 brainstorming 讨论
 */

import * as fs from 'fs';
import * as path from 'path';

// OpenClaw 配置路径
const OPENCLAW_CONFIG_PATH = path.join(process.env.HOME || '/root', '.openclaw/openclaw.json');

export interface ComplexityAnalysis {
  level: 'simple' | 'moderate' | 'complex';
  confidence: number; // 0-1
  reasons: string[];
  suggestion: 'execute' | 'clarify' | 'brainstorm';
  questions?: string[];
}

/**
 * 关键词规则匹配
 */
const COMPLEXITY_RULES = {
  // 简单需求关键词
  simple: [
    // Bug 修复
    '修复', 'fix', 'bug', '报错', '错误', '异常', '崩溃',
    // 配置修改
    '配置', 'config', '设置', '修改', '改', '更新',
    // 文档
    '文档', 'readme', '注释', '说明',
    // 小改动
    '改个', '换个', '加个', '删个', '调整',
    // 明确的 TODO
    'todo', '待办', '完善'
  ],
  
  // 复杂需求关键词
  complex: [
    // 新功能
    '新功能', '开发', '实现', '新增', '添加功能', 'feature',
    // 架构
    '架构', '设计', '重构', '迁移', '升级',
    // 探索性
    '探索', '调研', '分析', '方案', '怎么实现',
    // 多模块
    '系统', '平台', '模块', '集成',
    // 讨论型
    '讨论', '头脑风暴', 'brainstorm', '评审', '审查'
  ]
};

/**
 * 简单需求模式
 */
const SIMPLE_PATTERNS = [
  /修复.*bug/i,
  /fix.*error/i,
  /改(一下|个).*/i,
  /更新?.*(文档|配置|readme)/i,
  /添加?.*(注释|说明)/i,
  /删除?.*(文件|代码)/i,
  /^todo:?.*/i,
  /^\[.*\].*修复/i
];

/**
 * 复杂需求模式
 */
const COMPLEX_PATTERNS = [
  /开发.*功能/i,
  /实现.*系统/i,
  /重构.*/i,
  /架构设计/i,
  /怎么(实现|做).*/i,
  /方案(设计|讨论)/i,
  /新(增|建).*(功能|模块|系统)/i,
  /从零(开始)?(开发|构建)/i
];

/**
 * 分析需求复杂度
 */
export async function analyzeComplexity(input: string): Promise<ComplexityAnalysis> {
  const lowerInput = input.toLowerCase();
  const reasons: string[] = [];
  let simpleScore = 0;
  let complexScore = 0;
  
  // 1. 关键词匹配
  for (const keyword of COMPLEXITY_RULES.simple) {
    if (lowerInput.includes(keyword)) {
      simpleScore += 1;
      reasons.push(`包含简单关键词: "${keyword}"`);
    }
  }
  
  for (const keyword of COMPLEXITY_RULES.complex) {
    if (lowerInput.includes(keyword)) {
      complexScore += 1;
      reasons.push(`包含复杂关键词: "${keyword}"`);
    }
  }
  
  // 2. 模式匹配
  for (const pattern of SIMPLE_PATTERNS) {
    if (pattern.test(input)) {
      simpleScore += 2;
      reasons.push(`匹配简单模式: ${pattern}`);
    }
  }
  
  for (const pattern of COMPLEX_PATTERNS) {
    if (pattern.test(input)) {
      complexScore += 2;
      reasons.push(`匹配复杂模式: ${pattern}`);
    }
  }
  
  // 3. 长度和结构分析
  const words = input.split(/[\s,，。.!！?？;；:：]+/).filter(w => w.length > 0);
  
  if (words.length < 5) {
    simpleScore += 1;
    reasons.push('描述简短（少于 5 个词）');
  } else if (words.length > 20) {
    complexScore += 1;
    reasons.push('描述详细（超过 20 个词）');
  }
  
  // 4. 问句检测（通常需要讨论）
  if (/[？?]/.test(input) || /^(怎么|如何|为什么|是否)/.test(input)) {
    complexScore += 1;
    reasons.push('包含疑问，可能需要讨论');
  }
  
  // 5. 计算 confidence 和判断
  const totalScore = simpleScore + complexScore;
  const confidence = totalScore > 0 ? Math.max(simpleScore, complexScore) / totalScore : 0.5;
  
  let level: 'simple' | 'moderate' | 'complex';
  let suggestion: 'execute' | 'clarify' | 'brainstorm';
  let questions: string[] | undefined;
  
  if (complexScore > simpleScore * 1.5) {
    level = 'complex';
    suggestion = 'brainstorm';
    questions = generateClarifyingQuestions(input);
  } else if (simpleScore > complexScore * 1.5) {
    level = 'simple';
    suggestion = 'execute';
  } else {
    level = 'moderate';
    suggestion = 'clarify';
    questions = generateClarifyingQuestions(input);
  }
  
  return {
    level,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
    suggestion,
    questions
  };
}

/**
 * 生成澄清问题
 */
function generateClarifyingQuestions(input: string): string[] {
  const questions: string[] = [];
  
  // 根据输入内容生成问题
  if (/开发|实现|新增/i.test(input)) {
    questions.push('这是一个新功能还是对现有功能的改进？');
    questions.push('预期的完成时间是什么时候？');
  }
  
  if (/重构|架构/i.test(input)) {
    questions.push('重构的主要目标是什么？（性能/可维护性/扩展性）');
    questions.push('是否有现有的测试覆盖？');
  }
  
  if (/怎么|如何/i.test(input)) {
    questions.push('你已经有初步的想法了吗？');
    questions.push('是否需要我提供多个方案供选择？');
  }
  
  // 默认问题
  if (questions.length === 0) {
    questions.push('能否提供更多上下文信息？');
    questions.push('这个需求的优先级如何？');
  }
  
  return questions;
}

/**
 * 使用 LLM 分析复杂度（更智能）
 */
export async function analyzeComplexityWithLLM(input: string): Promise<ComplexityAnalysis> {
  // 先用规则快速判断
  const ruleBasedResult = await analyzeComplexity(input);
  
  // 如果规则判断置信度高，直接返回
  if (ruleBasedResult.confidence > 0.8) {
    return ruleBasedResult;
  }
  
  // 否则调用 LLM 进行更精确的分析
  try {
    const config = getOpenClawLLMConfig();
    if (!config) {
      return ruleBasedResult;
    }
    
    const prompt = `分析以下需求的复杂度，并判断应该直接执行还是需要讨论。

需求：${input}

判断标准：
- 简单需求：修复 bug、配置修改、文档更新、单文件修改、明确的 TODO
- 复杂需求：新功能设计、架构重构、探索性开发、多模块协作、需要讨论方案

请以 JSON 格式返回：
{
  "level": "simple" | "moderate" | "complex",
  "confidence": 0.0-1.0,
  "suggestion": "execute" | "clarify" | "brainstorm",
  "reasons": ["原因1", "原因2"],
  "questions": ["澄清问题1", "澄清问题2"]
}

只返回 JSON，不要其他内容。`;

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      return ruleBasedResult;
    }

    const data = await response.json() as {
      choices?: Array<{
        message?: { content?: string };
      }>;
    };
    const content = data.choices?.[0]?.message?.content || '';
    
    // 解析 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        level: parsed.level || ruleBasedResult.level,
        confidence: parsed.confidence || ruleBasedResult.confidence,
        reasons: parsed.reasons || ruleBasedResult.reasons,
        suggestion: parsed.suggestion || ruleBasedResult.suggestion,
        questions: parsed.questions || ruleBasedResult.questions
      };
    }
  } catch (error) {
    // LLM 调用失败，返回规则结果
    console.error('[ComplexityAnalyzer] LLM analysis failed:', error);
  }
  
  return ruleBasedResult;
}

/**
 * 获取 OpenClaw LLM 配置
 */
function getOpenClawLLMConfig(): { apiKey: string; baseUrl: string; model: string } | null {
  try {
    if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      return null;
    }
    
    const content = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content);
    
    const primaryModel = config.agents?.defaults?.model?.primary;
    if (!primaryModel) return null;
    
    const [providerName, modelName] = primaryModel.split('/');
    const providerConfig = config.models?.providers?.[providerName];
    
    if (!providerConfig) return null;
    
    let apiKey = providerConfig.apiKey;
    if (apiKey && !apiKey.startsWith('sk-')) {
      apiKey = process.env[apiKey] || apiKey;
    }
    
    return {
      apiKey,
      baseUrl: providerConfig.baseUrl,
      model: modelName || 'glm-5',
    };
  } catch (error) {
    return null;
  }
}

/**
 * 格式化分析结果为用户友好的消息
 */
export function formatAnalysisResult(result: ComplexityAnalysis): string {
  const levelEmoji = {
    simple: '🟢',
    moderate: '🟡',
    complex: '🔴'
  };
  
  const suggestionText = {
    execute: '可以直接执行',
    clarify: '需要更多信息',
    brainstorm: '建议进行头脑风暴讨论'
  };
  
  let message = `${levelEmoji[result.level]} **需求复杂度：${result.level.toUpperCase()}**\n`;
  message += `置信度：${(result.confidence * 100).toFixed(0)}%\n`;
  message += `建议：${suggestionText[result.suggestion]}\n\n`;
  
  if (result.reasons.length > 0) {
    message += `**判断依据：**\n`;
    message += result.reasons.map(r => `- ${r}`).join('\n');
  }
  
  if (result.questions && result.questions.length > 0) {
    message += `\n\n**澄清问题：**\n`;
    message += result.questions.map(q => `- ${q}`).join('\n');
  }
  
  return message;
}
