/**
 * 输出管理器
 * 
 * 🆕 AR-009 P1: Dynamic Phase 输出优化
 * 
 * 功能：
 * 1. 分批写入临时文件
 * 2. 惰性加载
 * 3. 内存阈值检测
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { getSystemMetrics } from './scheduler';

// ========== Types ==========

/**
 * 输出引用
 */
export interface OutputRef {
  ref: string;  // 文件路径
}

/**
 * 输出值（可能是直接值或引用）
 */
export type OutputValue = any | OutputRef;

/**
 * 输出管理器配置
 */
export interface OutputManagerConfig {
  workdir: string;
  memoryThreshold?: number;  // 内存阈值（默认 80%）
}

// ========== Constants ==========

const OUTPUTS_DIR = 'phase_outputs';
const DEFAULT_MEMORY_THRESHOLD = 80;

// ========== Output Manager ==========

/**
 * 输出管理器
 * 
 * 管理工作流执行过程中的输出数据，支持：
 * - 分批写入临时文件
 * - 惰性加载
 * - 内存阈值检测
 */
export class OutputManager {
  private workdir: string;
  private memoryThreshold: number;
  private outputsDir: string;
  private outputs: Map<string, OutputValue>;
  private flushedKeys: Set<string>;
  
  constructor(config: OutputManagerConfig) {
    this.workdir = config.workdir;
    this.memoryThreshold = config.memoryThreshold ?? DEFAULT_MEMORY_THRESHOLD;
    this.outputsDir = path.join(this.workdir, '.agent-runtime', OUTPUTS_DIR);
    this.outputs = new Map();
    this.flushedKeys = new Set();
  }
  
  /**
   * 设置输出
   */
  set(key: string, value: any): void {
    this.outputs.set(key, value);
    
    // 检查内存阈值
    this.checkMemoryAndFlush();
  }
  
  /**
   * 获取输出（惰性加载）
   */
  get(key: string): any {
    const value = this.outputs.get(key);
    
    if (!value) return null;
    
    // 如果是引用，惰性加载
    if (this.isOutputRef(value)) {
      return this.loadFromRef(value);
    }
    
    return value;
  }
  
  /**
   * 检查是否是引用
   */
  isOutputRef(value: any): value is OutputRef {
    return value !== null && typeof value === 'object' && 'ref' in value;
  }
  
  /**
   * 从引用加载
   */
  private loadFromRef(ref: OutputRef): any {
    try {
      const content = fsSync.readFileSync(ref.ref, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }
  
  /**
   * 检查内存并刷新到磁盘
   */
  checkMemoryAndFlush(): void {
    const metrics = getSystemMetrics();
    
    if (metrics.memoryUsage >= this.memoryThreshold) {
      console.warn(`⚠️ 内存紧张 ${metrics.memoryUsage.toFixed(1)}%，刷新输出到磁盘`);
      this.flushAll();
    }
  }
  
  /**
   * 刷新所有输出到磁盘
   */
  async flushAll(): Promise<void> {
    await fs.mkdir(this.outputsDir, { recursive: true });
    
    for (const [key, value] of this.outputs) {
      // 跳过已经是引用的
      if (this.isOutputRef(value)) continue;
      
      // 跳过小数据（<1KB）
      const size = this.estimateSize(value);
      if (size < 1024) continue;
      
      // 写入文件
      await this.flushToDisk(key, value);
    }
  }
  
  /**
   * 刷新单个输出到磁盘
   */
  async flushToDisk(key: string, value: any): Promise<OutputRef> {
    const outputPath = path.join(this.outputsDir, `${key}.json`);
    await fs.writeFile(outputPath, JSON.stringify(value, null, 2));
    
    const ref: OutputRef = { ref: outputPath };
    this.outputs.set(key, ref);
    this.flushedKeys.add(key);
    
    console.log(`📦 输出已刷新到磁盘: ${key} (${this.estimateSize(value)} bytes)`);
    
    return ref;
  }
  
  /**
   * 批量写入输出
   */
  async writeBatchOutputs(phase: string, batch: Array<{ taskId: string; output: any }>): Promise<void> {
    const phaseDir = path.join(this.outputsDir, phase);
    await fs.mkdir(phaseDir, { recursive: true });
    
    for (const { taskId, output } of batch) {
      const key = `task_${taskId}_result`;
      const outputPath = path.join(phaseDir, `${taskId}.json`);
      
      await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
      
      // 只保留引用
      this.outputs.set(key, { ref: outputPath });
      this.flushedKeys.add(key);
    }
    
    console.log(`📦 批量写入 ${batch.length} 个输出到 ${phase}`);
  }
  
  /**
   * 获取所有键
   */
  keys(): string[] {
    return Array.from(this.outputs.keys());
  }
  
  /**
   * 获取输出数量
   */
  size(): number {
    return this.outputs.size;
  }
  
  /**
   * 获取已刷新的数量
   */
  flushedCount(): number {
    return this.flushedKeys.size;
  }
  
  /**
   * 清理临时文件
   */
  async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.outputsDir);
      for (const file of files) {
        await fs.unlink(path.join(this.outputsDir, file));
      }
      await fs.rmdir(this.outputsDir);
    } catch {
      // 目录不存在，忽略
    }
  }
  
  /**
   * 估算对象大小
   */
  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }
  
  /**
   * 导出为普通对象
   */
  toObject(): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of this.outputs) {
      if (this.isOutputRef(value)) {
        // 惰性加载
        result[key] = this.loadFromRef(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  /**
   * 获取输出目录路径
   */
  getOutputsDir(): string {
    return this.outputsDir;
  }
}

// ========== 便捷函数 ==========

/**
 * 创建输出管理器
 */
export function createOutputManager(config: OutputManagerConfig): OutputManager {
  return new OutputManager(config);
}

/**
 * 惰性获取输出
 */
export function lazyGetOutput(workdir: string, key: string): any {
  const outputPath = path.join(workdir, '.agent-runtime', OUTPUTS_DIR, `${key}.json`);
  
  try {
    const content = fsSync.readFileSync(outputPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}