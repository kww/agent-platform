/**
 * 重试机制
 */

export interface RetryOptions {
  maxAttempts: number;
  backoff?: 'fixed' | 'exponential';
  initialDelay?: number;
  maxDelay?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * 带重试的异步操作
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxAttempts,
    backoff = 'exponential',
    initialDelay = 1000,
    maxDelay = 60000,
    onRetry
  } = options;
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxAttempts) {
        const delay = calculateDelay(attempt, backoff, initialDelay, maxDelay);
        onRetry?.(attempt, lastError);
        await sleep(delay);
      }
    }
  }
  
  throw lastError || new Error('Retry failed');
}

/**
 * 计算重试延迟
 */
function calculateDelay(
  attempt: number,
  backoff: 'fixed' | 'exponential',
  initialDelay: number,
  maxDelay: number
): number {
  if (backoff === 'fixed') {
    return initialDelay;
  }
  
  // 指数退避：delay = initialDelay * 2^(attempt-1)
  const delay = initialDelay * Math.pow(2, attempt - 1);
  return Math.min(delay, maxDelay);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带超时的异步操作
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message || `Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    
    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timer));
  });
}
