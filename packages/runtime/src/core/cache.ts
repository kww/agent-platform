/**
 * 步骤缓存机制 - AR-007
 * 
 * 功能：
 * - TTL 过期时间（默认 1 小时）
 * - LRU 淘汰策略（最大 1000 条）
 * - git hash 变化检测
 * - 缓存命中率统计
 * 
 * 向后兼容：支持现有 Map<string, any> 使用方式
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * 缓存条目
 */
export interface CacheEntry<T = any> {
  value: T;
  createdAt: number;
  ttl: number;
  gitHash?: string;
  inputHash: string;
  hits: number;
}

/**
 * 缓存配置
 */
export interface StepCacheConfig {
  maxSize: number;        // 最大缓存条数（默认 1000）
  defaultTtl: number;     // 默认过期时间（毫秒，默认 3600000 = 1小时）
  enableGitHash: boolean; // 是否检测 git 变化（默认 true）
}

/**
 * 缓存统计
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  expiredCleanups: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: StepCacheConfig = {
  maxSize: 1000,
  defaultTtl: 3600000,  // 1 小时
  enableGitHash: true,
};

/**
 * 步骤缓存类
 * 
 * 支持功能：
 * - TTL 过期：缓存自动过期，避免使用旧数据
 * - LRU 淘汰：超过 maxSize 时淘汰最旧的条目
 * - git hash 检测：代码变化时自动失效
 * - 统计监控：命中率、淘汰次数等
 */
export class StepCache {
  private cache: Map<string, CacheEntry<any>>;
  private config: StepCacheConfig;
  private stats: {
    hits: number;
    misses: number;
    evictions: number;
    expiredCleanups: number;
  };
  private workdir?: string;
  private lastGitHash: string | null = null;

  constructor(config?: Partial<StepCacheConfig>, workdir?: string) {
    this.cache = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = { hits: 0, misses: 0, evictions: 0, expiredCleanups: 0 };
    this.workdir = workdir;
    
    // 初始化 git hash
    if (this.config.enableGitHash) {
      this.lastGitHash = this.getCurrentGitHash();
    }
  }

  /**
   * 获取缓存（兼容 Map.has/get 方式）
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * 获取缓存值
   */
  get(key: string): any | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查 TTL 过期
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // 检查 git hash 变化
    if (entry.gitHash && this.config.enableGitHash) {
      const currentHash = this.getCurrentGitHash();
      if (currentHash && currentHash !== entry.gitHash) {
        // 代码变化，缓存失效
        this.cache.delete(key);
        this.stats.misses++;
        return null;
      }
    }

    // 缓存命中
    entry.hits++;
    this.stats.hits++;
    return entry.value;
  }

  /**
   * 设置缓存（兼容 Map.set 方式）
   */
  set(key: string, value: any, ttl?: number, gitHash?: string): this {
    // 检查大小限制（LRU 策略）
    while (this.cache.size >= this.config.maxSize) {
      this.evictOldest();
    }

    const inputHash = this.hashKey(key);
    const gitHashValue = this.config.enableGitHash ? this.getCurrentGitHash() : null;
    const finalGitHash = gitHash ?? gitHashValue ?? undefined;

    this.cache.set(key, {
      value,
      createdAt: Date.now(),
      ttl: ttl ?? this.config.defaultTtl,
      gitHash: finalGitHash,
      inputHash,
      hits: 0,
    });

    return this;
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 清除所有过期缓存
   */
  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    
    this.stats.expiredCleanups += cleared;
    return cleared;
  }

  /**
   * 清除特定步骤的缓存
   */
  clearByStepId(stepId: string): number {
    let cleared = 0;
    
    for (const key of this.cache.keys()) {
      if (key.includes(`:${stepId}:`)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    
    return cleared;
  }

  /**
   * 清除特定工作流的缓存
   */
  clearByWorkflowId(workflowId: string): number {
    let cleared = 0;
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${workflowId}:`)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    
    return cleared;
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 获取统计信息
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      evictions: this.stats.evictions,
      expiredCleanups: this.stats.expiredCleanups,
    };
  }

  /**
   * 获取配置
   */
  getConfig(): StepCacheConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<StepCacheConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 检查缓存条目是否过期
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.createdAt > entry.ttl;
  }

  /**
   * LRU 淘汰：淘汰最旧的条目
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      // 优先淘汰 hits 少的（LFU + LRU 结合）
      const score = entry.createdAt - entry.hits * 1000;
      if (score < oldestTime) {
        oldestTime = score;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  /**
   * 获取当前 git hash
   */
  private getCurrentGitHash(): string | null {
    // 如果已经检测到变化，直接返回新 hash
    // 避免频繁调用 git 命令
    
    try {
      const cwd = this.workdir || process.cwd();
      const gitDir = path.join(cwd, '.git');
      
      if (!fs.existsSync(gitDir)) {
        return null;
      }
      
      const result = execSync('git rev-parse HEAD', {
        encoding: 'utf-8',
        cwd,
        timeout: 5000,
      });
      
      const hash = result.trim();
      
      // 检测变化
      if (this.lastGitHash && hash !== this.lastGitHash) {
        // 代码变化，清理所有带 git hash 的缓存
        this.clearGitHashCaches();
      }
      
      this.lastGitHash = hash;
      return hash;
    } catch {
      return null;
    }
  }

  /**
   * 清理所有带 git hash 的缓存（代码变化时）
   */
  private clearGitHashCaches(): number {
    let cleared = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.gitHash) {
        this.cache.delete(key);
        cleared++;
      }
    }
    
    return cleared;
  }

  /**
   * 生成 key hash
   */
  private hashKey(key: string): string {
    // 简单 hash，用于内部记录
    return key;
  }

  /**
   * 导出缓存数据（用于调试）
   */
  export(): Array<{
    key: string;
    createdAt: number;
    ttl: number;
    hits: number;
    age: number;
    remainingTtl: number;
  }> {
    const now = Date.now();
    
    return Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      createdAt: entry.createdAt,
      ttl: entry.ttl,
      hits: entry.hits,
      age: now - entry.createdAt,
      remainingTtl: Math.max(0, entry.ttl - (now - entry.createdAt)),
    }));
  }

  /**
   * 格式化统计信息（用于日志）
   */
  formatStats(): string {
    const stats = this.getStats();
    const hitRatePercent = (stats.hitRate * 100).toFixed(1);
    
    return `缓存统计: ${stats.size}/${stats.maxSize} 条, 命中率 ${hitRatePercent}%, 淘汰 ${stats.evictions} 次`;
  }
}

/**
 * 创建全局缓存实例
 */
export function createStepCache(config?: Partial<StepCacheConfig>, workdir?: string): StepCache {
  return new StepCache(config, workdir);
}

/**
 * 默认缓存实例（单例）
 */
let defaultCache: StepCache | null = null;

export function getDefaultCache(): StepCache {
  if (!defaultCache) {
    defaultCache = new StepCache();
  }
  return defaultCache;
}

export function resetDefaultCache(): void {
  defaultCache = null;
}