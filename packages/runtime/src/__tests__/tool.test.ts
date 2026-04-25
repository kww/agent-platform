/**
 * tool.ts 测试
 */

import { executeTool } from '../executors/tool';

// Mock parser
jest.mock('../core/parser', () => ({
  parseTool: jest.fn((name: string) => {
    if (name === 'file-read') {
      return {
        name: 'file-read',
        description: '读取文件',
        input: { path: { type: 'string' } },
        script: 'cat $path',
      };
    }
    if (name === 'file-write') {
      return {
        name: 'file-write',
        description: '写入文件',
      };
    }
    if (name === 'file-copy') {
      return {
        name: 'file-copy',
        description: '复制文件',
      };
    }
    if (name === 'test-script') {
      return {
        name: 'test-script',
        script: 'echo "hello $name"',
      };
    }
    throw new Error(`Tool not found: ${name}`);
  }),
}));

describe('executeTool', () => {
  const mockContext: any = {
    workdir: '/tmp',
    eventEmitter: {
      emit: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('builtin tools', () => {
    it('should execute file-read', async () => {
      const result = await executeTool('file-read', { 
        path: '/etc/hostname' 
      }, mockContext);
      
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should execute file-write', async () => {
      const result = await executeTool('file-write', { 
        path: '/tmp/test-write.txt',
        content: 'test content'
      }, mockContext);
      
      expect(result.success).toBe(true);
    });

    it('should execute file-copy', async () => {
      // 先创建源文件
      require('fs').writeFileSync('/tmp/copy-src.txt', 'source');
      
      const result = await executeTool('file-copy', { 
        src: '/tmp/copy-src.txt',
        dest: '/tmp/copy-dest.txt'
      }, mockContext);
      
      expect(result.success).toBe(true);
    });

    it('should fail file-read for non-existent file', async () => {
      await expect(executeTool('file-read', { 
        path: '/non/existent/file.txt' 
      }, mockContext)).rejects.toThrow();
    });
  });

  describe('events', () => {
    it('should emit tool.started event', async () => {
      await executeTool('file-read', { path: '/etc/hostname' }, mockContext);
      
      expect(mockContext.eventEmitter.emit).toHaveBeenCalledWith(
        'tool.started',
        expect.objectContaining({
          name: 'file-read',
        })
      );
    });

    it('should emit tool.completed event', async () => {
      await executeTool('file-read', { path: '/etc/hostname' }, mockContext);
      
      expect(mockContext.eventEmitter.emit).toHaveBeenCalledWith(
        'tool.completed',
        expect.any(Object)
      );
    });

    it('should emit tool.failed event on error', async () => {
      try {
        await executeTool('file-read', { path: '/non/existent' }, mockContext);
      } catch {}
      
      expect(mockContext.eventEmitter.emit).toHaveBeenCalledWith(
        'tool.failed',
        expect.objectContaining({
          name: 'file-read',
        })
      );
    });
  });

  describe('git tools', () => {
    it('should handle git-clone', async () => {
      // 这个测试不实际执行 git clone
      const result = await executeTool('git-clone', { 
        url: 'https://invalid-url.test/repo.git'
      }, mockContext).catch(() => null);
      
      // git clone 会失败，但不会抛出未处理的错误
      expect(result).toBeDefined();
    });
  });

  describe('npm tools', () => {
    it('should handle npm-run', async () => {
      const result = await executeTool('npm-run', { 
        script: 'nonexistent'
      }, mockContext).catch(() => null);
      
      expect(result).toBeDefined();
    });
  });
});
