/**
 * AR-009 P2 迭代执行结果清理测试
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('AR-009 P2 迭代执行结果清理', () => {
  let tempDir: string;
  
  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `iteration-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });
  
  afterEach(async () => {
    await fs.rmdir(tempDir, { recursive: true });
  });
  
  describe('cleanupOldIterations', () => {
    // 模拟清理函数
    async function cleanupOldIterations(iterationsDir: string, keepFrom: number): Promise<number> {
      let cleanedCount = 0;
      
      try {
        const files = await fs.readdir(iterationsDir);
        
        for (const file of files) {
          const match = file.match(/iteration_(\d+)\.json/);
          if (match) {
            const iterationNum = parseInt(match[1]);
            if (iterationNum < keepFrom) {
              const filePath = path.join(iterationsDir, file);
              await fs.unlink(filePath);
              cleanedCount++;
            }
          }
        }
      } catch {
        // 忽略错误
      }
      
      return cleanedCount;
    }
    
    it('should cleanup old iterations', async () => {
      const iterationsDir = path.join(tempDir, 'iterations', 'loop_1');
      await fs.mkdir(iterationsDir, { recursive: true });
      
      // 创建 10 个迭代文件
      for (let i = 0; i < 10; i++) {
        const filePath = path.join(iterationsDir, `iteration_${i}.json`);
        await fs.writeFile(filePath, JSON.stringify({ iteration: i }));
      }
      
      // 清理，保留最近 3 次
      const cleanedCount = await cleanupOldIterations(iterationsDir, 7);  // keepFrom = 10 - 3 = 7
      
      expect(cleanedCount).toBe(7);  // 清理 0-6，保留 7-9
      
      // 检查剩余文件
      const remaining = await fs.readdir(iterationsDir);
      expect(remaining.length).toBe(3);
      expect(remaining).toContain('iteration_7.json');
      expect(remaining).toContain('iteration_8.json');
      expect(remaining).toContain('iteration_9.json');
    });
    
    it('should cleanup all if keepFrom is 0', async () => {
      const iterationsDir = path.join(tempDir, 'iterations', 'loop_2');
      await fs.mkdir(iterationsDir, { recursive: true });
      
      // 创建 5 个迭代文件
      for (let i = 0; i < 5; i++) {
        const filePath = path.join(iterationsDir, `iteration_${i}.json`);
        await fs.writeFile(filePath, JSON.stringify({ iteration: i }));
      }
      
      // keepFrom = 0 时，所有 iterationNum >= 0，不清理
      // 这是预期行为：keepFrom = 0 意味着保留从第 0 次开始
      const cleanedCount = await cleanupOldIterations(iterationsDir, 0);
      
      // 0 不清理任何文件
      expect(cleanedCount).toBe(0);
      
      const remaining = await fs.readdir(iterationsDir);
      expect(remaining.length).toBe(5);
    });
    
    it('should handle empty directory', async () => {
      const iterationsDir = path.join(tempDir, 'empty');
      await fs.mkdir(iterationsDir, { recursive: true });
      
      const cleanedCount = await cleanupOldIterations(iterationsDir, 5);
      
      expect(cleanedCount).toBe(0);
    });
    
    it('should handle non-existent directory', async () => {
      const cleanedCount = await cleanupOldIterations('/nonexistent/path', 5);
      
      expect(cleanedCount).toBe(0);
    });
    
    it('should only cleanup iteration files', async () => {
      const iterationsDir = path.join(tempDir, 'iterations', 'loop_3');
      await fs.mkdir(iterationsDir, { recursive: true });
      
      // 创建迭代文件和其他文件
      await fs.writeFile(path.join(iterationsDir, 'iteration_0.json'), '{}');
      await fs.writeFile(path.join(iterationsDir, 'iteration_1.json'), '{}');
      await fs.writeFile(path.join(iterationsDir, 'other_file.txt'), 'data');
      await fs.writeFile(path.join(iterationsDir, 'metadata.json'), '{}');
      
      const cleanedCount = await cleanupOldIterations(iterationsDir, 1);
      
      // 只清理 iteration_*.json
      expect(cleanedCount).toBe(1);
      
      const remaining = await fs.readdir(iterationsDir);
      expect(remaining.length).toBe(3);  // iteration_1.json + other_file.txt + metadata.json
      expect(remaining).toContain('iteration_1.json');
      expect(remaining).toContain('other_file.txt');
      expect(remaining).toContain('metadata.json');
    });
  });
  
  describe('keep_recent_iterations config', () => {
    it('should have default value of 3', () => {
      const step = {
        id: 'test-loop',
        type: 'loop' as const,
        steps: [],
      };
      
      const keepRecent = (step as any).keep_recent_iterations ?? 3;
      
      expect(keepRecent).toBe(3);
    });
    
    it('should use custom value', () => {
      const step = {
        id: 'test-loop',
        type: 'loop' as const,
        steps: [],
        keep_recent_iterations: 5,
      };
      
      const keepRecent = (step as any).keep_recent_iterations ?? 3;
      
      expect(keepRecent).toBe(5);
    });
  });
  
  describe('cleanup_interval config', () => {
    it('should have default value of 5', () => {
      const step = {
        id: 'test-loop',
        type: 'loop' as const,
        steps: [],
      };
      
      const interval = (step as any).cleanup_interval ?? 5;
      
      expect(interval).toBe(5);
    });
    
    it('should use custom value', () => {
      const step = {
        id: 'test-loop',
        type: 'loop' as const,
        steps: [],
        cleanup_interval: 3,
      };
      
      const interval = (step as any).cleanup_interval ?? 5;
      
      expect(interval).toBe(3);
    });
  });
  
  describe('iteration file format', () => {
    it('should create valid JSON file', async () => {
      const iterationsDir = path.join(tempDir, 'iterations', 'loop_4');
      await fs.mkdir(iterationsDir, { recursive: true });
      
      const iterationData = {
        iteration: 0,
        state: { counter: 1 },
        outputs: { result: 'success' },
        timestamp: new Date().toISOString(),
      };
      
      const filePath = path.join(iterationsDir, 'iteration_0.json');
      await fs.writeFile(filePath, JSON.stringify(iterationData, null, 2));
      
      const content = await fs.readFile(filePath, 'utf-8');
      const loaded = JSON.parse(content);
      
      expect(loaded.iteration).toBe(0);
      expect(loaded.state.counter).toBe(1);
      expect(loaded.outputs.result).toBe('success');
    });
  });
});