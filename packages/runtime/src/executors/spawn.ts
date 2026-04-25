/**
 * Agent 启动器
 * 
 * 支持：
 * - codex (OpenAI Codex)
 * - claude-code (Anthropic Claude)
 */

import { spawn, ChildProcess } from 'child_process';
import { config } from '../utils/config';
import { DEFAULT_TIMEOUTS, ErrorType, ClassifiedError } from '../core/types';
import { embedMessagesIntoPrompt, Message } from '../core/messages-prompt-builder';

export interface SpawnOptions {
  agent: string;
  prompt: string;
  workdir?: string;
  timeout?: number;
  onProgress?: (message: string) => void;
  // 模型参数
  model?: string;
  temperature?: number;
  maxTokens?: number;
  
  // 🆕 Phase 6: messages 传递
  messages?: Message[];     // 对话历史
  passHistory?: boolean;   // 是否传递历史（默认 false）
}

export interface SpawnResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode?: number;
  classifiedError?: ClassifiedError;
}

// Agent 别名映射
const AGENT_ALIASES: Record<string, string> = {
  'claude': 'claude-code',
  'claude-code': 'claude-code',
  'codex': 'codex',
  'openai': 'codex',
};

/**
 * 获取 Agent 默认超时
 */
export function getAgentTimeout(agent: string): number {
  const resolvedAgent = AGENT_ALIASES[agent.toLowerCase()] || agent;
  return DEFAULT_TIMEOUTS.agent?.[resolvedAgent] || DEFAULT_TIMEOUTS.step || 300000;
}

/**
 * 分类错误
 */
export function classifySpawnError(error: string, exitCode?: number): ClassifiedError {
  const lowerError = error.toLowerCase();
  
  // 网络错误
  if (
    lowerError.includes('econnrefused') ||
    lowerError.includes('enotfound') ||
    lowerError.includes('etimedout') ||
    lowerError.includes('network') ||
    lowerError.includes('socket hang up')
  ) {
    return {
      type: 'NETWORK',
      originalError: error,
      recoverable: true,
      retryDelay: 5000,
      suggestion: '网络连接失败，将自动重试',
    };
  }
  
  // API 限制
  if (
    lowerError.includes('rate limit') ||
    lowerError.includes('429') ||
    lowerError.includes('too many requests')
  ) {
    return {
      type: 'RATE_LIMIT',
      originalError: error,
      recoverable: true,
      retryDelay: 60000,
      suggestion: 'API 请求频率限制，等待后重试',
    };
  }
  
  // 超时
  if (
    lowerError.includes('timeout') ||
    lowerError.includes('timed out') ||
    lowerError === 'timeout'
  ) {
    return {
      type: 'TIMEOUT',
      originalError: error,
      recoverable: true,
      retryDelay: 10000,
      suggestion: '执行超时，可尝试增加超时时间',
    };
  }
  
  // API 错误
  if (
    lowerError.includes('api key') ||
    lowerError.includes('invalid api') ||
    lowerError.includes('authentication') ||
    lowerError.includes('unauthorized') ||
    lowerError.includes('401') ||
    lowerError.includes('403')
  ) {
    return {
      type: 'API_ERROR',
      originalError: error,
      recoverable: false,
      suggestion: 'API 配置错误，请检查 API Key 配置',
    };
  }
  
  // 权限错误（通过错误消息或 exit code）
  if (
    lowerError.includes('permission') ||
    lowerError.includes('access denied') ||
    lowerError.includes('forbidden') ||
    lowerError.includes('command not found') ||
    exitCode === 126 ||
    exitCode === 127
  ) {
    return {
      type: 'PERMISSION',
      originalError: error,
      recoverable: false,
      suggestion: '权限不足或命令不存在，请检查文件或命令权限',
    };
  }
  
  // 默认未知错误
  return {
    type: 'UNKNOWN',
    originalError: error,
    recoverable: false,
    suggestion: '未知错误，请查看详细日志',
  };
}

/**
 * 启动 Agent
 */
export async function spawnAgent(options: SpawnOptions): Promise<SpawnResult> {
  const { agent, prompt, workdir, timeout, onProgress, messages, passHistory } = options;
  
  // 解析别名
  const resolvedAgent = AGENT_ALIASES[agent.toLowerCase()] || agent;
  
  // 🆕 Phase 6: 嵌入 messages 到 prompt
  let effectivePrompt = prompt;
  
  if (passHistory && messages && messages.length > 0) {
    effectivePrompt = embedMessagesIntoPrompt(messages, prompt);
  }
  
  // 🆕 使用 Agent 特定默认超时（如果未指定）
  const effectiveTimeout = timeout || getAgentTimeout(agent);
  
  // 根据类型选择启动器
  switch (resolvedAgent) {
    case 'codex':
      return spawnCodex({ prompt: effectivePrompt, workdir, timeout: effectiveTimeout, onProgress });
    
    case 'claude-code':
      return spawnClaudeCode({ prompt: effectivePrompt, workdir, timeout: effectiveTimeout, onProgress });
    
    default:
      throw new Error(`Unknown agent: ${agent} (resolved: ${resolvedAgent}). Supported: codex, claude-code`);
  }
}

/**
 * 启动 Codex Agent
 */
export async function spawnCodex(options: Omit<SpawnOptions, 'agent'>): Promise<SpawnResult> {
  const { prompt, workdir, timeout, onProgress, model, temperature } = options;
  
  return new Promise((resolve, reject) => {
    // codex exec: 非交互模式
    // --full-auto: 自动执行，不需要确认
    const args = [
      'exec',
      '--full-auto',
      '--skip-git-repo-check',
    ];
    
    // 添加模型参数（优先使用传入的 model，否则使用环境变量）
    const useModel = model || process.env.DEFAULT_MODEL;
    if (useModel) {
      args.push('-m', useModel);
    }
    
    // 添加 prompt
    args.push(prompt);
    
    const proc = spawn('/usr/local/bin/codex', args, {
      cwd: workdir || config.workdir,
      // 不覆盖环境变量，让 codex 读取 ~/.codex/config.toml 配置
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      onProgress?.(output);
    });
    
    proc.stderr?.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      onProgress?.(output);
    });
    
    // 超时处理
    const timer = timeout ? setTimeout(() => {
      proc.kill('SIGKILL');
      const classifiedError: ClassifiedError = {
        type: 'TIMEOUT',
        originalError: 'Timeout',
        recoverable: true,
        retryDelay: 10000,
        suggestion: `执行超时（${Math.round(timeout / 1000)}秒），可尝试增加超时时间`,
      };
      resolve({
        success: false,
        error: 'Timeout',
        classifiedError,
      });
    }, timeout) : null;
    
    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      
      // 千帆 API 可能有消息格式兼容问题，但实际上任务可能已完成
      // 检查输出中是否有成功执行的标志
      const combinedOutput = stdout + stderr;
      const hasSuccessMarker = combinedOutput.includes('succeeded') || combinedOutput.includes('completed');
      const hasApiFormatError = stderr.includes('Message format error') || stderr.includes('invalid_argument');
      
      // 检查是否有成功执行的工具调用（表明 Codex 正在工作）
      const hasToolExecution = combinedOutput.includes('exec\nbash') || combinedOutput.includes('succeeded in');
      
      // 判断成功的条件：
      // 1. 正常退出
      // 2. 有成功标志
      // 3. 有工具执行但遇到 API 格式错误（千帆兼容性问题）
      const actualSuccess = code === 0 || hasSuccessMarker || (hasToolExecution && hasApiFormatError);
      
      // 🆕 错误分类
      const errorStr = hasApiFormatError ? undefined : stderr || undefined;
      const classifiedError = errorStr ? classifySpawnError(errorStr, code || undefined) : undefined;
      
      resolve({
        success: actualSuccess,
        output: stdout || (hasSuccessMarker ? combinedOutput : ''),
        error: errorStr,
        exitCode: code || undefined,
        classifiedError,
      });
    });
    
    proc.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * 启动 Claude Code Agent
 */
export async function spawnClaudeCode(options: Omit<SpawnOptions, 'agent'>): Promise<SpawnResult> {
  const { prompt, workdir, timeout, onProgress } = options;
  
  // 检查是否是 root 用户
  const isRoot = process.getuid?.() === 0;
  
  return new Promise((resolve, reject) => {
    let proc: ChildProcess;
    
    if (isRoot) {
      // root 用户：使用 Docker 方案
      // claude-docker 脚本格式: claude-docker [项目路径] [prompt]
      // 脚本内部已包含 --permission-mode bypassPermissions --print
      const workdirPath = workdir || config.workdir;
      onProgress?.('🐳 使用 Docker 运行 Claude Code...\n');
      
      proc = spawn('/root/.local/bin/claude-docker', [
        workdirPath,
        prompt
      ], {
        cwd: workdirPath,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } else {
      // 非 root 用户：直接运行
      const args = [
        '--print',
        '--permission-mode', 'bypassPermissions',
        prompt
      ];
      
      proc = spawn('claude', args, {
        cwd: workdir || config.workdir,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: config.anthropicApiKey,
          ANTHROPIC_BASE_URL: config.anthropicBaseUrl,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    }
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      onProgress?.(output);
    });
    
    proc.stderr?.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      onProgress?.(output);
    });
    
    // 超时处理
    const timer = timeout ? setTimeout(() => {
      proc.kill('SIGKILL');
      const classifiedError: ClassifiedError = {
        type: 'TIMEOUT',
        originalError: 'Timeout',
        recoverable: true,
        retryDelay: 10000,
        suggestion: `执行超时（${Math.round(timeout / 1000)}秒），可尝试增加超时时间`,
      };
      resolve({
        success: false,
        error: 'Timeout',
        classifiedError,
      });
    }, timeout) : null;
    
    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      
      // 🆕 错误分类
      const classifiedError = stderr ? classifySpawnError(stderr, code || undefined) : undefined;
      
      resolve({
        success: code === 0,
        output: stdout,
        error: stderr || undefined,
        exitCode: code || undefined,
        classifiedError,
      });
    });
    
    proc.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * 带重试的 Agent 启动（智能重试）
 */
export async function spawnWithRetry(
  options: SpawnOptions,
  maxRetries: number = 3,
  baseDelay: number = 5000
): Promise<SpawnResult> {
  let lastResult: SpawnResult | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await spawnAgent(options);
    
    if (result.success) {
      return result;
    }
    
    lastResult = result;
    
    // 🆕 根据错误类型决定是否重试
    const classified = result.classifiedError;
    if (classified && !classified.recoverable) {
      // 不可恢复的错误，不重试
      console.log(`❌ 不可恢复的错误: ${classified.type} - ${classified.suggestion}`);
      return result;
    }
    
    // 可恢复错误，等待后重试
    if (attempt < maxRetries) {
      const delay = classified?.retryDelay || baseDelay * attempt;
      console.log(`🔄 重试 ${attempt}/${maxRetries}，等待 ${Math.round(delay / 1000)}秒...`);
      await sleep(delay);
    }
  }
  
  return lastResult || {
    success: false,
    error: 'Max retries exceeded',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
