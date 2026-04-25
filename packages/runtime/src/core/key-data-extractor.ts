/**
 * 关键数据提取器
 * 
 * 功能：
 * - 从 Agent 输出中提取结构化数据
 * - 根据 StepOutput 定义匹配字段
 * - 支持正则匹配和 JSON 解析
 */

import { StepDefinition, StepOutput } from './types';

/**
 * 提取的关键数据
 */
export interface KeyData {
  // 文件变更
  files_changed?: string[];
  files_created?: string[];
  files_modified?: string[];
  files_deleted?: string[];
  
  // Git 信息
  commit_hash?: string;
  commit_message?: string;
  branch?: string;
  
  // 测试结果
  tests_passed?: boolean;
  tests_passed_count?: number;
  tests_failed_count?: number;
  test_coverage?: number;
  
  // 状态信息
  status?: 'success' | 'failed' | 'partial';
  summary?: string;
  error_message?: string;
  
  // 其他（根据 step 定义）
  [key: string]: any;
}

/**
 * 提取规则
 */
interface ExtractRule {
  field: string;
  patterns: RegExp[];
  type: 'string' | 'array' | 'boolean' | 'number';
}

/**
 * 默认提取规则
 */
const DEFAULT_RULES: ExtractRule[] = [
  // 文件变更
  {
    field: 'files_changed',
    patterns: [
      /(?:files_changed|files changed|修改的文件)[:\s]*\[([^\]]+)\]/i,
      /(?:files_changed|files changed|修改的文件)[:\s]*([^\n]+)/i,
    ],
    type: 'array',
  },
  {
    field: 'files_created',
    patterns: [
      /(?:created|创建)[:\s]*([^\n]+)/i,
      /\+\+\+ b\/([^\n]+)/g,
    ],
    type: 'array',
  },
  {
    field: 'files_modified',
    patterns: [
      /(?:modified|修改)[:\s]*([^\n]+)/i,
    ],
    type: 'array',
  },
  {
    field: 'files_deleted',
    patterns: [
      /(?:deleted|删除)[:\s]*([^\n]+)/i,
    ],
    type: 'array',
  },
  
  // Git 信息
  {
    field: 'commit_hash',
    patterns: [
      /(?:commit hash|commit)[:\s]*([a-f0-9]{7,40})/i,
      /^([a-f0-9]{7,40})$/m,
    ],
    type: 'string',
  },
  {
    field: 'commit_message',
    patterns: [
      /(?:commit message)[:\s]*([^\n]+)/i,
    ],
    type: 'string',
  },
  
  // 测试结果
  {
    field: 'tests_passed',
    patterns: [
      /(?:tests passed|测试通过)[:\s]*(true|yes|✓|passed)/i,
      /(?:tests failed|测试失败)[:\s]*(false|no|✗|failed)/i,
    ],
    type: 'boolean',
  },
  {
    field: 'tests_passed_count',
    patterns: [
      /(\d+)\s*(?:passed|通过)/i,
      /(?:passed|通过)[:\s]*(\d+)/i,
    ],
    type: 'number',
  },
  {
    field: 'tests_failed_count',
    patterns: [
      /(\d+)\s*(?:failed|失败)/i,
      /(?:failed|失败)[:\s]*(\d+)/i,
    ],
    type: 'number',
  },
  
  // 状态
  {
    field: 'status',
    patterns: [
      /(?:status|状态)[:\s]*(success|failed|partial)/i,
      /(?:completed successfully|成功完成)/i,
    ],
    type: 'string',
  },
  {
    field: 'summary',
    patterns: [
      /(?:summary|摘要|总结)[:\s]*([^\n]+)/i,
    ],
    type: 'string',
  },
  {
    field: 'error_message',
    patterns: [
      /(?:error|错误)[:\s]*([^\n]+)/i,
    ],
    type: 'string',
  },
];

/**
 * 从输出中提取关键数据
 */
export function extractKeyData(
  output: string | object,
  stepDef?: StepDefinition
): KeyData {
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
  const result: KeyData = {};
  
  // 1. 尝试解析 JSON 输出
  const jsonData = tryParseJson(outputStr);
  if (jsonData) {
    const data = jsonData as Record<string, any>;
    // 如果输出本身就是 JSON，直接提取字段
    if (stepDef?.outputs) {
      for (const outputDef of stepDef.outputs) {
        if (data[outputDef.name] !== undefined) {
          result[outputDef.name] = data[outputDef.name];
        }
      }
    }
    // 也提取常见的字段
    Object.assign(result, extractCommonFields(jsonData));
  }
  
  // 2. 使用规则提取（即使 JSON 解析成功也补充）
  for (const rule of DEFAULT_RULES) {
    if (result[rule.field] !== undefined) continue; // 已有值则跳过
    
    const extracted = applyRule(outputStr, rule);
    if (extracted !== undefined) {
      result[rule.field] = extracted;
    }
  }
  
  // 3. 根据 step 定义补充
  if (stepDef?.outputs) {
    for (const outputDef of stepDef.outputs) {
      if (result[outputDef.name] === undefined) {
        // 尝试从输出中提取该字段
        const value = extractByDefinition(outputStr, outputDef);
        if (value !== undefined) {
          result[outputDef.name] = value;
        }
      }
    }
  }
  
  // 4. 生成默认 summary（如果没有）
  if (!result.summary) {
    result.summary = generateDefaultSummary(outputStr, result);
  }
  
  return result;
}

/**
 * 尝试解析 JSON
 */
function tryParseJson(text: string): object | null {
  // 尝试直接解析
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
  } catch {}
  
  // 尝试提取 JSON 块
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {}
  }
  
  // 尝试找 JSON 对象
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {}
  }
  
  return null;
}

/**
 * 从 JSON 对象提取常见字段
 */
function extractCommonFields(jsonData: object): Partial<KeyData> {
  const result: Partial<KeyData> = {};
  const data = jsonData as Record<string, any>;
  
  // 直接映射
  const directMappings = [
    'files_changed', 'files_created', 'files_modified', 'files_deleted',
    'commit_hash', 'commit_message', 'branch',
    'tests_passed', 'tests_passed_count', 'tests_failed_count', 'test_coverage',
    'status', 'summary', 'error_message',
  ];
  
  for (const field of directMappings) {
    if (data[field] !== undefined) {
      result[field] = data[field];
    }
  }
  
  // 别名映射
  if (data.files && !result.files_changed) {
    result.files_changed = data.files;
  }
  if (data.commit && !result.commit_hash) {
    result.commit_hash = data.commit;
  }
  if (data.passed && !result.tests_passed) {
    result.tests_passed = data.passed;
  }
  
  return result;
}

/**
 * 应用提取规则
 */
function applyRule(text: string, rule: ExtractRule): any {
  for (const pattern of rule.patterns) {
    // 全局匹配时收集所有结果
    if (pattern.global) {
      const matches: string[] = [];
      let match;
      pattern.lastIndex = 0; // 重置
      while ((match = pattern.exec(text)) !== null) {
        if (match[1]) matches.push(match[1].trim());
      }
      if (matches.length > 0) {
        return rule.type === 'array' ? matches : matches[0];
      }
    } else {
      const match = text.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        return convertType(value, rule.type);
      }
      // 有些规则直接匹配整体（如 status）
      if (match) {
        return rule.field === 'status' ? 'success' : match[0];
      }
    }
  }
  return undefined;
}

/**
 * 类型转换
 */
function convertType(value: string, type: string): any {
  switch (type) {
    case 'boolean':
      return /^(true|yes|✓|passed|成功)/i.test(value);
    case 'number':
      const num = parseInt(value, 10);
      return isNaN(num) ? undefined : num;
    case 'array':
      // 尝试解析数组字符串
      if (value.startsWith('[')) {
        try {
          return JSON.parse(value);
        } catch {}
      }
      // 按逗号/换行分割
      return value.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
    default:
      return value;
  }
}

/**
 * 根据 StepOutput 定义提取
 */
function extractByDefinition(text: string, outputDef: StepOutput): any {
  const fieldName = outputDef.name;
  
  // 尝试匹配字段名
  const pattern = new RegExp(
    `${fieldName}[:\\s]*([^\\n]+)`,
    'i'
  );
  
  const match = text.match(pattern);
  if (match && match[1]) {
    return convertType(match[1].trim(), outputDef.type);
  }
  
  return undefined;
}

/**
 * 生成默认摘要
 */
function generateDefaultSummary(output: string, keyData: KeyData): string {
  const parts: string[] = [];
  
  // 文件变更
  if (keyData.files_changed?.length) {
    parts.push(`修改 ${keyData.files_changed.length} 个文件`);
  }
  
  // 提交
  if (keyData.commit_hash) {
    parts.push(`提交 ${keyData.commit_hash}`);
  }
  
  // 测试
  if (keyData.tests_passed !== undefined) {
    parts.push(keyData.tests_passed ? '测试通过' : '测试失败');
  }
  
  // 状态
  if (keyData.status) {
    parts.push(`状态: ${keyData.status}`);
  }
  
  // 错误
  if (keyData.error_message) {
    parts.push(`错误: ${keyData.error_message.slice(0, 50)}`);
  }
  
  if (parts.length > 0) {
    return parts.join('，');
  }
  
  // 从输出中提取第一行重要信息
  const lines = output.split('\n').filter(l => l.trim());
  const importantLine = lines.find(l => 
    /^(created|modified|completed|error|success|done|finish)/i.test(l)
  );
  
  if (importantLine) {
    return importantLine.slice(0, 100);
  }
  
  // 最后取输出的前 50 字符
  return output.slice(0, 50) + (output.length > 50 ? '...' : '');
}