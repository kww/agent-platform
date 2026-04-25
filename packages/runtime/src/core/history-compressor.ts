/**
 * 历史压缩策略
 * 
 * 功能：
 * 1. 滑动窗口：只保留最近 N 步完整输出
 * 2. 分层存储：摘要 + 关键数据 + 完整日志文件
 * 3. 按重要性裁剪（错误 > 警告 > 普通输出）
 * 4. 支持压缩触发条件和恢复
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 类型定义
// ============================================

export type OutputPriority = 'critical' | 'high' | 'medium' | 'low';

export interface HistoryEntry {
  stepId: string;
  stepName: string;
  timestamp: number;
  status: 'completed' | 'failed' | 'skipped';
  priority: OutputPriority;
  fullOutput?: string;
  compressedOutput?: string;
  summary?: string;
  keyData: Record<string, unknown>;
  hasErrors: boolean;
  hasWarnings: boolean;
  outputLocation?: string;  // 完整输出文件路径
}

export interface CompressionConfig {
  windowSize: number;           // 滑动窗口大小（保留最近 N 步完整输出）
  maxTokenLimit: number;        // 最大 token 限制
  compressionThreshold: number; // 压缩触发阈值（token 数）
  persistFullOutput: boolean;   // 是否持久化完整输出到文件
  outputDir?: string;           // 完整输出存储目录
  priorityWeights: {
    critical: number;   // 1.0 - 永不压缩
    high: number;       // 0.8 - 高优先级
    medium: number;     // 0.5 - 中等优先级
    low: number;        // 0.3 - 低优先级
  };
}

export interface CompressionResult {
  compressed: number;           // 压缩的条目数
  savedTokens: number;          // 节省的 token 数
  beforeTokens: number;         // 压缩前 token 数
  afterTokens: number;          // 压缩后 token 数
  compressionRatio: number;     // 压缩比例
}

export interface HistoryState {
  entries: HistoryEntry[];
  totalTokens: number;
  lastCompression?: number;
  compressionHistory: CompressionResult[];
}

// ============================================
// 默认配置
// ============================================

export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  windowSize: 5,                // 保留最近 5 步完整输出
  maxTokenLimit: 100000,        // 100K token 限制
  compressionThreshold: 80000,  // 80K token 时触发压缩
  persistFullOutput: true,
  priorityWeights: {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.3,
  },
};

// ============================================
// 历史压缩管理器
// ============================================

export class HistoryCompressor extends EventEmitter {
  private config: CompressionConfig;
  private state: HistoryState;

  constructor(config?: Partial<CompressionConfig>) {
    super();
    
    this.config = { ...DEFAULT_COMPRESSION_CONFIG, ...config };
    this.state = {
      entries: [],
      totalTokens: 0,
      compressionHistory: [],
    };
  }

  // ============================================
  // 添加历史条目
  // ============================================

  /**
   * 添加步骤输出
   */
  addEntry(options: {
    stepId: string;
    stepName: string;
    status: 'completed' | 'failed' | 'skipped';
    output: string;
    keyData?: Record<string, unknown>;
  }): HistoryEntry {
    const { stepId, stepName, status, output, keyData = {} } = options;
    
    // 确定优先级
    const priority = this.determinePriority(status, output);
    
    // 估算 token 数
    const tokens = this.estimateTokens(output);
    
    // 创建条目
    const entry: HistoryEntry = {
      stepId,
      stepName,
      timestamp: Date.now(),
      status,
      priority,
      fullOutput: output,
      keyData,
      hasErrors: output.toLowerCase().includes('error'),
      hasWarnings: output.toLowerCase().includes('warn'),
    };

    // 持久化完整输出
    if (this.config.persistFullOutput && this.config.outputDir) {
      entry.outputLocation = this.persistOutput(stepId, output);
    }

    // 添加到状态
    this.state.entries.push(entry);
    this.state.totalTokens += tokens;

    // 检查是否需要压缩
    if (this.state.totalTokens > this.config.compressionThreshold) {
      this.compress();
    }

    this.emit('entry:added', entry);
    return entry;
  }

  /**
   * 确定输出优先级
   */
  private determinePriority(status: string, output: string): OutputPriority {
    const lowerOutput = output.toLowerCase();

    // 失败的步骤 - critical
    if (status === 'failed') return 'critical';
    
    // 包含错误 - critical
    if (lowerOutput.includes('error:') || lowerOutput.includes('failed:')) {
      return 'critical';
    }

    // 包含关键决策 - high
    if (lowerOutput.includes('decision:') || lowerOutput.includes('chosen:')) {
      return 'high';
    }

    // 包含文件修改、提交 - high
    if (lowerOutput.includes('commit:') || lowerOutput.includes('created:') ||
        lowerOutput.includes('modified:')) {
      return 'high';
    }

    // 包含测试结果 - medium
    if (lowerOutput.includes('test') || lowerOutput.includes('passed')) {
      return 'medium';
    }

    // 默认 - low
    return 'low';
  }

  /**
   * 估算 token 数
   */
  private estimateTokens(text: string): number {
    // 简单估算：中文约 1.5 字符/token，英文约 4 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  // ============================================
  // 压缩操作
  // ============================================

  /**
   * 执行压缩
   */
  compress(): CompressionResult {
    const beforeTokens = this.state.totalTokens;
    let compressed = 0;
    let savedTokens = 0;

    // 获取需要压缩的条目（滑动窗口外的）
    const windowStart = Math.max(0, this.state.entries.length - this.config.windowSize);
    
    for (let i = 0; i < windowStart; i++) {
      const entry = this.state.entries[i];
      
      // 跳过已压缩的
      if (entry.compressedOutput) continue;
      
      // 跳过 critical 优先级
      if (entry.priority === 'critical') continue;
      
      // 根据优先级决定压缩程度
      const weight = this.config.priorityWeights[entry.priority];
      
      if (weight < 1.0 && entry.fullOutput) {
        // 生成摘要
        entry.summary = this.generateSummary(entry.fullOutput, weight);
        entry.compressedOutput = entry.summary;
        
        // 计算 saved tokens
        const originalTokens = this.estimateTokens(entry.fullOutput);
        const compressedTokens = this.estimateTokens(entry.summary);
        savedTokens += originalTokens - compressedTokens;
        
        // 清除完整输出（如果已持久化）
        if (entry.outputLocation) {
          entry.fullOutput = undefined;
        }
        
        compressed++;
      }
    }

    // 更新状态
    this.state.totalTokens = beforeTokens - savedTokens;
    this.state.lastCompression = Date.now();

    const result: CompressionResult = {
      compressed,
      savedTokens,
      beforeTokens,
      afterTokens: this.state.totalTokens,
      compressionRatio: savedTokens / beforeTokens,
    };

    this.state.compressionHistory.push(result);
    this.emit('compressed', result);

    return result;
  }

  /**
   * 生成摘要
   */
  private generateSummary(output: string, weight: number): string {
    const lines = output.split('\n');
    const importantLines: string[] = [];
    const lowerOutput = output.toLowerCase();

    // 提取重要行
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // 错误和警告
      if (lowerLine.includes('error') || lowerLine.includes('warn')) {
        importantLines.push(line);
        continue;
      }
      
      // 关键信息
      if (lowerLine.includes('commit:') || lowerLine.includes('created:') ||
          lowerLine.includes('modified:') || lowerLine.includes('decision:')) {
        importantLines.push(line);
        continue;
      }
      
      // 测试结果
      if (lowerLine.includes('passed') || lowerLine.includes('failed')) {
        importantLines.push(line);
        continue;
      }
    }

    // 根据权重决定摘要长度
    const maxLines = Math.ceil(importantLines.length * weight) || 5;
    const summary = importantLines.slice(0, maxLines).join('\n');

    if (summary.length < output.length * 0.5) {
      return `[摘要] ${summary}`;
    }

    // 如果摘要不明显小于原文，使用简单的截断
    return `[截断] ${output.substring(0, Math.floor(output.length * weight))}...`;
  }

  /**
   * 强制压缩到指定大小
   */
  forceCompressTo(maxTokens: number): CompressionResult {
    const results: CompressionResult[] = [];
    
    while (this.state.totalTokens > maxTokens && this.canCompressMore()) {
      results.push(this.compress());
    }

    // 合并结果
    return {
      compressed: results.reduce((sum, r) => sum + r.compressed, 0),
      savedTokens: results.reduce((sum, r) => sum + r.savedTokens, 0),
      beforeTokens: results[0]?.beforeTokens || this.state.totalTokens,
      afterTokens: this.state.totalTokens,
      compressionRatio: results.length > 0 
        ? results.reduce((sum, r) => sum + r.savedTokens, 0) / results[0].beforeTokens 
        : 0,
    };
  }

  /**
   * 是否还能压缩更多
   */
  private canCompressMore(): boolean {
    const windowStart = Math.max(0, this.state.entries.length - this.config.windowSize);
    
    for (let i = 0; i < windowStart; i++) {
      const entry = this.state.entries[i];
      if (entry.priority !== 'critical' && !entry.compressedOutput) {
        return true;
      }
    }
    
    return false;
  }

  // ============================================
  // 持久化
  // ============================================

  /**
   * 持久化完整输出
   */
  private persistOutput(stepId: string, output: string): string {
    if (!this.config.outputDir) return '';

    try {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
      const filename = `${stepId}-${Date.now()}.log`;
      const filepath = path.join(this.config.outputDir, filename);
      fs.writeFileSync(filepath, output, 'utf-8');
      return filepath;
    } catch (error) {
      this.emit('error', error);
      return '';
    }
  }

  /**
   * 加载完整输出
   */
  loadFullOutput(entry: HistoryEntry): string | null {
    if (entry.fullOutput) return entry.fullOutput;
    if (!entry.outputLocation) return null;

    try {
      return fs.readFileSync(entry.outputLocation, 'utf-8');
    } catch {
      return null;
    }
  }

  // ============================================
  // 查询
  // ============================================

  /**
   * 获取历史条目
   */
  getEntries(options?: {
    status?: HistoryEntry['status'];
    priority?: OutputPriority;
    hasErrors?: boolean;
    limit?: number;
  }): HistoryEntry[] {
    let results = [...this.state.entries];

    if (options?.status) {
      results = results.filter(e => e.status === options.status);
    }

    if (options?.priority) {
      results = results.filter(e => e.priority === options.priority);
    }

    if (options?.hasErrors !== undefined) {
      results = results.filter(e => e.hasErrors === options.hasErrors);
    }

    if (options?.limit) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  /**
   * 获取完整输出（用于传递给下一个步骤）
   */
  getOutputsForContext(maxTokens?: number): string {
    const targetTokens = maxTokens || this.config.maxTokenLimit;
    let currentTokens = 0;
    const outputs: string[] = [];

    // 从最近的步骤开始
    for (let i = this.state.entries.length - 1; i >= 0; i--) {
      const entry = this.state.entries[i];
      const output = entry.compressedOutput || entry.fullOutput || '';
      const tokens = this.estimateTokens(output);

      if (currentTokens + tokens <= targetTokens) {
        outputs.unshift(`[${entry.stepName}]\n${output}`);
        currentTokens += tokens;
      } else {
        // 尝试使用摘要
        if (entry.summary) {
          const summaryTokens = this.estimateTokens(entry.summary);
          if (currentTokens + summaryTokens <= targetTokens) {
            outputs.unshift(`[${entry.stepName}] (摘要)\n${entry.summary}`);
            currentTokens += summaryTokens;
          }
        }
        break;
      }
    }

    return outputs.join('\n\n---\n\n');
  }

  /**
   * 获取状态
   */
  getState(): HistoryState {
    return { ...this.state };
  }

  /**
   * 获取统计
   */
  getStats(): {
    totalEntries: number;
    totalTokens: number;
    compressedEntries: number;
    averageTokensPerEntry: number;
    lastCompression?: number;
    compressionCount: number;
  } {
    const compressedEntries = this.state.entries.filter(e => e.compressedOutput).length;
    
    return {
      totalEntries: this.state.entries.length,
      totalTokens: this.state.totalTokens,
      compressedEntries,
      averageTokensPerEntry: this.state.entries.length > 0
        ? Math.round(this.state.totalTokens / this.state.entries.length)
        : 0,
      lastCompression: this.state.lastCompression,
      compressionCount: this.state.compressionHistory.length,
    };
  }
}

// ============================================
// 工厂函数
// ============================================

export function createHistoryCompressor(config?: Partial<CompressionConfig>): HistoryCompressor {
  return new HistoryCompressor(config);
}
