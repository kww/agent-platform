/**
 * AR-009 P1 Dynamic Phase 输出优化测试
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { OutputManager, createOutputManager, lazyGetOutput } from '../core/output-manager';

describe('AR-009 P1 输出管理', () => {
  let tempDir: string;
  let outputManager: OutputManager;
  
  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `output-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    outputManager = createOutputManager({ workdir: tempDir });
  });
  
  afterEach(async () => {
    await outputManager.cleanup();
    await fs.rmdir(tempDir, { recursive: true });
  });
  
  describe('OutputManager', () => {
    it('should set and get output', () => {
      outputManager.set('key1', { data: 'test' });
      
      const value = outputManager.get('key1');
      
      expect(value).toEqual({ data: 'test' });
    });
    
    it('should return null for non-existent key', () => {
      const value = outputManager.get('nonexistent');
      
      expect(value).toBeNull();
    });
    
    it('should handle string output', () => {
      outputManager.set('key1', 'simple string');
      
      expect(outputManager.get('key1')).toBe('simple string');
    });
    
    it('should handle large output', async () => {
      // 创建大数据（> 1KB）
      const largeData = {
        items: Array(100).fill({ name: 'test', value: 'x'.repeat(100) })
      };
      
      outputManager.set('large', largeData);
      
      // 手动触发刷新
      await outputManager.flushAll();
      
      // 获取时应该从文件加载
      const value = outputManager.get('large');
      
      expect(value).toEqual(largeData);
    });
    
    it('should write batch outputs to disk', async () => {
      const batch = [
        { taskId: 'task_001', output: { result: 'a' } },
        { taskId: 'task_002', output: { result: 'b' } },
      ];
      
      await outputManager.writeBatchOutputs('phase_1', batch);
      
      // 获取输出
      const output1 = outputManager.get('task_task_001_result');
      const output2 = outputManager.get('task_task_002_result');
      
      expect(output1).toEqual({ result: 'a' });
      expect(output2).toEqual({ result: 'b' });
    });
    
    it('should track flushed count', async () => {
      outputManager.set('small', { data: 'x' });
      outputManager.set('large1', { data: 'x'.repeat(2000) });
      outputManager.set('large2', { data: 'y'.repeat(2000) });
      
      await outputManager.flushAll();
      
      // 只有大输出会被刷新
      expect(outputManager.flushedCount()).toBeGreaterThanOrEqual(2);
    });
    
    it('should export to plain object', () => {
      outputManager.set('a', 1);
      outputManager.set('b', 2);
      
      const obj = outputManager.toObject();
      
      expect(obj.a).toBe(1);
      expect(obj.b).toBe(2);
    });
  });
  
  describe('lazyGetOutput', () => {
    it('should load output from disk', async () => {
      // 先写入文件
      const outputsDir = path.join(tempDir, '.agent-runtime', 'phase_outputs');
      await fs.mkdir(outputsDir, { recursive: true });
      
      const outputPath = path.join(outputsDir, 'test_key.json');
      await fs.writeFile(outputPath, JSON.stringify({ test: 'data' }));
      
      // 惰性加载
      const value = lazyGetOutput(tempDir, 'test_key');
      
      expect(value).toEqual({ test: 'data' });
    });
    
    it('should return null if file not found', () => {
      const value = lazyGetOutput(tempDir, 'nonexistent');
      
      expect(value).toBeNull();
    });
  });
  
  describe('OutputRef', () => {
    it('should detect output ref', () => {
      const ref = { ref: '/path/to/file.json' };
      
      expect(outputManager.isOutputRef(ref)).toBe(true);
      expect(outputManager.isOutputRef({ data: 'test' })).toBe(false);
      expect(outputManager.isOutputRef(null)).toBe(false);
    });
    
    it('should load from ref', async () => {
      // 写入文件
      const refPath = path.join(tempDir, 'ref_test.json');
      await fs.writeFile(refPath, JSON.stringify({ refData: 'test' }));
      
      // 设置为引用
      outputManager.set('ref_key', { ref: refPath });
      
      // 获取时应该加载
      const value = outputManager.get('ref_key');
      
      expect(value).toEqual({ refData: 'test' });
    });
  });
});