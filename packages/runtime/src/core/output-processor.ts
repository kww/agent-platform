/**
 * 智能输出处理器 (P1)
 * 
 * 功能：
 * - 输出分类：critical / important / compressible
 * - critical 完整保留（错误、决策）
 * - important 结构化保留（文件、commit、测试结果）
 * - compressible 生成摘要（日志、进度）
 */

import { TokenTracker } from './token-tracker';

/**
 * 输出类别
 */
export type OutputCategory = 'critical' | 'important' | 'compressible';

/**
 * 输出类型
 */
export type OutputType = 
  | 'error'
  | 'decision'
  | 'file_change'
  | 'commit'
  | 'test_result'
  | 'api_response'
  | 'log'
  | 'progress'
  | 'code'
  | 'explanation';

/**
 * 分类规则
 */
const CATEGORY_RULES: Record<OutputType, OutputCategory> = {
  error: 'critical',
  decision: 'critical',
  file_change: 'important',
  commit: 'important',
  test_result: 'important',
  api_response: 'important',
  log: 'compressible',
  progress: 'compressible',
  code: 'important',
  explanation: 'compressible',
};

/**
 * 分类后的输出
 */
export interface ClassifiedOutput {
  stepId: string;
  type: OutputType;
  category: OutputCategory;
  original: string;
  processed: string;
  tokens: number;
  savedTokens: number;
  metadata?: Record<string, any>;
}

/**
 * 输出处理结果
 */
export interface ProcessingResult {
  originalTokens: number;
  processedTokens: number;
  savedTokens: number;
  savingsPercentage: number;
  outputs: ClassifiedOutput[];
}

/**
 * 输出处理器配置
 */
export interface OutputProcessorOptions {
  preserveCritical?: boolean;      // 默认 true
  preserveImportant?: boolean;     // 默认 true
  compressThreshold?: number;      // 压缩阈值，默认 1000 tokens
  maxOutputLength?: number;        // 单个输出最大长度
  tokenTracker?: TokenTracker;
}

/**
 * 输出处理器内部配置
 */
interface OutputProcessorConfig {
  preserveCritical: boolean;
  preserveImportant: boolean;
  compressThreshold: number;
  maxOutputLength: number;
  tokenTracker?: TokenTracker;
}

/**
 * 智能输出处理器
 */
export class OutputProcessor {
  private config: OutputProcessorConfig;
  private tokenTracker?: TokenTracker;
  
  constructor(options: OutputProcessorOptions = {}) {
    this.config = {
      preserveCritical: options.preserveCritical ?? true,
      preserveImportant: options.preserveImportant ?? true,
      compressThreshold: options.compressThreshold ?? 1000,
      maxOutputLength: options.maxOutputLength ?? 10000,
      tokenTracker: options.tokenTracker,
    };
    
    this.tokenTracker = options.tokenTracker;
  }
  
  /**
   * 检测输出类型
   */
  detectType(output: string, stepContext?: { hasAgent?: boolean; hasError?: boolean }): OutputType {
    const lowerOutput = output.toLowerCase();
    
    // 错误
    if (stepContext?.hasError || 
        lowerOutput.includes('error:') ||
        lowerOutput.includes('failed:') ||
        lowerOutput.includes('exception:')) {
      return 'error';
    }
    
    // 决策
    if (lowerOutput.includes('decision:') ||
        lowerOutput.includes('决定:') ||
        lowerOutput.includes('选择方案:') ||
        lowerOutput.includes('approved:') ||
        lowerOutput.includes('rejected:')) {
      return 'decision';
    }
    
    // 文件变更
    if (lowerOutput.includes('created:') ||
        lowerOutput.includes('modified:') ||
        lowerOutput.includes('deleted:') ||
        lowerOutput.includes('file:') ||
        /^\+\+\+ b\//m.test(output) ||
        /^--- a\//m.test(output)) {
      return 'file_change';
    }
    
    // 提交
    if (lowerOutput.includes('commit:') ||
        lowerOutput.includes('commit hash:') ||
        /^[a-f0-9]{7,40}/.test(output)) {
      return 'commit';
    }
    
    // 测试结果
    if (lowerOutput.includes('test passed:') ||
        lowerOutput.includes('test failed:') ||
        lowerOutput.includes('tests:') ||
        lowerOutput.includes('passed:') ||
        lowerOutput.includes('failed:')) {
      return 'test_result';
    }
    
    // API 响应
    if (lowerOutput.includes('status:') ||
        lowerOutput.includes('response:') ||
        lowerOutput.startsWith('{') ||
        lowerOutput.startsWith('[')) {
      return 'api_response';
    }
    
    // 代码
    if (lowerOutput.includes('```') ||
        /^\s*(function|const|let|var|class|import|export)/m.test(output)) {
      return 'code';
    }
    
    // 进度
    if (lowerOutput.includes('progress:') ||
        lowerOutput.includes('step:') ||
        lowerOutput.includes('running:') ||
        lowerOutput.includes('completed:')) {
      return 'progress';
    }
    
    // 默认为日志
    return 'log';
  }
  
  /**
   * 获取输出类别
   */
  getCategory(type: OutputType): OutputCategory {
    return CATEGORY_RULES[type];
  }
  
  /**
   * 压缩输出
   */
  compress(output: string, type: OutputType): string {
    // 如果已经很短，不需要压缩
    if (output.length < 500) return output;
    
    switch (type) {
      case 'log':
        return this.compressLog(output);
      case 'progress':
        return this.compressProgress(output);
      case 'explanation':
        return this.compressExplanation(output);
      case 'code':
        return this.compressCode(output);
      default:
        return this.truncate(output, this.config.maxOutputLength);
    }
  }
  
  /**
   * 压缩日志
   */
  private compressLog(log: string): string {
    const lines = log.split('\n');
    const importantLines: string[] = [];
    let skippedCount = 0;
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      // 保留重要行
      if (lowerLine.includes('error') ||
          lowerLine.includes('warn') ||
          lowerLine.includes('fail') ||
          lowerLine.includes('success') ||
          lowerLine.includes('complete')) {
        importantLines.push(line);
      } else {
        skippedCount++;
      }
    }
    
    const summary = skippedCount > 0 
      ? `\n... [已省略 ${skippedCount} 行普通日志]`
      : '';
    
    return importantLines.slice(0, 20).join('\n') + summary;
  }
  
  /**
   * 压缩进度信息
   */
  private compressProgress(progress: string): string {
    // 提取最终状态
    const lines = progress.split('\n');
    const lastLines = lines.slice(-5);
    const firstLines = lines.slice(0, 3);
    
    const skipped = lines.length - 8;
    const middle = skipped > 0 ? `\n... [${skipped} 行进度已省略]` : '';
    
    return firstLines.join('\n') + middle + '\n' + lastLines.join('\n');
  }
  
  /**
   * 压缩解释说明
   */
  private compressExplanation(explanation: string): string {
    // 提取首尾段落
    const paragraphs = explanation.split('\n\n');
    if (paragraphs.length <= 3) return explanation;
    
    const first = paragraphs[0];
    const last = paragraphs[paragraphs.length - 1];
    const middleCount = paragraphs.length - 2;
    
    return `${first}\n\n... [已省略 ${middleCount} 个段落]\n\n${last}`;
  }
  
  /**
   * 压缩代码
   */
  private compressCode(code: string): string {
    // 提取函数签名和关键结构
    const lines = code.split('\n');
    if (lines.length <= 30) return code;
    
    const signature: string[] = [];
    const body: string[] = [];
    let inSignature = true;
    
    for (const line of lines) {
      if (inSignature) {
        signature.push(line);
        if (line.includes('{')) {
          inSignature = false;
        }
      } else {
        body.push(line);
      }
    }
    
    const lastLines = body.slice(-10);
    const skipped = body.length - 10;
    
    return [
      ...signature,
      `  // ... [已省略 ${skipped} 行代码]`,
      ...lastLines,
    ].join('\n');
  }
  
  /**
   * 截断输出
   */
  private truncate(output: string, maxLength: number): string {
    if (output.length <= maxLength) return output;
    
    const half = Math.floor(maxLength / 2);
    return output.slice(0, half) + 
           `\n... [已省略 ${output.length - maxLength} 字符] ...\n` +
           output.slice(-half);
  }
  
  /**
   * 处理单个输出
   */
  processOutput(
    stepId: string, 
    output: string, 
    stepContext?: { hasAgent?: boolean; hasError?: boolean }
  ): ClassifiedOutput {
    const type = this.detectType(output, stepContext);
    const category = this.getCategory(type);
    const originalTokens = this.tokenTracker?.estimateTokens(output) || 
                           Math.ceil(output.length / 4);
    
    let processed = output;
    
    // 根据类别决定是否压缩
    if (category === 'compressible') {
      processed = this.compress(output, type);
    } else if (category === 'important' && output.length > this.config.maxOutputLength) {
      processed = this.truncate(output, this.config.maxOutputLength);
    }
    // critical 完整保留
    
    const processedTokens = this.tokenTracker?.estimateTokens(processed) || 
                            Math.ceil(processed.length / 4);
    
    return {
      stepId,
      type,
      category,
      original: output,
      processed,
      tokens: processedTokens,
      savedTokens: originalTokens - processedTokens,
    };
  }
  
  /**
   * 批量处理输出
   */
  processOutputs(
    outputs: Array<{ stepId: string; output: string; hasError?: boolean }>
  ): ProcessingResult {
    let originalTokens = 0;
    let processedTokens = 0;
    const classifiedOutputs: ClassifiedOutput[] = [];
    
    for (const { stepId, output, hasError } of outputs) {
      const classified = this.processOutput(stepId, output, { hasError });
      classifiedOutputs.push(classified);
      
      originalTokens += this.tokenTracker?.estimateTokens(output) || 
                        Math.ceil(output.length / 4);
      processedTokens += classified.tokens;
    }
    
    const savedTokens = originalTokens - processedTokens;
    
    return {
      originalTokens,
      processedTokens,
      savedTokens,
      savingsPercentage: Math.round((savedTokens / originalTokens) * 100),
      outputs: classifiedOutputs,
    };
  }
  
  /**
   * 生成压缩报告
   */
  generateReport(result: ProcessingResult): string {
    const lines = [
      `## 📊 输出处理报告`,
      ``,
      `**原始 Token**: ${result.originalTokens.toLocaleString()}`,
      `**处理后 Token**: ${result.processedTokens.toLocaleString()}`,
      `**节省 Token**: ${result.savedTokens.toLocaleString()} (${result.savingsPercentage}%)`,
      ``,
      `### 分类统计`,
      ``,
    ];
    
    const byCategory = {
      critical: 0,
      important: 0,
      compressible: 0,
    };
    
    for (const output of result.outputs) {
      byCategory[output.category]++;
    }
    
    lines.push(`- 🔴 Critical: ${byCategory.critical} 个（完整保留）`);
    lines.push(`- 🟡 Important: ${byCategory.important} 个（结构化保留）`);
    lines.push(`- 🟢 Compressible: ${byCategory.compressible} 个（已压缩）`);
    
    return lines.join('\n');
  }
}

/**
 * 创建输出处理器
 */
export function createOutputProcessor(options?: OutputProcessorOptions): OutputProcessor {
  return new OutputProcessor(options);
}
