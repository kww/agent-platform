/**
 * AR-007 步骤缓存机制测试
 */

import { StepCache, createStepCache, CacheStats } from '../core/cache';

describe('StepCache', () => {
  let cache: StepCache;

  beforeEach(() => {
    cache = createStepCache({
      maxSize: 100,
      defaultTtl: 60000,  // 1 分钟（测试用）
      enableGitHash: false,  // 测试时禁用 git hash
    });
  });

  describe('基本功能', () => {
    it('应该支持 set/get 操作', () => {
      cache.set('test:key1', { data: 'value1' });
      
      expect(cache.has('test:key1')).toBe(true);
      expect(cache.get('test:key1')).toEqual({ data: 'value1' });
    });

    it('应该支持 delete 操作', () => {
      cache.set('test:key1', 'value1');
      cache.delete('test:key1');
      
      expect(cache.has('test:key1')).toBe(false);
    });

    it('应该支持 clear 操作', () => {
      cache.set('test:key1', 'value1');
      cache.set('test:key2', 'value2');
      cache.clear();
      
      expect(cache.size).toBe(0);
    });
  });

  describe('TTL 过期', () => {
    it('缓存应该在 TTL 后过期', async () => {
      // 创建一个 TTL 很短的缓存
      const shortTtlCache = createStepCache({
        maxSize: 100,
        defaultTtl: 100,  // 100ms
        enableGitHash: false,
      });

      shortTtlCache.set('test:key1', 'value1');
      
      // 立即获取应该命中
      expect(shortTtlCache.get('test:key1')).toBe('value1');
      
      // 等待 TTL 过期
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // 过期后应该返回 null
      expect(shortTtlCache.get('test:key1')).toBeNull();
    });

    it('应该支持自定义 TTL', async () => {
      cache.set('test:key1', 'value1', 200);  // 200ms TTL
      
      await new Promise(resolve => setTimeout(resolve, 250));
      
      expect(cache.get('test:key1')).toBeNull();
    });

    it('clearExpired 应该清理过期缓存', async () => {
      const shortTtlCache = createStepCache({
        maxSize: 100,
        defaultTtl: 100,
        enableGitHash: false,
      });

      shortTtlCache.set('test:key1', 'value1');
      shortTtlCache.set('test:key2', 'value2');
      
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const cleared = shortTtlCache.clearExpired();
      
      expect(cleared).toBe(2);
      expect(shortTtlCache.size).toBe(0);
    });
  });

  describe('LRU 淘汰', () => {
    it('超过 maxSize 时应该淘汰最旧条目', () => {
      const smallCache = createStepCache({
        maxSize: 3,
        defaultTtl: 60000,
        enableGitHash: false,
      });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      smallCache.set('key4', 'value4');  // 应该淘汰 key1
      
      expect(smallCache.has('key1')).toBe(false);
      expect(smallCache.has('key4')).toBe(true);
      expect(smallCache.size).toBe(3);
    });

    it('淘汰统计应该正确记录', () => {
      const smallCache = createStepCache({
        maxSize: 2,
        defaultTtl: 60000,
        enableGitHash: false,
      });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      smallCache.set('key4', 'value4');
      
      const stats = smallCache.getStats();
      expect(stats.evictions).toBe(2);
    });
  });

  describe('缓存统计', () => {
    it('应该正确统计命中率', () => {
      cache.set('test:key1', 'value1');
      
      // 命中 1 次
      cache.get('test:key1');
      cache.get('test:key1');
      
      // 未命中 2 次
      cache.get('test:missing1');
      cache.get('test:missing2');
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.hitRate).toBe(0.5);  // 2/4 = 50%
    });

    it('formatStats 应该返回格式化字符串', () => {
      cache.set('test:key1', 'value1');
      cache.get('test:key1');
      
      const formatted = cache.formatStats();
      
      expect(formatted).toContain('缓存统计');
      expect(formatted).toContain('命中率');
    });
  });

  describe('清除缓存', () => {
    it('clearByStepId 应该清除特定步骤缓存', () => {
      cache.set('wf1:step1:input1', 'value1');
      cache.set('wf1:step2:input2', 'value2');
      cache.set('wf2:step1:input3', 'value3');
      
      const cleared = cache.clearByStepId('step1');
      
      expect(cleared).toBe(2);
      expect(cache.has('wf1:step1:input1')).toBe(false);
      expect(cache.has('wf2:step1:input3')).toBe(false);
      expect(cache.has('wf1:step2:input2')).toBe(true);
    });

    it('clearByWorkflowId 应该清除特定工作流缓存', () => {
      cache.set('wf1:step1:input1', 'value1');
      cache.set('wf1:step2:input2', 'value2');
      cache.set('wf2:step1:input3', 'value3');
      
      const cleared = cache.clearByWorkflowId('wf1');
      
      expect(cleared).toBe(2);
      expect(cache.has('wf1:step1:input1')).toBe(false);
      expect(cache.has('wf1:step2:input2')).toBe(false);
      expect(cache.has('wf2:step1:input3')).toBe(true);
    });
  });

  describe('向后兼容', () => {
    it('应该兼容 Map 使用方式', () => {
      // set 返回 this（像 Map）
      const result = cache.set('test:key1', 'value1');
      expect(result).toBe(cache);
      
      // has/get/delete 都可用
      expect(cache.has('test:key1')).toBe(true);
      expect(cache.get('test:key1')).toBe('value1');
      expect(cache.delete('test:key1')).toBe(true);
    });
  });

  describe('导出功能', () => {
    it('export 应该导出缓存详情', () => {
      cache.set('test:key1', 'value1', 1000);
      
      const exported = cache.export();
      
      expect(exported.length).toBe(1);
      expect(exported[0].key).toBe('test:key1');
      expect(exported[0].ttl).toBe(1000);
      expect(exported[0].remainingTtl).toBeGreaterThan(0);
    });
  });
});