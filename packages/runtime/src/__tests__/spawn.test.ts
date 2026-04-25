/**
 * spawn.ts 测试
 */

import { spawnAgent, spawnCodex, spawnClaudeCode, spawnWithRetry } from '../executors/spawn';

// Mock child_process
jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'child_process';

describe('spawnAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw for unknown agent', async () => {
    await expect(spawnAgent({
      agent: 'unknown',
      prompt: 'test',
    })).rejects.toThrow('Unknown agent');
  });

  it('should call spawnCodex for codex agent', async () => {
    const mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      }),
      kill: jest.fn(),
    };
    
    (spawn as jest.Mock).mockReturnValue(mockProcess);
    
    const result = await spawnAgent({
      agent: 'codex',
      prompt: 'test prompt',
    });
    
    // 实际代码使用 /usr/local/bin/codex
    expect(spawn).toHaveBeenCalledWith(expect.stringContaining('codex'), expect.arrayContaining(['test prompt']), expect.any(Object));
    expect(result.success).toBe(true);
  });

  it('should call spawnClaudeCode for claude-code agent', async () => {
    const mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      }),
      kill: jest.fn(),
    };
    
    (spawn as jest.Mock).mockReturnValue(mockProcess);
    
    const result = await spawnAgent({
      agent: 'claude-code',
      prompt: 'test prompt',
    });
    
    // 使用 config.claudePath 而非硬编码 'claude'
    expect(spawn).toHaveBeenCalledWith(expect.stringContaining('claude'), expect.arrayContaining(['test prompt']), expect.any(Object));
    expect(result.success).toBe(true);
  });
});

describe('spawnCodex', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should spawn codex with correct args', async () => {
    const mockProcess = {
      stdout: { on: jest.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from('output'));
      })},
      stderr: { on: jest.fn() },
      on: jest.fn((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      }),
      kill: jest.fn(),
    };
    
    (spawn as jest.Mock).mockReturnValue(mockProcess);
    
    const result = await spawnCodex({ prompt: 'test' });
    
    expect(result.success).toBe(true);
    expect(result.output).toContain('output');
  });

  it('should capture stderr', async () => {
    const mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from('error output'));
      })},
      on: jest.fn((event: string, cb: Function) => {
        if (event === 'close') cb(1);
      }),
      kill: jest.fn(),
    };
    
    (spawn as jest.Mock).mockReturnValue(mockProcess);
    
    const result = await spawnCodex({ prompt: 'test' });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('error output');
  });

  it('should handle timeout', async () => {
    const mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn(),
    };
    
    (spawn as jest.Mock).mockReturnValue(mockProcess);
    
    const result = await spawnCodex({ 
      prompt: 'test', 
      timeout: 50 
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Timeout');
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
  });
});

describe('spawnWithRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should succeed on first attempt', async () => {
    const mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event: string, cb: Function) => {
        if (event === 'close') cb(0);
      }),
      kill: jest.fn(),
    };
    
    (spawn as jest.Mock).mockReturnValue(mockProcess);
    
    const result = await spawnWithRetry({
      agent: 'codex',
      prompt: 'test',
    }, 3, 10);
    
    expect(result.success).toBe(true);
  });

  it('should retry on failure', async () => {
    let attempts = 0;
    
    (spawn as jest.Mock).mockImplementation(() => ({
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event: string, cb: Function) => {
        if (event === 'close') {
          attempts++;
          cb(attempts < 3 ? 1 : 0);
        }
      }),
      kill: jest.fn(),
    }));
    
    const result = await spawnWithRetry({
      agent: 'codex',
      prompt: 'test',
    }, 3, 10);
    
    expect(result.success).toBe(true);
  });

  it('should fail after max retries', async () => {
    (spawn as jest.Mock).mockImplementation(() => ({
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn((event: string, cb: Function) => {
        if (event === 'close') cb(1);
      }),
      kill: jest.fn(),
    }));
    
    const result = await spawnWithRetry({
      agent: 'codex',
      prompt: 'test',
    }, 2, 10);
    
    expect(result.success).toBe(false);
    // 返回最后一次执行的结果
  });
});
