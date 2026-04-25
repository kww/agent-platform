/**
 * 执行索引构建器
 * 
 * 功能：
 * 1. 步骤索引：stepId, name, status, hasErrors
 * 2. 关键输出索引：类型、位置
 * 3. 支持快速定位历史输出
 * 4. 支持自动生成错误报告
 * 5. 支持工作流恢复
 */

import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 类型定义
// ============================================

export interface StepIndex {
  stepId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: number;
  endTime?: number;
  duration?: number;
  phaseId?: string;
  phaseName?: string;
  hasErrors: boolean;
  hasWarnings: boolean;
  errorCount: number;
  warningCount: number;
  outputLocation?: string;
  keyOutputs: KeyOutput[];
}

export interface KeyOutput {
  type: KeyOutputType;
  content: string;
  location: string;  // 行号或文件路径
  timestamp: number;
  stepId: string;
}

export type KeyOutputType = 
  | 'error'           // 错误信息
  | 'warning'         // 警告信息
  | 'decision'        // 关键决策
  | 'file_change'     // 文件修改
  | 'commit'          // Git 提交
  | 'test_result'     // 测试结果
  | 'api_response'    // API 响应
  | 'url'             // URL 链接
  | 'code_block'      // 代码块
  | 'important_log';  // 重要日志

export interface ExecutionIndex {
  executionId: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  duration?: number;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  steps: StepIndex[];
  keyOutputs: KeyOutput[];
  errorSummary: ErrorSummary[];
  metadata: Record<string, unknown>;
}

export interface ErrorSummary {
  stepId: string;
  stepName: string;
  errorType: string;
  errorMessage: string;
  timestamp: number;
  suggestions?: string[];
}

export interface IndexSearchOptions {
  stepId?: string;
  status?: StepIndex['status'];
  type?: KeyOutputType;
  hasErrors?: boolean;
  hasWarnings?: boolean;
  keyword?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

export interface IndexBuilderOptions {
  executionId: string;
  workflowId: string;
  persistDir?: string;
  autoPersist?: boolean;
  persistInterval?: number;  // 毫秒
}

// ============================================
// 索引构建器
// ============================================

export class IndexBuilder extends EventEmitter {
  private index: ExecutionIndex;
  private persistDir?: string;
  private autoPersist: boolean;
  private persistInterval?: number;
  private persistTimer?: NodeJS.Timeout;
  private currentStep?: StepIndex;

  constructor(options: IndexBuilderOptions) {
    super();
    
    this.index = {
      executionId: options.executionId,
      workflowId: options.workflowId,
      status: 'pending',
      startTime: Date.now(),
      totalSteps: 0,
      completedSteps: 0,
      failedSteps: 0,
      steps: [],
      keyOutputs: [],
      errorSummary: [],
      metadata: {},
    };

    this.persistDir = options.persistDir;
    this.autoPersist = options.autoPersist ?? true;
    this.persistInterval = options.persistInterval ?? 30000;  // 默认 30 秒

    if (this.autoPersist && this.persistDir) {
      this.startPeriodicPersist();
    }
  }

  // ============================================
  // 工作流级别操作
  // ============================================

  /**
   * 开始工作流
   */
  startWorkflow(totalSteps?: number): void {
    this.index.status = 'running';
    this.index.startTime = Date.now();
    if (totalSteps !== undefined) {
      this.index.totalSteps = totalSteps;
    }
    this.emit('workflow:started', this.index);
  }

  /**
   * 完成工作流
   */
  completeWorkflow(): void {
    this.index.status = 'completed';
    this.index.endTime = Date.now();
    this.index.duration = this.index.endTime - this.index.startTime;
    this.emit('workflow:completed', this.index);
    this.persist();
    this.stopPeriodicPersist();
  }

  /**
   * 工作流失败
   */
  failWorkflow(error?: Error): void {
    this.index.status = 'failed';
    this.index.endTime = Date.now();
    this.index.duration = this.index.endTime - this.index.startTime;
    this.emit('workflow:failed', { index: this.index, error });
    this.persist();
    this.stopPeriodicPersist();
  }

  /**
   * 取消工作流
   */
  cancelWorkflow(): void {
    this.index.status = 'cancelled';
    this.index.endTime = Date.now();
    this.index.duration = this.index.endTime - this.index.startTime;
    this.emit('workflow:cancelled', this.index);
    this.persist();
    this.stopPeriodicPersist();
  }

  // ============================================
  // 步骤级别操作
  // ============================================

  /**
   * 开始步骤
   */
  startStep(stepId: string, name: string, options?: {
    phaseId?: string;
    phaseName?: string;
  }): void {
    const stepIndex: StepIndex = {
      stepId,
      name,
      status: 'running',
      startTime: Date.now(),
      phaseId: options?.phaseId,
      phaseName: options?.phaseName,
      hasErrors: false,
      hasWarnings: false,
      errorCount: 0,
      warningCount: 0,
      keyOutputs: [],
    };

    this.currentStep = stepIndex;
    this.index.steps.push(stepIndex);
    this.index.totalSteps = Math.max(this.index.totalSteps, this.index.steps.length);
    
    this.emit('step:started', stepIndex);
  }

  /**
   * 完成步骤
   */
  completeStep(stepId: string, output?: string): void {
    const step = this.findStep(stepId);
    if (!step) return;

    step.status = 'completed';
    step.endTime = Date.now();
    step.duration = step.endTime - (step.startTime || step.endTime);
    
    this.index.completedSteps++;
    
    // 处理输出
    if (output) {
      this.processOutput(stepId, output);
    }

    this.currentStep = undefined;
    this.emit('step:completed', step);
  }

  /**
   * 步骤失败
   */
  failStep(stepId: string, error: Error | string): void {
    const step = this.findStep(stepId);
    if (!step) return;

    step.status = 'failed';
    step.endTime = Date.now();
    step.duration = step.endTime - (step.startTime || step.endTime);
    step.hasErrors = true;
    step.errorCount++;

    this.index.failedSteps++;

    // 添加错误输出
    const errorMessage = typeof error === 'string' ? error : error.message;
    this.addKeyOutput(stepId, 'error', errorMessage);

    // 添加错误摘要
    this.index.errorSummary.push({
      stepId,
      stepName: step.name,
      errorType: (typeof error === 'object' && (error as any).type) || 'unknown',
      errorMessage,
      timestamp: Date.now(),
    });

    this.currentStep = undefined;
    this.emit('step:failed', { step, error });
  }

  /**
   * 跳过步骤
   */
  skipStep(stepId: string, reason?: string): void {
    const step = this.findStep(stepId);
    if (!step) return;

    step.status = 'skipped';
    step.endTime = Date.now();
    step.duration = step.endTime - (step.startTime || step.endTime);

    if (reason) {
      this.addKeyOutput(stepId, 'important_log', `跳过原因: ${reason}`);
    }

    this.currentStep = undefined;
    this.emit('step:skipped', step);
  }

  // ============================================
  // 输出处理
  // ============================================

  /**
   * 处理输出
   */
  processOutput(stepId: string, output: string): KeyOutput[] {
    const keyOutputs: KeyOutput[] = [];
    const lines = output.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const type = this.detectOutputType(line);
      
      if (type) {
        const keyOutput = this.addKeyOutput(stepId, type, line, `line:${i + 1}`);
        keyOutputs.push(keyOutput);
      }
    }

    return keyOutputs;
  }

  /**
   * 检测输出类型
   */
  private detectOutputType(line: string): KeyOutputType | null {
    const lowerLine = line.toLowerCase();

    // 错误
    if (lowerLine.includes('error:') || lowerLine.includes('failed:') || 
        lowerLine.startsWith('error') || lowerLine.includes('❌')) {
      return 'error';
    }

    // 警告
    if (lowerLine.includes('warning:') || lowerLine.startsWith('warn') ||
        lowerLine.includes('⚠️')) {
      return 'warning';
    }

    // 决策
    if (lowerLine.includes('decision:') || lowerLine.includes('chosen:') ||
        lowerLine.includes('selected:') || lowerLine.includes('决定:')) {
      return 'decision';
    }

    // 文件修改
    if (lowerLine.includes('created:') || lowerLine.includes('modified:') ||
        lowerLine.includes('deleted:') || lowerLine.includes('文件:') ||
        line.match(/^[\w\/.-]+\.(ts|js|json|md|yaml|yml)$/i)) {
      return 'file_change';
    }

    // Git 提交
    if (lowerLine.includes('commit:') || lowerLine.match(/^[a-f0-9]{7,40}/i)) {
      return 'commit';
    }

    // 测试结果
    if (lowerLine.includes('passed:') || lowerLine.includes('failed:') ||
        lowerLine.includes('tests:') || lowerLine.includes('✓') ||
        lowerLine.includes('✗')) {
      return 'test_result';
    }

    // API 响应
    if (lowerLine.includes('status:') && lowerLine.match(/\d{3}/)) {
      return 'api_response';
    }

    // URL
    if (line.match(/https?:\/\/[^\s]+/i)) {
      return 'url';
    }

    // 代码块
    if (line.includes('```') || line.match(/^(function|const|let|var|class|import|export)/)) {
      return 'code_block';
    }

    return null;
  }

  /**
   * 添加关键输出
   */
  addKeyOutput(stepId: string, type: KeyOutputType, content: string, location?: string): KeyOutput {
    const keyOutput: KeyOutput = {
      type,
      content: this.truncateContent(content),
      location: location || 'unknown',
      timestamp: Date.now(),
      stepId,
    };

    this.index.keyOutputs.push(keyOutput);

    // 更新步骤索引
    const step = this.findStep(stepId);
    if (step) {
      step.keyOutputs.push(keyOutput);
      
      if (type === 'error') {
        step.hasErrors = true;
        step.errorCount++;
      } else if (type === 'warning') {
        step.hasWarnings = true;
        step.warningCount++;
      }
    }

    this.emit('key:output', keyOutput);
    return keyOutput;
  }

  /**
   * 截断内容
   */
  private truncateContent(content: string, maxLength: number = 500): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }

  // ============================================
  // 查询功能
  // ============================================

  /**
   * 获取完整索引
   */
  getIndex(): ExecutionIndex {
    return { ...this.index };
  }

  /**
   * 查找步骤
   */
  findStep(stepId: string): StepIndex | undefined {
    return this.index.steps.find(s => s.stepId === stepId);
  }

  /**
   * 搜索
   */
  search(options: IndexSearchOptions): StepIndex[] | KeyOutput[] {
    if (options.stepId || options.status || options.hasErrors !== undefined || options.hasWarnings !== undefined) {
      // 搜索步骤
      return this.searchSteps(options);
    }
    
    if (options.type || options.keyword) {
      // 搜索关键输出
      return this.searchKeyOutputs(options);
    }

    return [];
  }

  /**
   * 搜索步骤
   */
  private searchSteps(options: IndexSearchOptions): StepIndex[] {
    let results = [...this.index.steps];

    if (options.stepId) {
      results = results.filter(s => s.stepId.includes(options.stepId!));
    }

    if (options.status) {
      results = results.filter(s => s.status === options.status);
    }

    if (options.hasErrors !== undefined) {
      results = results.filter(s => s.hasErrors === options.hasErrors);
    }

    if (options.hasWarnings !== undefined) {
      results = results.filter(s => s.hasWarnings === options.hasWarnings);
    }

    if (options.startTime) {
      results = results.filter(s => (s.startTime || 0) >= options.startTime!);
    }

    if (options.endTime) {
      results = results.filter(s => (s.endTime || Infinity) <= options.endTime!);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * 搜索关键输出
   */
  private searchKeyOutputs(options: IndexSearchOptions): KeyOutput[] {
    let results = [...this.index.keyOutputs];

    if (options.type) {
      results = results.filter(o => o.type === options.type);
    }

    if (options.stepId) {
      results = results.filter(o => o.stepId.includes(options.stepId!));
    }

    if (options.keyword) {
      const keyword = options.keyword.toLowerCase();
      results = results.filter(o => o.content.toLowerCase().includes(keyword));
    }

    if (options.startTime) {
      results = results.filter(o => o.timestamp >= options.startTime!);
    }

    if (options.endTime) {
      results = results.filter(o => o.timestamp <= options.endTime!);
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * 获取错误报告
   */
  generateErrorReport(): string {
    if (this.index.errorSummary.length === 0) {
      return '✅ 没有错误发生';
    }

    const lines: string[] = [
      `# 错误报告`,
      ``,
      `**工作流**: ${this.index.workflowId}`,
      `**执行 ID**: ${this.index.executionId}`,
      `**错误数**: ${this.index.errorSummary.length}`,
      ``,
      `## 错误详情`,
      ``,
    ];

    for (const error of this.index.errorSummary) {
      lines.push(`### ${error.stepName} (${error.stepId})`);
      lines.push(`- **类型**: ${error.errorType}`);
      lines.push(`- **时间**: ${new Date(error.timestamp).toISOString()}`);
      lines.push(`- **消息**: ${error.errorMessage}`);
      if (error.suggestions) {
        lines.push(`- **建议**:`);
        error.suggestions.forEach(s => lines.push(`  - ${s}`));
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 生成恢复点
   */
  generateRecoveryPoint(): {
    failedSteps: string[];
    completedSteps: string[];
    lastStep?: string;
    canRecover: boolean;
  } {
    const completedSteps = this.index.steps
      .filter(s => s.status === 'completed')
      .map(s => s.stepId);

    const failedSteps = this.index.steps
      .filter(s => s.status === 'failed')
      .map(s => s.stepId);

    const lastStep = this.index.steps[this.index.steps.length - 1];

    return {
      completedSteps,
      failedSteps,
      lastStep: lastStep?.stepId,
      canRecover: failedSteps.length > 0 || this.index.status === 'cancelled',
    };
  }

  // ============================================
  // 持久化
  // ============================================

  /**
   * 开始定期持久化
   */
  private startPeriodicPersist(): void {
    if (this.persistInterval && this.persistDir) {
      this.persistTimer = setInterval(() => {
        this.persist();
      }, this.persistInterval);
    }
  }

  /**
   * 停止定期持久化
   */
  private stopPeriodicPersist(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
      this.persistTimer = undefined;
    }
  }

  /**
   * 持久化索引
   */
  persist(): void {
    if (!this.persistDir) return;

    try {
      const indexPath = path.join(this.persistDir, 'index.json');
      fs.mkdirSync(this.persistDir, { recursive: true });
      fs.writeFileSync(indexPath, JSON.stringify(this.index, null, 2), 'utf-8');
      this.emit('persisted', indexPath);
    } catch (error) {
      this.emit('error', error);
    }
  }

  /**
   * 加载索引
   */
  static load(dir: string): ExecutionIndex | null {
    try {
      const indexPath = path.join(dir, 'index.json');
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      // 忽略加载错误
    }
    return null;
  }

  /**
   * 设置元数据
   */
  setMetadata(key: string, value: unknown): void {
    this.index.metadata[key] = value;
  }

  /**
   * 获取元数据
   */
  getMetadata(key: string): unknown {
    return this.index.metadata[key];
  }
}

// ============================================
// 工厂函数
// ============================================

/**
 * 创建索引构建器
 */
export function createIndexBuilder(options: IndexBuilderOptions): IndexBuilder {
  return new IndexBuilder(options);
}

/**
 * 获取全局索引构建器
 */
const indexBuilders = new Map<string, IndexBuilder>();

export function getIndexBuilder(executionId: string): IndexBuilder | undefined {
  return indexBuilders.get(executionId);
}

export function registerIndexBuilder(executionId: string, builder: IndexBuilder): void {
  indexBuilders.set(executionId, builder);
}

export function unregisterIndexBuilder(executionId: string): void {
  indexBuilders.delete(executionId);
}
