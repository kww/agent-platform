/**
 * 配置管理
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// 加载 .env 文件（静默模式，避免 CLI 启动慢）
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  try {
    // dotenv@17 支持 quiet 选项，避免提示信息
    require('dotenv').config({ path: envPath, quiet: true });
  } catch (e) {
    // 如果不支持 quiet，静默加载（忽略提示）
    const originalLog = console.log;
    console.log = () => {}; // 临时禁用 console.log
    try {
      require('dotenv').config({ path: envPath });
    } finally {
      console.log = originalLog; // 恢复 console.log
    }
  }
}

export interface Config {
  // 路径配置
  workflowsPath: string;  // agent-workflows 根目录
  skillsPath: string;     // skills 子目录（原 steps）
  
  // API 配置
  codingApiKey?: string;
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  anthropicModel?: string;
  
  // 执行配置
  defaultTimeout: number;
  maxRetries: number;
  retryDelay: number;
  maxConcurrent: number;   // 🆕 全局最大并发数
  defaultAgent?: string;   // 🆕 全局默认 Agent（AR-005）
  
  // 工作目录
  workdir: string;
  outputsDir: string;
  
  // Agent 路径
  codexPath?: string;
  claudePath?: string;
}

const DEFAULT_CONFIG: Partial<Config> = {
  defaultTimeout: 60000,
  maxRetries: 3,
  retryDelay: 5000,
  maxConcurrent: 5,  // 🆕 默认最大并发数
  defaultAgent: 'codex',  // 🆕 默认 Agent（AR-005）
};

/**
 * 加载配置
 */
export function loadConfig(): Config {
  // 路径查找优先级：
  // 1. 环境变量 AGENT_WORKFLOWS_PATH（最高优先级）
  // 2. npm 包 @dommaker/workflows（通过 require.resolve）
  // 3. 内置 workflows 包（runtime 同级的 workflows 目录，开发环境）
  // 4. 用户目录 ~/.agent-workflows
  // 5. 开发环境硬编码路径（向后兼容）
  
  let workflowsPath: string;
  
  // 1. 环境变量优先
  if (process.env.AGENT_WORKFLOWS_PATH) {
    workflowsPath = process.env.AGENT_WORKFLOWS_PATH;
  }
  // 2. npm 包 @dommaker/workflows
  else {
    try {
      // require.resolve 会返回包的入口文件路径，需要获取包目录
      const pkgEntry = require.resolve('@dommaker/workflows');
      const npmWorkflows = path.dirname(pkgEntry);
      if (fs.existsSync(path.join(npmWorkflows, 'workflows'))) {
        workflowsPath = npmWorkflows;
      } else {
        throw new Error('npm 包缺少 workflows 目录');
      }
    } catch (e) {
      // 3. 内置 workflows 包（monorepo 结构：packages/runtime 同级有 packages/workflows）
      const builtInWorkflows = path.resolve(__dirname, '../../../workflows');
      if (fs.existsSync(builtInWorkflows)) {
        workflowsPath = builtInWorkflows;
      }
      // 4. 用户目录
      else {
        const userWorkflows = path.join(os.homedir(), '.agent-workflows');
        if (fs.existsSync(userWorkflows)) {
          workflowsPath = userWorkflows;
        }
        // 5. 开发环境硬编码路径（向后兼容）
        else {
          workflowsPath = path.join(os.homedir(), 'projects', 'agent-platform', 'packages', 'workflows');
        }
      }
    }
  }
  
  // skills 路径（优先环境变量，否则 workflows/skills）
  const skillsPath = process.env.AGENT_SKILLS_PATH || 
                      path.join(workflowsPath, 'skills');
  
  return {
    // 路径配置
    workflowsPath,
    skillsPath,
    
    // API 配置
    codingApiKey: process.env.CODING_API_KEY_1,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY_1 || process.env.ANTHROPIC_API_KEY,
    anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
    anthropicModel: process.env.ANTHROPIC_MODEL,
    
    // 执行配置
    defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || '', 10) || DEFAULT_CONFIG.defaultTimeout!,
    maxRetries: parseInt(process.env.MAX_RETRIES || '', 10) || DEFAULT_CONFIG.maxRetries!,
    retryDelay: parseInt(process.env.RETRY_DELAY || '', 10) || DEFAULT_CONFIG.retryDelay!,
    maxConcurrent: parseInt(process.env.MAX_CONCURRENT || '', 10) || DEFAULT_CONFIG.maxConcurrent!,
    defaultAgent: process.env.DEFAULT_AGENT || DEFAULT_CONFIG.defaultAgent!,  // 🆕 AR-005
    
    // 工作目录（默认 /tmp/agent-runtime，避免污染项目目录）
    workdir: process.env.WORKDIR || path.join(os.tmpdir(), 'agent-runtime'),
    outputsDir: process.env.OUTPUTS_DIR || path.join(os.homedir(), 'outputs'),
    
    // Agent 路径
    codexPath: process.env.CODEX_PATH || 'codex',
    claudePath: process.env.CLAUDE_PATH || 'claude',
  };
}

// 全局配置实例
export const config = loadConfig();
