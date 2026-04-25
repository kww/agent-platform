/**
 * 资源感知调度器
 * 
 * 根据系统资源状态动态调整并发数：
 * - 内存紧张 → 主要限制（多 Agent 并行占用大）
 * - CPU 高负载 → 次要限制（Agent 任务是 IO 密集）
 * - 网络 IO → 不检查（异步无阻塞）
 */

import * as os from 'os';

/**
 * 系统资源指标
 */
export interface ResourceMetrics {
  /** 内存使用率 (0-100) */
  memoryUsage: number;
  /** CPU 负载率 (0-100) */
  cpuLoad: number;
  /** 指标采集时间 */
  timestamp: number;
}

/**
 * 资源阈值配置
 */
export interface ResourceThresholds {
  /** 内存紧张阈值（默认 85%） */
  memoryHigh: number;
  /** 内存严重阈值（默认 95%） */
  memoryCritical: number;
  /** CPU 高负载阈值（默认 90%） */
  cpuHigh: number;
  /** 内存紧张时降级比例（默认 0.5） */
  memoryReduceRatio: number;
  /** CPU 高负载时降级比例（默认 0.7） */
  cpuReduceRatio: number;
}

/**
 * 默认阈值配置
 */
export const DEFAULT_THRESHOLDS: ResourceThresholds = {
  memoryHigh: 85,
  memoryCritical: 95,
  cpuHigh: 90,
  memoryReduceRatio: 0.5,
  cpuReduceRatio: 0.7,
};

/**
 * 获取当前系统资源指标
 */
export function getSystemMetrics(): ResourceMetrics {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;
  
  // CPU load: 1 分钟平均负载 / CPU 核数
  const cpuCount = os.cpus().length;
  const loadAvg = os.loadavg()[0];
  const cpuLoad = (loadAvg / cpuCount) * 100;
  
  return {
    memoryUsage,
    cpuLoad,
    timestamp: Date.now(),
  };
}

/**
 * 资源状态评估
 */
export type ResourceStatus = 'normal' | 'high' | 'critical';

/**
 * 评估资源状态
 */
export function evaluateResourceStatus(
  metrics: ResourceMetrics,
  thresholds: ResourceThresholds = DEFAULT_THRESHOLDS
): { status: ResourceStatus; reason: string } {
  // 内存严重紧张
  if (metrics.memoryUsage >= thresholds.memoryCritical) {
    return {
      status: 'critical',
      reason: `内存严重紧张: ${metrics.memoryUsage.toFixed(1)}% >= ${thresholds.memoryCritical}%`,
    };
  }
  
  // 内存紧张
  if (metrics.memoryUsage >= thresholds.memoryHigh) {
    return {
      status: 'high',
      reason: `内存紧张: ${metrics.memoryUsage.toFixed(1)}% >= ${thresholds.memoryHigh}%`,
    };
  }
  
  // CPU 高负载
  if (metrics.cpuLoad >= thresholds.cpuHigh) {
    return {
      status: 'high',
      reason: `CPU 高负载: ${metrics.cpuLoad.toFixed(1)}% >= ${thresholds.cpuHigh}%`,
    };
  }
  
  return {
    status: 'normal',
    reason: `资源正常: 内存 ${metrics.memoryUsage.toFixed(1)}%, CPU ${metrics.cpuLoad.toFixed(1)}%`,
  };
}

/**
 * 根据资源状态调整并发数
 * 
 * @param base 基础并发数（来自配置优先级链）
 * @param thresholds 阈值配置
 * @returns 调整后的并发数
 */
export function getResourceAwareConcurrency(
  base: number,
  thresholds: ResourceThresholds = DEFAULT_THRESHOLDS
): { concurrency: number; metrics: ResourceMetrics; status: ResourceStatus; reason: string } {
  const metrics = getSystemMetrics();
  const { status, reason } = evaluateResourceStatus(metrics, thresholds);
  
  let adjustedConcurrency = base;
  
  switch (status) {
    case 'critical':
      // 内存严重 → 强制降到最低（1）
      adjustedConcurrency = 1;
      break;
      
    case 'high':
      // 内存紧张 → 降 50%，CPU 高负载 → 降 30%
      if (metrics.memoryUsage >= thresholds.memoryHigh) {
        adjustedConcurrency = Math.max(1, Math.floor(base * thresholds.memoryReduceRatio));
      } else if (metrics.cpuLoad >= thresholds.cpuHigh) {
        adjustedConcurrency = Math.max(1, Math.floor(base * thresholds.cpuReduceRatio));
      }
      break;
      
    case 'normal':
      // 正常 → 保持基础并发数
      adjustedConcurrency = base;
      break;
  }
  
  return {
    concurrency: adjustedConcurrency,
    metrics,
    status,
    reason,
  };
}

/**
 * 资源感知调度器类
 * 
 * 提供缓存和批量调度能力
 */
export class ResourceScheduler {
  private thresholds: ResourceThresholds;
  private lastMetrics: ResourceMetrics | null = null;
  private cacheTTL: number = 5000; // 5 秒缓存
  private lastCheckTime: number = 0;
  
  constructor(thresholds?: Partial<ResourceThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }
  
  /**
   * 获取并发数（带缓存）
   */
  getConcurrency(base: number): { concurrency: number; metrics: ResourceMetrics; status: ResourceStatus; reason: string } {
    const now = Date.now();
    
    // 缓存有效期内复用
    if (this.lastMetrics && now - this.lastCheckTime < this.cacheTTL) {
      const { status, reason } = evaluateResourceStatus(this.lastMetrics, this.thresholds);
      let adjustedConcurrency = base;
      
      switch (status) {
        case 'critical':
          adjustedConcurrency = 1;
          break;
        case 'high':
          if (this.lastMetrics.memoryUsage >= this.thresholds.memoryHigh) {
            adjustedConcurrency = Math.max(1, Math.floor(base * this.thresholds.memoryReduceRatio));
          } else {
            adjustedConcurrency = Math.max(1, Math.floor(base * this.thresholds.cpuReduceRatio));
          }
          break;
        case 'normal':
          adjustedConcurrency = base;
          break;
      }
      
      return { concurrency: adjustedConcurrency, metrics: this.lastMetrics, status, reason };
    }
    
    // 重新采集
    const result = getResourceAwareConcurrency(base, this.thresholds);
    this.lastMetrics = result.metrics;
    this.lastCheckTime = now;
    
    return result;
  }
  
  /**
   * 强制刷新缓存
   */
  forceRefresh(): ResourceMetrics {
    this.lastMetrics = getSystemMetrics();
    this.lastCheckTime = Date.now();
    return this.lastMetrics;
  }
  
  /**
   * 更新阈值配置
   */
  updateThresholds(thresholds: Partial<ResourceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }
  
  /**
   * 获取当前阈值配置
   */
  getThresholds(): ResourceThresholds {
    return { ...this.thresholds };
  }
}

/**
 * 创建全局调度器实例
 */
export function createResourceScheduler(thresholds?: Partial<ResourceThresholds>): ResourceScheduler {
  return new ResourceScheduler(thresholds);
}