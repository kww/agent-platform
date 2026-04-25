/**
 * 进度反馈优化
 * 
 * 功能：
 * 1. 解析 Agent 输出，提取关键进度信息
 * 2. 支持进度百分比估计
 * 3. 添加心跳检测（长时间无输出时预警）
 * 4. 支持多种 Agent 输出格式
 */

import { EventEmitter } from 'events';

// ============================================
// 类型定义
// ============================================

export interface ProgressInfo {
  percentage: number;        // 0-100
  message: string;
  phase?: string;
  currentTask?: string;
  completedTasks?: number;
  totalTasks?: number;
  hasError: boolean;
  hasWarning: boolean;
  timestamp: number;
  rawLine?: string;
}

export interface HeartbeatConfig {
  interval: number;          // 心跳检测间隔（毫秒）
  timeout: number;           // 超时时间（毫秒）
  warningThreshold: number;  // 警告阈值（毫秒）
}

export interface AgentOutputPattern {
  // 进度匹配模式
  progressPatterns: RegExp[];
  // 任务完成模式
  taskCompletePatterns: RegExp[];
  // 错误模式
  errorPatterns: RegExp[];
  // 警告模式
  warningPatterns: RegExp[];
  // 阶段模式
  phasePatterns: RegExp[];
}

// ============================================
// 默认配置
// ============================================

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  interval: 10000,           // 10 秒检测一次
  timeout: 300000,           // 5 分钟无输出视为超时
  warningThreshold: 60000,   // 1 分钟无输出发送警告
};

// Agent 输出模式
const DEFAULT_PATTERNS: AgentOutputPattern = {
  progressPatterns: [
    /进度[：:]\s*(\d+)%/i,
    /progress[：:]\s*(\d+)%/i,
    /completed\s+(\d+)\/(\d+)/i,
    /完成\s+(\d+)\/(\d+)/,
    /(\d+)%\s*complete/i,
    /▓{0,10}░{0,10}\s*(\d+)%/,
  ],
  taskCompletePatterns: [
    /✓\s+(.+)/,
    /✔\s+(.+)/,
    /\[完成\]\s*(.+)/,
    /\[completed\]\s*(.+)/i,
    /finished[:：]\s*(.+)/i,
    /done[:：]\s*(.+)/i,
  ],
  errorPatterns: [
    /error[:：]\s*(.+)/i,
    /failed[:：]\s*(.+)/i,
    /❌\s*(.+)/,
    /异常[:：]\s*(.+)/,
    /失败[:：]\s*(.+)/,
  ],
  warningPatterns: [
    /warning[:：]\s*(.+)/i,
    /warn[:：]\s*(.+)/i,
    /⚠️\s*(.+)/,
    /注意[:：]\s*(.+)/,
  ],
  phasePatterns: [
    /\[阶段\s*(\d+)[\/\\](\d+)\][:：]?\s*(.+)/,
    /phase\s*(\d+)[\/\\](\d+)[:：]?\s*(.+)/i,
    /【(.+)】/,
    /━━(.+)━━/,
  ],
};

// ============================================
// 进度解析器
// ============================================

export class ProgressParser extends EventEmitter {
  private patterns: AgentOutputPattern;
  private heartbeatConfig: HeartbeatConfig;
  private lastOutputTime: number = 0;
  private heartbeatTimer?: NodeJS.Timeout;
  private currentProgress: ProgressInfo | null = null;
  private outputHistory: string[] = [];
  private maxHistorySize: number = 100;

  constructor(options?: {
    patterns?: Partial<AgentOutputPattern>;
    heartbeat?: Partial<HeartbeatConfig>;
  }) {
    super();

    this.patterns = { ...DEFAULT_PATTERNS, ...options?.patterns };
    this.heartbeatConfig = { ...DEFAULT_HEARTBEAT_CONFIG, ...options?.heartbeat };
  }

  // ============================================
  // 输出解析
  // ============================================

  /**
   * 解析输出行
   */
  parseLine(line: string): ProgressInfo | null {
    this.lastOutputTime = Date.now();
    this.addToHistory(line);

    const info = this.extractProgressInfo(line);
    
    if (info) {
      this.currentProgress = info;
      this.emit('progress', info);
    }

    return info;
  }

  /**
   * 解析多行输出
   */
  parseOutput(output: string): ProgressInfo[] {
    const lines = output.split('\n');
    const results: ProgressInfo[] = [];

    for (const line of lines) {
      const info = this.parseLine(line);
      if (info) {
        results.push(info);
      }
    }

    return results;
  }

  /**
   * 提取进度信息
   */
  private extractProgressInfo(line: string): ProgressInfo | null {
    const timestamp = Date.now();

    // 检测进度百分比
    for (const pattern of this.patterns.progressPatterns) {
      const match = line.match(pattern);
      if (match) {
        let percentage = 0;
        let completedTasks: number | undefined;
        let totalTasks: number | undefined;

        if (match[1] && match[2]) {
          // 格式: completed X/Y
          completedTasks = parseInt(match[1], 10);
          totalTasks = parseInt(match[2], 10);
          percentage = Math.round((completedTasks / totalTasks) * 100);
        } else if (match[1]) {
          // 格式: X%
          percentage = parseInt(match[1], 10);
        }

        return {
          percentage,
          message: line.trim(),
          completedTasks,
          totalTasks,
          hasError: false,
          hasWarning: false,
          timestamp,
          rawLine: line,
        };
      }
    }

    // 检测错误
    for (const pattern of this.patterns.errorPatterns) {
      const match = line.match(pattern);
      if (match) {
        return {
          percentage: this.currentProgress?.percentage || 0,
          message: match[1] || line.trim(),
          hasError: true,
          hasWarning: false,
          timestamp,
          rawLine: line,
        };
      }
    }

    // 检测警告
    for (const pattern of this.patterns.warningPatterns) {
      const match = line.match(pattern);
      if (match) {
        return {
          percentage: this.currentProgress?.percentage || 0,
          message: match[1] || line.trim(),
          hasError: false,
          hasWarning: true,
          timestamp,
          rawLine: line,
        };
      }
    }

    // 检测阶段
    for (const pattern of this.patterns.phasePatterns) {
      const match = line.match(pattern);
      if (match) {
        let phase: string | undefined;
        let currentTask: string | undefined;

        if (match[3]) {
          // 格式: [阶段 X/Y] 任务名
          phase = `阶段 ${match[1]}/${match[2]}`;
          currentTask = match[3];
        } else if (match[1]) {
          // 格式: 【任务名】
          currentTask = match[1];
        }

        return {
          percentage: this.currentProgress?.percentage || 0,
          message: line.trim(),
          phase,
          currentTask,
          hasError: false,
          hasWarning: false,
          timestamp,
          rawLine: line,
        };
      }
    }

    // 检测任务完成
    for (const pattern of this.patterns.taskCompletePatterns) {
      const match = line.match(pattern);
      if (match) {
        return {
          percentage: this.currentProgress?.percentage || 0,
          message: `✓ ${match[1] || '任务完成'}`,
          currentTask: match[1],
          hasError: false,
          hasWarning: false,
          timestamp,
          rawLine: line,
        };
      }
    }

    return null;
  }

  // ============================================
  // 心跳检测
  // ============================================

  /**
   * 开始心跳检测
   */
  startHeartbeat(): void {
    this.lastOutputTime = Date.now();
    
    this.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastOutputTime;

      if (elapsed >= this.heartbeatConfig.timeout) {
        this.emit('timeout', {
          lastOutputTime: this.lastOutputTime,
          elapsed,
          lastProgress: this.currentProgress,
        });
      } else if (elapsed >= this.heartbeatConfig.warningThreshold) {
        this.emit('warning', {
          lastOutputTime: this.lastOutputTime,
          elapsed,
          lastProgress: this.currentProgress,
        });
      }
    }, this.heartbeatConfig.interval);
  }

  /**
   * 停止心跳检测
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * 更新最后输出时间（用于心跳检测）
   */
  touch(): void {
    this.lastOutputTime = Date.now();
  }

  // ============================================
  // 进度估算
  // ============================================

  /**
   * 估算整体进度
   */
  estimateProgress(options?: {
    totalTasks?: number;
    completedTasks?: number;
    currentPhase?: number;
    totalPhases?: number;
  }): ProgressInfo {
    const timestamp = Date.now();
    let percentage = 0;
    let message = '';

    if (options?.totalTasks && options?.completedTasks !== undefined) {
      percentage = Math.round((options.completedTasks / options.totalTasks) * 100);
      message = `完成 ${options.completedTasks}/${options.totalTasks} 个任务`;
    } else if (options?.currentPhase && options?.totalPhases) {
      percentage = Math.round((options.currentPhase / options.totalPhases) * 100);
      message = `阶段 ${options.currentPhase}/${options.totalPhases}`;
    } else if (this.currentProgress) {
      return this.currentProgress;
    } else {
      // 基于历史输出估算
      percentage = this.estimateFromHistory();
      message = '基于历史输出估算';
    }

    return {
      percentage,
      message,
      hasError: this.currentProgress?.hasError || false,
      hasWarning: this.currentProgress?.hasWarning || false,
      timestamp,
    };
  }

  /**
   * 基于历史输出估算进度
   */
  private estimateFromHistory(): number {
    if (this.outputHistory.length === 0) return 0;

    // 统计关键指标
    let completedCount = 0;
    let totalCount = 0;
    let errorCount = 0;

    for (const line of this.outputHistory) {
      if (line.match(/✓|✔|\[完成\]|completed/i)) {
        completedCount++;
      }
      if (line.match(/error|failed|❌/i)) {
        errorCount++;
      }
    }

    // 估算总任务数
    const taskLines = this.outputHistory.filter(l => 
      l.match(/task|任务|step|步骤/i)
    );
    totalCount = taskLines.length || this.outputHistory.length / 10;

    if (totalCount > 0) {
      return Math.min(100, Math.round((completedCount / totalCount) * 100));
    }

    // 基于输出量估算
    return Math.min(100, Math.round(this.outputHistory.length / 10));
  }

  // ============================================
  // 历史管理
  // ============================================

  /**
   * 添加到历史
   */
  private addToHistory(line: string): void {
    this.outputHistory.push(line);
    if (this.outputHistory.length > this.maxHistorySize) {
      this.outputHistory.shift();
    }
  }

  /**
   * 获取历史输出
   */
  getHistory(limit?: number): string[] {
    if (limit) {
      return this.outputHistory.slice(-limit);
    }
    return [...this.outputHistory];
  }

  /**
   * 清除历史
   */
  clearHistory(): void {
    this.outputHistory = [];
    this.currentProgress = null;
  }

  // ============================================
  // 状态查询
  // ============================================

  /**
   * 获取当前进度
   */
  getCurrentProgress(): ProgressInfo | null {
    return this.currentProgress;
  }

  /**
   * 获取上次输出时间
   */
  getLastOutputTime(): number {
    return this.lastOutputTime;
  }

  /**
   * 获取静默时间（毫秒）
   */
  getSilenceDuration(): number {
    return Date.now() - this.lastOutputTime;
  }

  /**
   * 生成进度报告
   */
  generateReport(): string {
    const lines: string[] = ['## 进度报告', ''];

    if (this.currentProgress) {
      lines.push(`- **当前进度**: ${this.currentProgress.percentage}%`);
      lines.push(`- **状态**: ${this.currentProgress.message}`);
      if (this.currentProgress.phase) {
        lines.push(`- **阶段**: ${this.currentProgress.phase}`);
      }
      if (this.currentProgress.completedTasks !== undefined && this.currentProgress.totalTasks) {
        lines.push(`- **任务**: ${this.currentProgress.completedTasks}/${this.currentProgress.totalTasks}`);
      }
      if (this.currentProgress.hasError) {
        lines.push(`- **⚠️ 存在错误**`);
      }
      if (this.currentProgress.hasWarning) {
        lines.push(`- **⚠️ 存在警告**`);
      }
    } else {
      lines.push('- 无进度信息');
    }

    const silence = this.getSilenceDuration();
    if (silence > 30000) {
      lines.push(`- **静默时间**: ${Math.round(silence / 1000)} 秒`);
    }

    lines.push(`- **历史输出**: ${this.outputHistory.length} 行`);

    return lines.join('\n');
  }
}

// ============================================
// Agent 特定解析器
// ============================================

/**
 * Codex 输出解析器
 */
export class CodexProgressParser extends ProgressParser {
  constructor() {
    super({
      patterns: {
        progressPatterns: [
          /Progress:\s*(\d+)%/i,
          /Step\s+(\d+)\/(\d+)/i,
          /▓{0,10}░{0,10}\s*(\d+)%/,
        ],
        taskCompletePatterns: [
          /✓ Completed:\s*(.+)/i,
          /\[done\]\s*(.+)/i,
        ],
        errorPatterns: [
          /\[error\]\s*(.+)/i,
          /Error:\s*(.+)/i,
        ],
        warningPatterns: [
          /\[warning\]\s*(.+)/i,
          /Warning:\s*(.+)/i,
        ],
        phasePatterns: [
          /\[phase\s*(\d+)\]\s*(.+)/i,
        ],
      },
    });
  }
}

/**
 * Claude Code 输出解析器
 */
export class ClaudeCodeProgressParser extends ProgressParser {
  constructor() {
    super({
      patterns: {
        progressPatterns: [
          /(\d+)%\s*complete/i,
          /Step\s+(\d+)\s+of\s+(\d+)/i,
        ],
        taskCompletePatterns: [
          /✓ (.+)/,
          /Completed:\s*(.+)/i,
        ],
        errorPatterns: [
          /Error:\s*(.+)/i,
          /Failed:\s*(.+)/i,
        ],
        warningPatterns: [
          /Warning:\s*(.+)/i,
        ],
        phasePatterns: [
          /━━(.+)━━/,
          /## (.+)/,
        ],
      },
    });
  }
}

// ============================================
// 工厂函数
// ============================================

export function createProgressParser(options?: {
  patterns?: Partial<AgentOutputPattern>;
  heartbeat?: Partial<HeartbeatConfig>;
}): ProgressParser {
  return new ProgressParser(options);
}

export function createCodexProgressParser(): CodexProgressParser {
  return new CodexProgressParser();
}

export function createClaudeCodeProgressParser(): ClaudeCodeProgressParser {
  return new ClaudeCodeProgressParser();
}
