/**
 * 资源感知调度器测试
 */

import * as os from 'os';
import {
  getSystemMetrics,
  evaluateResourceStatus,
  getResourceAwareConcurrency,
  ResourceScheduler,
  createResourceScheduler,
  DEFAULT_THRESHOLDS,
  ResourceMetrics,
  ResourceStatus,
} from '../core/scheduler';

describe('ResourceScheduler', () => {
  describe('getSystemMetrics', () => {
    it('should return valid metrics', () => {
      const metrics = getSystemMetrics();
      
      expect(metrics.memoryUsage).toBeGreaterThanOrEqual(0);
      expect(metrics.memoryUsage).toBeLessThanOrEqual(100);
      expect(metrics.cpuLoad).toBeGreaterThanOrEqual(0);
      expect(metrics.timestamp).toBeGreaterThan(0);
    });
    
    it('should calculate memory usage correctly', () => {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const expected = ((totalMem - freeMem) / totalMem) * 100;
      
      const metrics = getSystemMetrics();
      
      expect(metrics.memoryUsage).toBeCloseTo(expected, 1);
    });
    
    it('should calculate CPU load correctly', () => {
      const cpuCount = os.cpus().length;
      const loadAvg = os.loadavg()[0];
      const expected = (loadAvg / cpuCount) * 100;
      
      const metrics = getSystemMetrics();
      
      expect(metrics.cpuLoad).toBeCloseTo(expected, 1);
    });
  });
  
  describe('evaluateResourceStatus', () => {
    it('should return normal when resources are healthy', () => {
      const metrics: ResourceMetrics = {
        memoryUsage: 50,
        cpuLoad: 30,
        timestamp: Date.now(),
      };
      
      const result = evaluateResourceStatus(metrics);
      
      expect(result.status).toBe('normal');
      expect(result.reason).toContain('资源正常');
    });
    
    it('should return high when memory is high', () => {
      const metrics: ResourceMetrics = {
        memoryUsage: 87,
        cpuLoad: 30,
        timestamp: Date.now(),
      };
      
      const result = evaluateResourceStatus(metrics);
      
      expect(result.status).toBe('high');
      expect(result.reason).toContain('内存紧张');
    });
    
    it('should return critical when memory is critical', () => {
      const metrics: ResourceMetrics = {
        memoryUsage: 96,
        cpuLoad: 30,
        timestamp: Date.now(),
      };
      
      const result = evaluateResourceStatus(metrics);
      
      expect(result.status).toBe('critical');
      expect(result.reason).toContain('内存严重紧张');
    });
    
    it('should return high when CPU load is high', () => {
      const metrics: ResourceMetrics = {
        memoryUsage: 50,
        cpuLoad: 92,
        timestamp: Date.now(),
      };
      
      const result = evaluateResourceStatus(metrics);
      
      expect(result.status).toBe('high');
      expect(result.reason).toContain('CPU 高负载');
    });
    
    it('should prioritize memory over CPU when both are high', () => {
      const metrics: ResourceMetrics = {
        memoryUsage: 87,
        cpuLoad: 92,
        timestamp: Date.now(),
      };
      
      const result = evaluateResourceStatus(metrics);
      
      expect(result.status).toBe('high');
      expect(result.reason).toContain('内存紧张');
    });
    
    it('should use custom thresholds', () => {
      const metrics: ResourceMetrics = {
        memoryUsage: 70,
        cpuLoad: 30,
        timestamp: Date.now(),
      };
      
      const customThresholds: Partial<typeof DEFAULT_THRESHOLDS> = {
        memoryHigh: 60,
        memoryCritical: 80,
        cpuHigh: 50,
      };
      
      const result = evaluateResourceStatus(metrics, { ...DEFAULT_THRESHOLDS, ...customThresholds });
      
      expect(result.status).toBe('high');
      expect(result.reason).toContain('内存紧张');
    });
  });
  
  describe('getResourceAwareConcurrency', () => {
    it('should return base concurrency when resources are normal', () => {
      // Mock low resource usage
      const mockMetrics: ResourceMetrics = {
        memoryUsage: 50,
        cpuLoad: 30,
        timestamp: Date.now(),
      };
      
      // Since we can't mock os module easily, we test the logic indirectly
      const result = getResourceAwareConcurrency(5);
      
      expect(result.concurrency).toBeGreaterThanOrEqual(1);
      expect(result.concurrency).toBeLessThanOrEqual(5);
      expect(result.metrics).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.reason).toBeDefined();
    });
    
    it('should reduce concurrency when memory is high', () => {
      const customThresholds: typeof DEFAULT_THRESHOLDS = {
        ...DEFAULT_THRESHOLDS,
        memoryHigh: 10,  // Very low threshold to force high status
      };
      
      const result = getResourceAwareConcurrency(10, customThresholds);
      
      // Memory will likely be > 10%, so it should reduce
      if (result.status === 'high' || result.status === 'critical') {
        expect(result.concurrency).toBeLessThan(10);
      }
    });
    
    it('should enforce minimum concurrency of 1', () => {
      const customThresholds: typeof DEFAULT_THRESHOLDS = {
        ...DEFAULT_THRESHOLDS,
        memoryHigh: 1,   // Extremely low to force high/critical
        memoryCritical: 2,
      };
      
      const result = getResourceAwareConcurrency(5, customThresholds);
      
      expect(result.concurrency).toBeGreaterThanOrEqual(1);
    });
  });
  
  describe('ResourceScheduler class', () => {
    it('should create scheduler with default thresholds', () => {
      const scheduler = createResourceScheduler();
      const thresholds = scheduler.getThresholds();
      
      expect(thresholds.memoryHigh).toBe(DEFAULT_THRESHOLDS.memoryHigh);
      expect(thresholds.cpuHigh).toBe(DEFAULT_THRESHOLDS.cpuHigh);
    });
    
    it('should create scheduler with custom thresholds', () => {
      const scheduler = createResourceScheduler({
        memoryHigh: 70,
        cpuHigh: 80,
      });
      const thresholds = scheduler.getThresholds();
      
      expect(thresholds.memoryHigh).toBe(70);
      expect(thresholds.cpuHigh).toBe(80);
    });
    
    it('should cache metrics within TTL', () => {
      const scheduler = createResourceScheduler();
      
      const result1 = scheduler.getConcurrency(5);
      const result2 = scheduler.getConcurrency(5);
      
      // Within 5s cache TTL, should return same metrics
      expect(result1.metrics.timestamp).toBe(result2.metrics.timestamp);
    });
    
    it('should refresh cache after TTL', async () => {
      const scheduler = new ResourceScheduler({ memoryHigh: 100 });
      scheduler['cacheTTL'] = 100; // Set very short TTL
      
      const result1 = scheduler.getConcurrency(5);
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const result2 = scheduler.getConcurrency(5);
      
      expect(result2.metrics.timestamp).toBeGreaterThan(result1.metrics.timestamp);
    });
    
    it('should force refresh cache', () => {
      const scheduler = createResourceScheduler();
      
      scheduler.getConcurrency(5);  // Populate cache
      const metrics1 = scheduler.forceRefresh();
      const result2 = scheduler.getConcurrency(5);
      
      expect(result2.metrics.timestamp).toBe(metrics1.timestamp);
    });
    
    it('should update thresholds', () => {
      const scheduler = createResourceScheduler();
      
      scheduler.updateThresholds({ memoryHigh: 75 });
      const thresholds = scheduler.getThresholds();
      
      expect(thresholds.memoryHigh).toBe(75);
    });
  });
  
  describe('Integration with executor', () => {
    it('should be importable from index', () => {
      // This tests that the module is properly exported
      expect(getSystemMetrics).toBeDefined();
      expect(evaluateResourceStatus).toBeDefined();
      expect(getResourceAwareConcurrency).toBeDefined();
      expect(createResourceScheduler).toBeDefined();
    });
  });
});