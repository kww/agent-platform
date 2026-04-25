/**
 * retry.ts 测试
 */

import { retry, withTimeout } from '../utils/retry';

describe('retry', () => {
  it('should succeed on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    
    const result = await retry(fn, { maxAttempts: 3 });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');
    
    const result = await retry(fn, { 
      maxAttempts: 3, 
      initialDelay: 10,
      onRetry: jest.fn()
    });
    
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fail'));
    
    await expect(retry(fn, { 
      maxAttempts: 3,
      initialDelay: 10
    })).rejects.toThrow('always fail');
    
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should call onRetry callback', async () => {
    const onRetry = jest.fn();
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');
    
    await retry(fn, { 
      maxAttempts: 3, 
      initialDelay: 10,
      onRetry 
    });
    
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });

  it('should use fixed backoff', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');
    
    const start = Date.now();
    await retry(fn, { 
      maxAttempts: 3, 
      initialDelay: 50,
      backoff: 'fixed'
    });
    const duration = Date.now() - start;
    
    // 固定延迟应该是 ~50ms
    expect(duration).toBeGreaterThanOrEqual(40);
    expect(duration).toBeLessThan(200);
  });
});

describe('withTimeout', () => {
  it('should resolve before timeout', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    
    const result = await withTimeout(fn, 1000);
    
    expect(result).toBe('success');
  });

  it('should reject on timeout', async () => {
    const fn = jest.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 200))
    );
    
    await expect(withTimeout(fn, 50, 'Custom timeout message'))
      .rejects.toThrow('Custom timeout message');
  });

  it('should reject with default message', async () => {
    const fn = jest.fn().mockImplementation(() => 
      new Promise(resolve => setTimeout(resolve, 200))
    );
    
    await expect(withTimeout(fn, 50))
      .rejects.toThrow('Timeout after 50ms');
  });

  it('should propagate original error', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('original error'));
    
    await expect(withTimeout(fn, 1000))
      .rejects.toThrow('original error');
  });
});
