/**
 * HTTP API Server
 */

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { executeWorkflow, getWorkflowStatus } from './core/executor';
import { listWorkflows, listSteps, listTools, getWorkflow } from './core/registry';
import { handleCommand, parseCommand } from './core/commands';
import { mcpClientManager, loadMCPServers } from './core/mcp-client';
import { 
  analyzeChanges, 
  createReviewWorkflow, 
  submitReview, 
  canCommit,
  detectChangeType,
  assessImpact,
  SpecChange,
  ReviewWorkflow
} from './core/spec-review';
import { parseWorkflow } from './core/parser';
import { config } from './utils/config';
import { getMetrics } from './monitoring';
import { requireNotGuest } from './middleware/auth';

/**
 * 读取并解析 JSON 文件
 */
function readJsonFile(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 存储运行中的执行
const runningExecutions = new Map<string, any>();

/**
 * 根据 executionId 查找执行目录和状态
 */
function findExecutionDir(executionId: string): { dir: string; statePath: string; state: any } | null {
  const outputsDir = config.workdir;
  if (!fs.existsSync(outputsDir)) return null;

  const dirs = fs.readdirSync(outputsDir);
  for (const dir of dirs) {
    const statePath = path.join(outputsDir, dir, '.agent-runtime', 'state.json');
    if (fs.existsSync(statePath)) {
      try {
        const state = readJsonFile(statePath);
        if (state.executionId === executionId) {
          return { dir, statePath, state };
        }
      } catch {
        // 跳过损坏的状态文件
      }
    }
  }
  return null;
}

/**
 * POST /api/executions/:id/stop
 * 停止执行
 */
app.post('/api/executions/:id/stop', async (req: Request, res: Response) => {
  try {
    const executionId = req.params.id as string;
    const execContext = runningExecutions.get(executionId);
    const found = findExecutionDir(executionId);

    if (!found) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    const { state, statePath } = found;
    if (!['running', 'pending', 'paused'].includes(state.status)) {
      return res.status(400).json({ error: `Execution is ${state.status}, cannot stop` });
    }

    const previousStatus = state.status;
    state.status = 'stopped';
    state.completedAt = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    if (execContext) {
      execContext.stopped = true;
    }

    res.json({ success: true, status: 'stopped', previousStatus });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/executions/:id/pause
 * 暂停执行
 */
app.post('/api/executions/:id/pause', async (req: Request, res: Response) => {
  try {
    const executionId = req.params.id as string;
    const found = findExecutionDir(executionId);

    if (!found) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    const { state, statePath } = found;
    if (state.status !== 'running') {
      return res.status(400).json({ error: `Execution is ${state.status}, cannot pause` });
    }

    const previousStatus = state.status;
    state.status = 'paused';
    state.pausedAt = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    res.json({ success: true, status: 'paused', previousStatus });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/executions/:id/resume
 * 恢复执行
 */
app.post('/api/executions/:id/resume', async (req: Request, res: Response) => {
  try {
    const executionId = req.params.id as string;
    const found = findExecutionDir(executionId);

    if (!found) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    const { state, statePath } = found;
    if (!['paused', 'pending'].includes(state.status)) {
      return res.status(400).json({ error: `Execution is ${state.status}, cannot resume` });
    }

    const previousStatus = state.status;
    state.status = 'running';
    state.resumedAt = new Date().toISOString();
    delete state.pausedAt;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

    res.json({ success: true, status: 'running', previousStatus });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/executions/:id/retry
 * 重试执行
 */
app.post('/api/executions/:id/retry', async (req: Request, res: Response) => {
  try {
    const executionId = req.params.id as string;
    const outputsDir = config.workdir;
    
    // 查找原执行记录
    const dirs = fs.readdirSync(outputsDir);
    let originalMeta: any = null;
    
    for (const dir of dirs) {
      const metaPath = path.join(outputsDir, dir, '.meta.json');
      if (fs.existsSync(metaPath)) {
        const meta = readJsonFile(metaPath);
        const idStr = Array.isArray(executionId) ? executionId[0] : executionId;
        if (meta.executionId === executionId || dir.includes(idStr.substring(0, 8))) {
          originalMeta = meta;
          break;
        }
      }
    }
    
    if (!originalMeta) {
      return res.status(404).json({ error: 'Original execution not found' });
    }
    
    // 重新执行
    const workflow = originalMeta.workflow;
    const inputs = originalMeta.inputs || {};
    
    // 调用执行 API
    req.body = { workflow, inputs };
    await executeWorkflowHandler(req, res);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/executions/:id/steps/:stepId/retry
 * 重试单个步骤
 */
app.post('/api/executions/:id/steps/:stepId/retry', async (req: Request, res: Response) => {
  try {
    const executionId = req.params.id as string;
    const stepId = req.params.stepId as string;
    const found = findExecutionDir(executionId);

    if (!found) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    const { state, statePath, dir: execDir } = found;
    
    // 检查步骤是否存在
    if (!state.steps[stepId]) {
      return res.status(404).json({ error: `Step ${stepId} not found` });
    }
    
    // 检查步骤状态（只允许重试失败或已完成的步骤）
    const stepStatus = state.steps[stepId].status;
    if (stepStatus === 'running') {
      return res.status(400).json({ error: 'Cannot retry running step' });
    }
    
    // 重置该步骤及后续所有步骤的状态
    const workflow = parseWorkflow(state.workflowId);
    const stepIndex = (workflow.steps || []).findIndex((s: any) => s.id === stepId);
    
    if (stepIndex === -1) {
      return res.status(400).json({ error: 'Step not found in workflow' });
    }
    
    // 重置从该步骤开始的所有步骤状态
    for (let i = stepIndex; i < (workflow.steps || []).length; i++) {
      const sid = (workflow.steps || [])[i].id;
      if (state.steps[sid]) {
        state.steps[sid].status = 'pending';
        delete state.steps[sid].error;
        delete state.steps[sid].output;
      }
    }
    
    // 重置工作流状态为 running
    state.status = 'running';
    delete state.endTime;
    
    // 保存状态
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    
    // 触发重新执行（异步）
    const workdir = path.join(config.workdir, execDir);
    executeWorkflow(state.workflowId, state.inputs, {
      workdir,
      resume: true,
      force: false,
      onEvent: (event) => {
        console.log(`[Step Retry] ${event.type}:`, event.data);
      }
    }).catch((err) => {
      console.error('[Step Retry] Error:', err);
    });
    
    res.json({ 
      success: true, 
      message: `Step ${stepId} retry started`,
      resetSteps: (workflow.steps || []).slice(stepIndex).map((s: any) => s.id)
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/executions/:id
 * 删除执行记录
 */
app.delete('/api/executions/:id', requireNotGuest(), async (req: Request, res: Response) => {
  try {
    const executionId = req.params.id as string;
    const found = findExecutionDir(executionId);

    if (!found) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    const { state, dir: execDir } = found;
    if (state.status === 'running') {
      return res.status(400).json({ error: 'Cannot delete running execution. Stop it first.' });
    }

    const outputsDir = config.workdir;
    const fullPath = path.join(outputsDir, execDir);
    const resolvedPath = path.resolve(fullPath);
    const resolvedOutputs = path.resolve(outputsDir);
    if (!resolvedPath.startsWith(resolvedOutputs + path.sep)) {
      return res.status(400).json({ error: 'Invalid path: outside outputs directory' });
    }

    fs.rmSync(fullPath, { recursive: true, force: true });
    res.json({ success: true, message: 'Execution deleted', deletedPath: execDir });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// 执行工作流处理函数
async function executeWorkflowHandler(req: Request, res: Response) {
  const { workflow, inputs, workdir, options } = req.body;
  
  if (!workflow) {
    return res.status(400).json({ error: 'Missing workflow parameter' });
  }
  
  // 创建简洁的工作目录名（日期时间格式）
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const executionWorkdir = workdir || `${config.workdir}/${workflow}-${dateStr}-${timeStr}`;
  
  // 创建目录并写入 README
  if (!fs.existsSync(executionWorkdir)) {
    fs.mkdirSync(executionWorkdir, { recursive: true });
  }
  
  // 写入元数据文件
  const metaPath = `${executionWorkdir}/.meta.json`;
  const meta = {
    workflow,
    workflowName: workflow,
    requirement: inputs?.requirement || inputs?.input || '',
    inputs,
    startedAt: now.toISOString(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  
  // 写入 README.md
  const readmePath = `${executionWorkdir}/README.md`;
  const readme = `# ${workflow}\n\n**需求**: ${inputs?.requirement || inputs?.input || '未指定'}\n\n**开始时间**: ${now.toLocaleString('zh-CN')}\n`;
  fs.writeFileSync(readmePath, readme);
  
  // 获取 agent-studio WebSocket 推送 URL
  const studioUrl = process.env.AGENT_STUDIO_URL || 'http://localhost:13101';
  
  // 预先生成 executionId，用于事件推送
  const executionId = uuidv4();
  
  // 存储执行上下文
  runningExecutions.set(executionId, { stopped: false });
  
  // 异步执行（带事件回调）
  await executeWorkflowAsync(workflow, inputs || {}, {
    workdir: executionWorkdir,
    executionId,
    ...options,
    onEvent: async (event: any) => {
      const eventType = event.type || 'unknown';
      const eventData = event.data || {};
      
      try {
        const payload = {
          type: eventType,
          event_type: `runtime.${eventType}`,
          executionId,
          workflow,
          timestamp: event.timestamp || new Date().toISOString(),
          ...eventData,
        };
        
        await fetch(`${studioUrl}/api/v1/executions/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        console.log(`📤 Event pushed: ${eventType}`);
      } catch (e) {
        console.error(`Failed to push event:`, e);
      }
    },
  });
  
  // 清理
  runningExecutions.delete(executionId);
  
  res.json({
    executionId,
    status: 'running',
    workflow,
  });
}

/**
 * POST /api/execute
 * 执行工作流
 */
app.post('/api/execute', async (req: Request, res: Response) => {
  try {
    const { workflow, inputs, workdir, options } = req.body;
    
    if (!workflow) {
      return res.status(400).json({ error: 'Missing workflow parameter' });
    }
    
    // 创建简洁的工作目录名（日期时间格式）
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const executionWorkdir = workdir || `${config.workdir}/${workflow}-${dateStr}-${timeStr}`;
    
    // 创建目录并写入 README
    if (!fs.existsSync(executionWorkdir)) {
      fs.mkdirSync(executionWorkdir, { recursive: true });
    }
    
    // 写入元数据文件
    const metaPath = `${executionWorkdir}/.meta.json`;
    const meta = {
      workflow,
      workflowName: workflow,
      requirement: inputs?.requirement || inputs?.input || '',
      inputs,
      startedAt: now.toISOString(),
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    
    // 写入 README.md
    const readmePath = `${executionWorkdir}/README.md`;
    const readme = `# ${workflow}\n\n**需求**: ${inputs?.requirement || inputs?.input || '未指定'}\n\n**开始时间**: ${now.toLocaleString('zh-CN')}\n`;
    fs.writeFileSync(readmePath, readme);
    
    // 获取 agent-studio WebSocket 推送 URL
    const studioUrl = process.env.AGENT_STUDIO_URL || 'http://localhost:13101';
    
    // 预先生成 executionId，用于事件推送
    const executionId = uuidv4();
    
    // 异步执行（带事件回调）
    await executeWorkflowAsync(workflow, inputs || {}, {
      workdir: executionWorkdir,
      executionId,  // 传递给 executor
      ...options,
      onEvent: async (event: any) => {
        // event 是 { type, data, timestamp } 结构
        const eventType = event.type || 'unknown';
        const eventData = event.data || {};
        
        // 推送事件到 agent-studio
        try {
          // 特殊处理：agent.progress -> thinking.stream
          if (eventType === 'agent.progress') {
            const thinkingPayload = {
              type: 'thinking.stream',
              event_type: 'thinking.stream',
              executionId,
              workflow,
              timestamp: event.timestamp || new Date().toISOString(),
              stepId: eventData.stepId,
              stepName: eventData.stepId, // 可以从 stepId 映射
              content: eventData.message,
              progress: eventData.progress,
            };
            
            await fetch(`${studioUrl}/api/v1/executions/events`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(thinkingPayload),
            });
            console.log(`📤 Thinking stream pushed: ${eventData.stepId}`);
          } else {
            // 默认事件格式
            const payload = {
              type: eventType,
              event_type: `runtime.${eventType}`,
              executionId,
              workflow,
              timestamp: event.timestamp || new Date().toISOString(),
              ...eventData,
            };
            
            await fetch(`${studioUrl}/api/v1/executions/events`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            console.log(`📤 Event pushed: ${eventType}`);
          }
        } catch (e) {
          console.error(`Failed to push event:`, e);
        }
      },
    });
    
    res.json({
      executionId,
      status: 'running',
      workflow
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/executions/:id
 * 获取执行详情
 */
app.get('/api/executions/:id', async (req: Request, res: Response) => {
  try {
    const executionId = req.params.id as string;
    const outputsDir = config.workdir;
    const found = findExecutionDir(executionId);

    let execDir: string | null = found?.dir || null;

    if (!execDir) {
      const dirs = fs.readdirSync(outputsDir)
        .filter(d => fs.statSync(path.join(outputsDir, d)).isDirectory());
      const idStr = Array.isArray(executionId) ? executionId[0] : executionId;
      const directDir = dirs.find(d => d.includes(idStr.substring(0, 8)));
      if (directDir) {
        execDir = directDir;
      }
    }
    
    if (!execDir) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    const execPath = path.join(outputsDir, execDir);
    const statePath = path.join(execPath, '.agent-runtime', 'state.json');
    const metaPath = path.join(execPath, '.meta.json');
    
    let state: any = {};
    let meta: any = {};
    
    if (fs.existsSync(statePath)) {
      state = readJsonFile(statePath);
    }
    
    if (fs.existsSync(metaPath)) {
      meta = readJsonFile(metaPath);
    }
    
    // 获取输出文件列表
    const outputFiles: any[] = [];
    
    function scanDir(dir: string, prefix: string = '') {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        if (item.startsWith('.') || item === 'node_modules') continue;
        
        const fullPath = path.join(dir, item);
        const relativePath = prefix ? `${prefix}/${item}` : item;
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDir(fullPath, relativePath);
        } else {
          outputFiles.push({
            path: relativePath,
            size: stat.size,
            modified: stat.mtime,
          });
        }
      }
    }
    
    scanDir(execPath);
    
    res.json({
      id: executionId,
      workflowId: meta.workflow,
      workflowName: meta.workflowName,
      status: state.status,
      inputs: meta.inputs,
      requirement: meta.requirement,
      startedAt: meta.startedAt,
      steps: state.steps || {},
      outputFiles,
      workdir: execPath,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/executions
 * 列出历史执行记录（支持分页）
 */
app.get('/api/executions', async (req: Request, res: Response) => {
  try {
    const outputsDir = config.workdir;
    
    // 分页参数
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    
    if (!fs.existsSync(outputsDir)) {
      return res.json({
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
      });
    }
    
    // 获取所有目录并排序
    const allDirs = fs.readdirSync(outputsDir)
      .filter(d => fs.statSync(path.join(outputsDir, d)).isDirectory())
      .sort((a, b) => b.localeCompare(a)); // 按时间倒序
    
    const total = allDirs.length;
    const totalPages = Math.ceil(total / limit);
    
    // 分页切片
    const dirs = allDirs.slice(offset, offset + limit);
    
    const executions = dirs.map(dir => {
      const statePath = path.join(outputsDir, dir, '.agent-runtime', 'state.json');
      const metaPath = path.join(outputsDir, dir, '.meta.json');
      
      let state: any = null;
      let meta: any = null;
      
      if (fs.existsSync(statePath)) {
        state = readJsonFile(statePath);
      }
      
      if (fs.existsSync(metaPath)) {
        meta = readJsonFile(metaPath);
      }
      
      return {
        id: state?.executionId || dir,
        workflowId: meta?.workflow || dir.split('-')[0],
        workflowName: meta?.workflowName || dir.split('-')[0],
        status: state?.status || 'unknown',
        inputs: meta?.inputs || {},
        requirement: meta?.requirement || '',
        startedAt: meta?.startedAt || new Date().toISOString(),
        steps: state?.steps ? Object.entries(state.steps).map(([id, s]: [string, any]) => ({
          id,
          name: id,
          status: s.status || 'pending',
          error: s.error,
        })) : [],
      };
    }).filter(e => e.status !== 'unknown');
    
    res.json({
      data: executions,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/status/:executionId
 * 查询执行状态
 */
app.get('/api/status/:executionId', async (req: Request, res: Response) => {
  try {
    const executionId = Array.isArray(req.params.executionId) 
      ? req.params.executionId[0] 
      : req.params.executionId;
    const status = getWorkflowStatus(executionId);
    
    if (!status) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/workflows
 * 列出所有工作流
 */
app.get('/api/workflows', async (req: Request, res: Response) => {
  try {
    const workflows = await listWorkflows();
    res.json(workflows);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/workflows/:id
 * 获取工作流详情
 */
app.get('/api/workflows/:id', async (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const workflow = await parseWorkflow(id);
    res.json(workflow);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/steps
 * 列出所有原子步骤
 */
app.get('/api/skills', async (req: Request, res: Response) => {
  try {
    const steps = await listSteps();
    res.json(steps);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/tools
 * 列出所有 Tool
 */
app.get('/api/tools', async (req: Request, res: Response) => {
  try {
    const tools = await listTools();
    res.json(tools);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /health
 * 健康检查
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * GET /metrics
 * Prometheus 指标
 */
app.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/steps/stats
 * 步骤成功率统计
 * 
 * 复用 Prometheus 指标计算成功率
 */
import { getStepSuccessRate, StepSuccessRate } from './monitoring/local-data-source';

app.get('/api/steps/stats', async (req: Request, res: Response) => {
  try {
    const workflowId = req.query.workflow_id as string | undefined;
    const stats = getStepSuccessRate(workflowId);
    
    // 计算汇总
    const summary = {
      totalSteps: stats.length,
      avgSuccessRate: stats.length > 0 
        ? stats.reduce((sum, s) => sum + s.successRate, 0) / stats.length 
        : 0,
      problemSteps: stats.filter(s => s.successRate < 0.9).length,
      topIssues: stats.filter(s => s.successRate < 0.9).slice(0, 5),
    };
    
    res.json({
      success: true,
      data: {
        stats,
        summary,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * 编码工具 - Base64 编码敏感信息用于存储混淆
 * 注意：这不是加密，仅为防止明文泄露。需要真正的加密请使用 CONFIG_ENCRYPTION_KEY
 */
function encodeForStorage(value: string): string {
  const key = process.env.CONFIG_ENCRYPTION_KEY;
  if (!key || !value) return value;

  const buff = Buffer.from(value, 'utf-8');
  return buff.toString('base64');
}

function decodeFromStorage(encoded: string): string {
  const key = process.env.CONFIG_ENCRYPTION_KEY;
  if (!key || !encoded) return encoded;

  const buff = Buffer.from(encoded, 'base64');
  return buff.toString('utf-8');
}

/**
 * GET /api/config
 * 获取当前配置
 */
app.get('/api/config', async (req: Request, res: Response) => {
  try {
    const configPath = path.join(process.cwd(), '.agent-studio', 'config.json');
    
    // 如果配置文件不存在，返回默认值
    if (!fs.existsSync(configPath)) {
      return res.json({
        discordWebhook: process.env.DISCORD_WEBHOOK_URL || '',
        discordEnabled: !!process.env.DISCORD_WEBHOOK_URL,
        agents: {
          codex: { apiKey: '', endpoint: '' },
          claude: { apiKey: '', endpoint: '' },
        },
        llm: {
          openai: { apiKey: '', enabled: false },
          hunyuan: { apiKey: '', enabled: false },
        },
        defaultIntentLLM: 'hunyuan',
      });
    }
    
    // 读取加密配置
    const configData = readJsonFile(configPath);
    
    // 解密敏感信息
    if (configData.agents?.codex?.apiKey) {
      configData.agents.codex.apiKey = decodeFromStorage(configData.agents.codex.apiKey);
    }
    if (configData.agents?.claude?.apiKey) {
      configData.agents.claude.apiKey = decodeFromStorage(configData.agents.claude.apiKey);
    }
    if (configData.llm?.openai?.apiKey) {
      configData.llm.openai.apiKey = decodeFromStorage(configData.llm.openai.apiKey);
    }
    if (configData.llm?.hunyuan?.apiKey) {
      configData.llm.hunyuan.apiKey = decodeFromStorage(configData.llm.hunyuan.apiKey);
    }
    
    res.json(configData);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/config
 * 更新配置（敏感信息加密存储）
 */
app.post('/api/config', async (req: Request, res: Response) => {
  try {
    const { 
      discordWebhook, 
      discordEnabled,
      agents,
      llm,
      defaultIntentLLM,
    } = req.body;
    
    const configDir = path.join(process.cwd(), '.agent-studio');
    const configPath = path.join(configDir, 'config.json');
    
    // 确保目录存在
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // 读取现有配置
    let existingConfig: any = {};
    if (fs.existsSync(configPath)) {
      existingConfig = readJsonFile(configPath);
    }
    
    // 加密敏感信息
    const saveConfig = {
      ...existingConfig,
      discordWebhook: discordWebhook || '',
      discordEnabled: !!discordWebhook,
      agents: agents ? {
        codex: {
          ...agents.codex,
          apiKey: agents.codex.apiKey ? encodeForStorage(agents.codex.apiKey) : '',
        },
        claude: {
          ...agents.claude,
          apiKey: agents.claude.apiKey ? encodeForStorage(agents.claude.apiKey) : '',
        },
      } : existingConfig.agents,
      llm: llm ? {
        openai: {
          ...llm.openai,
          apiKey: llm.openai.apiKey ? encodeForStorage(llm.openai.apiKey) : '',
        },
        hunyuan: {
          ...llm.hunyuan,
          apiKey: llm.hunyuan.apiKey ? encodeForStorage(llm.hunyuan.apiKey) : '',
        },
      } : existingConfig.llm,
      defaultIntentLLM: defaultIntentLLM || existingConfig.defaultIntentLLM || 'hunyuan',
    };
    
    // 写入文件
    fs.writeFileSync(configPath, JSON.stringify(saveConfig, null, 2));
    
    // 更新环境变量
    if (discordWebhook) {
      process.env.DISCORD_WEBHOOK_URL = discordWebhook;
    } else {
      delete process.env.DISCORD_WEBHOOK_URL;
    }
    
    // 返回解密后的配置给前端
    res.json({ 
      success: true, 
      ...saveConfig,
      // 返回已经解密的配置，前端不需要处理解密
      agents: saveConfig.agents ? {
        codex: {
          ...saveConfig.agents.codex,
          apiKey: agents.codex.apiKey, // 已经解密过了
        },
        claude: {
          ...saveConfig.agents.claude,
          apiKey: agents.claude.apiKey,
        },
      } : saveConfig.agents,
      llm: saveConfig.llm ? {
        openai: {
          ...saveConfig.llm.openai,
          apiKey: llm.openai.apiKey,
        },
        hunyuan: {
          ...saveConfig.llm.hunyuan,
          apiKey: llm.hunyuan.apiKey,
        },
      } : saveConfig.llm,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/projects
 * 获取项目列表
 */
app.get('/api/projects', async (req: Request, res: Response) => {
  try {
    const projectsPath = path.join(config.workdir, '.projects.json');
    
    if (!fs.existsSync(projectsPath)) {
      return res.json([]);
    }
    
    const projectsData = readJsonFile(projectsPath);
    res.json(projectsData.projects || []);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/projects
 * 注册新项目
 */
app.post('/api/projects', async (req: Request, res: Response) => {
  try {
    const { name, workflow = 'pipeline', type, description = 'new-project' } = req.body;
    const projectsPath = path.join(config.workdir, '.projects.json');
    
    // 导入 slugify 工具函数
    const { generateProjectName } = await import('./utils/slugify');
    
    // 生成项目名称和路径
    const projectName = generateProjectName(workflow, description || name || 'new-project');
    const projectPath = path.join(config.workdir, projectName);
    
    // 读取现有项目
    let projectsData: any = { projects: [], version: '1.0.0' };
    if (fs.existsSync(projectsPath)) {
      projectsData = readJsonFile(projectsPath);
    }
    
    // 检查项目是否已存在
    const existingIndex = projectsData.projects.findIndex((p: any) => p.path === projectPath);
    if (existingIndex >= 0) {
      // 更新现有项目
      projectsData.projects[existingIndex] = {
        ...projectsData.projects[existingIndex],
        name: projectName,
        type,
        description,
        updatedAt: new Date().toISOString()
      };
    } else {
      // 创建项目目录
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }
      
      // 初始化 Git 仓库
      try {
        execSync('git init', { cwd: projectPath, stdio: 'ignore' });
      } catch (gitError) {
        console.warn('Failed to initialize git repo:', gitError);
      }
      
      // 添加新项目
      projectsData.projects.push({
        id: projectName,
        name: name || projectName,
        path: projectPath,
        type,
        description,
        workflow,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        iterations: 0
      });
    }
    
    // 保存
    fs.writeFileSync(projectsPath, JSON.stringify(projectsData, null, 2));
    
    res.json({ success: true, project: projectsData.projects[existingIndex >= 0 ? existingIndex : projectsData.projects.length - 1] });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/projects/:id
 * 删除项目注册
 */
app.delete('/api/projects/:id', requireNotGuest(), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const projectsPath = path.join(config.workdir, '.projects.json');
    
    if (!fs.existsSync(projectsPath)) {
      return res.status(404).json({ error: 'Projects registry not found' });
    }
    
    const projectsData = readJsonFile(projectsPath);
    projectsData.projects = projectsData.projects.filter((p: any) => p.id !== id);
    
    fs.writeFileSync(projectsPath, JSON.stringify(projectsData, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================================================
// Superpowers 整合 API
// ============================================================================

// 从 @dommaker/harness 导入约束模块
import { 
  constraintChecker, 
  getAllConstraints, 
  getConstraint,
  checkConstraints,
  interceptor,
  interceptOperation,
  claimOperation,
  ConstraintViolationError,
  IRON_LAWS, 
  GUIDELINES,
  TIPS,
  CheckpointValidator 
} from '@dommaker/harness';
import type { IronLawContext, Checkpoint, CheckpointContext, ConstraintTrigger, ConstraintContext } from '@dommaker/harness';
import { csoValidator } from './core/cso-validator';
import './core/enforcement-executors'; // 注册执行器

// 获取约束检查器实例
const checker = constraintChecker;
const checkpointValidator = CheckpointValidator.getInstance();

/**
 * GET /api/v1/iron-laws
 * 获取所有约束（三层）
 */
app.get('/api/v1/iron-laws', async (req: Request, res: Response) => {
  try {
    const constraints = getAllConstraints();
    res.json({ 
      ironLaws: Object.values(IRON_LAWS),
      guidelines: Object.values(GUIDELINES),
      tips: Object.values(TIPS),
      total: constraints.length 
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/v1/iron-laws/:id
 * 获取单个约束
 */
app.get('/api/v1/iron-laws/:id', async (req: Request, res: Response) => {
  try {
    const lawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const constraint = getConstraint(lawId);
    if (!constraint) {
      return res.status(404).json({ error: `Constraint not found: ${lawId}` });
    }
    res.json(constraint);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/v1/iron-laws/check
 * 检查约束（三层）
 */
app.post('/api/v1/iron-laws/check', async (req: Request, res: Response) => {
  try {
    const { operation, ...context }: IronLawContext = req.body;
    
    if (!operation) {
      return res.status(400).json({ error: 'Missing operation field' });
    }
    
    const result = await checkConstraints({ operation, ...context } as any);
    res.json({ 
      passed: result.passed,
      ironLaws: result.ironLaws,
      guidelines: result.guidelines,
      tips: result.tips,
      warningCount: result.warningCount,
      tipCount: result.tipCount
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/v1/iron-laws/intercept
 * 拦截操作（自动执行 enforcement）
 */
app.post('/api/v1/iron-laws/intercept', async (req: Request, res: Response) => {
  try {
    const { operation, ...context }: { operation: ConstraintTrigger } & ConstraintContext = req.body;
    
    if (!operation) {
      return res.status(400).json({ error: 'Missing operation field' });
    }
    
    const result = await interceptOperation(operation, { operation, ...context });
    
    res.json({
      passed: result.passed,
      message: result.message,
      constraints: result.constraints.map(c => ({
        id: c.constraint.id,
        level: c.constraint.level,
        enforcement: c.constraint.enforcement,
        passed: c.enforcementResult?.passed,
        skipped: c.skipped,
        skipReason: c.skipReason,
        evidence: c.enforcementResult?.evidence?.substring(0, 500),
        duration: c.enforcementResult?.duration,
      })),
      violations: result.violations.map(v => ({
        id: v.id,
        message: v.message,
        enforcement: v.enforcement,
      })),
    });
  } catch (error) {
    if (error instanceof ConstraintViolationError) {
      return res.status(403).json({
        error: '铁律违规',
        violation: {
          id: error.result.id,
          message: error.result.message,
          enforcement: error.result.constraint?.enforcement,
        },
      });
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/v1/iron-laws/claim
 * 声明操作（简化版拦截，失败抛异常）
 */
app.post('/api/v1/iron-laws/claim', async (req: Request, res: Response) => {
  try {
    const { operation, ...context }: { operation: ConstraintTrigger } & ConstraintContext = req.body;
    
    if (!operation) {
      return res.status(400).json({ error: 'Missing operation field' });
    }
    
    await claimOperation(operation, { operation, ...context });
    
    res.json({ 
      passed: true,
      message: '✅ 拦截通过，可以执行操作',
    });
  } catch (error) {
    if (error instanceof ConstraintViolationError) {
      return res.status(403).json({
        error: '铁律违规',
        violation: {
          id: error.result.id,
          message: error.result.message,
          enforcement: error.result.constraint?.enforcement,
        },
      });
    }
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/v1/iron-laws/executors/register
 * 注册自定义 enforcement 执行器
 */
app.post('/api/v1/iron-laws/executors/register', async (req: Request, res: Response) => {
  try {
    const { enforcementId, executor, source } = req.body;
    
    if (!enforcementId || !executor) {
      return res.status(400).json({ error: 'Missing enforcementId or executor' });
    }
    
    interceptor.register(enforcementId, executor, source);
    
    res.json({ 
      success: true,
      message: `Executor registered: ${enforcementId}`,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/v1/iron-laws/executors
 * 获取已注册的执行器列表
 */
app.get('/api/v1/iron-laws/executors', async (req: Request, res: Response) => {
  try {
    const registrations = interceptor.getRegistrations();
    res.json({
      executors: registrations.map(r => ({
        id: r.id,
        source: r.source,
        registeredAt: r.registeredAt,
        description: r.executor.description,
        supportedParams: r.executor.supportedParams,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/v1/checkpoints/validate
 * 验证检查点
 */
app.post('/api/v1/checkpoints/validate', async (req: Request, res: Response) => {
  try {
    const { checkpoint, context }: { checkpoint: Checkpoint; context: CheckpointContext } = req.body;
    
    if (!checkpoint || !context) {
      return res.status(400).json({ error: 'Missing checkpoint or context field' });
    }
    
    const result = await checkpointValidator.validate(checkpoint, context);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});



/**
 * POST /api/v1/complexity/analyze
 * 分析需求复杂度
 */
app.post('/api/v1/complexity/analyze', async (req: Request, res: Response) => {
  try {
    const { input, useLLM = false } = req.body;
    
    if (!input) {
      return res.status(400).json({ error: 'Missing input' });
    }
    
    const { analyzeComplexity, analyzeComplexityWithLLM, formatAnalysisResult } = 
      await import('./core/complexity-analyzer');
    
    const result = useLLM 
      ? await analyzeComplexityWithLLM(input)
      : await analyzeComplexity(input);
    
    res.json({
      success: true,
      analysis: result,
      formatted: formatAnalysisResult(result)
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ==================== MCP APIs ====================

/**
 * GET /api/v1/mcp/servers
 * 列出所有 MCP Servers
 */
app.get('/api/v1/mcp/servers', (req: Request, res: Response) => {
  const servers = mcpClientManager.listServers();
  res.json({ servers });
});

/**
 * POST /api/v1/mcp/servers
 * 注册新的 MCP Server
 */
app.post('/api/v1/mcp/servers', async (req: Request, res: Response) => {
  try {
    const { id, name, transport, command, args, env, url, headers } = req.body;
    
    if (!id || !transport) {
      return res.status(400).json({ error: 'Missing required fields: id, transport' });
    }
    
    mcpClientManager.registerServer({ id, name, transport, command, args, env, url, headers });
    res.json({ success: true, message: `MCP Server ${id} registered` });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * DELETE /api/v1/mcp/servers/:id
 * 注销 MCP Server
 */
app.delete('/api/v1/mcp/servers/:id', requireNotGuest(), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    await mcpClientManager.unregisterServer(id);
    res.json({ success: true, message: `MCP Server ${id} unregistered` });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/v1/mcp/tools
 * 列出所有 MCP 工具
 */
app.get('/api/v1/mcp/tools', async (req: Request, res: Response) => {
  try {
    const tools = await mcpClientManager.listAllTools();
    res.json({ tools, count: tools.length });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/v1/mcp/call
 * 调用 MCP 工具
 */
app.post('/api/v1/mcp/call', async (req: Request, res: Response) => {
  try {
    const { serverId, toolName, args } = req.body;
    
    if (!serverId || !toolName) {
      return res.status(400).json({ error: 'Missing required fields: serverId, toolName' });
    }
    
    const result = await mcpClientManager.callTool(serverId, toolName, args || {});
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});



/**
 * POST /api/v1/commands
 * 处理自定义命令（!do, !init, !status）
 */
app.post('/api/v1/commands', async (req: Request, res: Response) => {
  try {
    const { input, context } = req.body;
    
    if (!input) {
      return res.status(400).json({ error: 'Missing input' });
    }
    
    // 检查是否是命令格式
    const parsed = parseCommand(input);
    if (!parsed) {
      return res.status(400).json({ 
        error: 'Invalid command format',
        hint: 'Commands must start with ! (e.g., !do, !init, !status)'
      });
    }
    
    const result = await handleCommand(input, context || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/v1/spec/review
 * 创建 Spec 审查工作流
 */
app.post('/api/v1/spec/review', async (req: Request, res: Response) => {
  try {
    const { changes } = req.body as { changes: SpecChange[] };
    
    if (!changes || !Array.isArray(changes)) {
      return res.status(400).json({ error: 'Missing or invalid changes array' });
    }
    
    const workflow = createReviewWorkflow(changes);
    res.json(workflow);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/v1/spec/reviews
 * 获取审查列表（支持按 workflowId 过滤）
 */
app.get('/api/v1/spec/reviews', async (req: Request, res: Response) => {
  try {
    const { workflowId } = req.query;
    
    // TODO: 从持久化存储中获取
    // 目前返回空列表
    const reviews: any[] = [];
    
    res.json({ reviews, total: reviews.length });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/v1/spec/review/:id/approve
 * 提交审查意见
 */
app.post('/api/v1/spec/review/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role, reviewer, approved, comment } = req.body;
    
    if (!role || !['architect', 'projectLead'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be "architect" or "projectLead"' });
    }
    
    if (!reviewer || typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'Missing reviewer or approved field' });
    }
    
    // 注意：这里需要从持久化存储中获取 workflow
    // 目前使用示例 workflow
    const workflow: ReviewWorkflow = req.body.workflow || {
      id,
      changes: [],
      result: { required: true, changes: [], approvals: { architect: false, projectLead: false }, status: 'pending' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const updated = submitReview(workflow, role, reviewer, approved, comment);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/v1/spec/analyze
 * 分析变更是否需要审查
 */
app.post('/api/v1/spec/analyze', async (req: Request, res: Response) => {
  try {
    const { changes } = req.body as { changes: SpecChange[] };
    
    if (!changes || !Array.isArray(changes)) {
      return res.status(400).json({ error: 'Missing or invalid changes array' });
    }
    
    const result = analyzeChanges(changes);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/v1/spec/detect
 * 检测变更类型和影响
 */
app.post('/api/v1/spec/detect', async (req: Request, res: Response) => {
  try {
    const { file, diff } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: 'Missing file path' });
    }
    
    const type = detectChangeType(file, diff || '');
    const impact = assessImpact(diff || '');
    
    res.json({ file, type, impact });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/v1/capabilities
 * 获取所有能力（workflows, steps, tools）
 */
app.get('/api/v1/capabilities', async (req: Request, res: Response) => {
  try {
    const [workflows, steps, tools] = await Promise.all([
      listWorkflows(),
      listSteps(),
      listTools(),
    ]);
    
    res.json({
      workflows,
      steps,
      tools,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});



/**
 * GET /api/v1/cso/validate
 * 验证所有技能的 CSO 格式
 */
app.get('/api/v1/cso/validate', async (req: Request, res: Response) => {
  try {
    const [workflows, steps, tools] = await Promise.all([
      listWorkflows(),
      listSteps(),
      listTools(),
    ]);
    
    const result = await csoValidator.validateAll(workflows, steps, tools);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/v1/files
 * 列出目录文件
 */
app.get('/api/v1/files', async (req: Request, res: Response) => {
  try {
    const dirPath = req.query.path as string;
    
    if (!dirPath) {
      return res.status(400).json({ error: '缺少 path 参数' });
    }
    
    // 安全检查：防止路径遍历攻击
    const normalizedPath = path.normalize(dirPath);
    if (normalizedPath.includes('..')) {
      return res.status(400).json({ error: '无效路径' });
    }
    
    // 检查目录是否存在
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: '目录不存在' });
    }
    
    // 检查是否是目录
    const stats = fs.statSync(normalizedPath);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: '路径不是目录' });
    }
    
    // 读取目录内容
    const items = fs.readdirSync(normalizedPath);
    const files = items.map(name => {
      const fullPath = path.join(normalizedPath, name);
      try {
        const itemStats = fs.statSync(fullPath);
        return {
          name,
          path: fullPath,
          type: itemStats.isDirectory() ? 'directory' : 'file',
          size: itemStats.size,
          modifiedAt: itemStats.mtime.toISOString(),
          extension: itemStats.isFile() ? path.extname(name).slice(1) : undefined,
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
    
    // 排序：目录优先，然后按名称
    files.sort((a: any, b: any) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    
    res.json({ files, path: normalizedPath });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/v1/files/content
 * 获取文件内容
 */
app.get('/api/v1/files/content', async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    
    if (!filePath) {
      return res.status(400).json({ error: '缺少 path 参数' });
    }
    
    // 安全检查
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..')) {
      return res.status(400).json({ error: '无效路径' });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(normalizedPath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    
    // 检查是否是文件
    const stats = fs.statSync(normalizedPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: '路径不是文件' });
    }
    
    // 检查文件大小（限制 1MB）
    if (stats.size > 1024 * 1024) {
      return res.status(400).json({ error: '文件过大（最大 1MB）' });
    }
    
    // 读取文件内容
    const content = fs.readFileSync(normalizedPath, 'utf-8');
    
    res.json({ 
      content, 
      path: normalizedPath,
      size: stats.size,
      mimeType: getMimeType(path.extname(normalizedPath)),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// MIME 类型映射
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.ts': 'application/typescript',
    '.tsx': 'application/typescript',
    '.jsx': 'application/javascript',
    '.py': 'text/x-python',
    '.html': 'text/html',
    '.css': 'text/css',
    '.yml': 'application/x-yaml',
    '.yaml': 'application/x-yaml',
    '.txt': 'text/plain',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
  };
  return mimeTypes[ext.toLowerCase()] || 'text/plain';
}

// 错误处理中间件
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message });
});

// 404 处理
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// 异步执行工作流
async function executeWorkflowAsync(
  workflowId: string,
  inputs: Record<string, any>,
  options: any
): Promise<string> {
  // 如果 options 中有 executionId，使用它；否则生成新的
  const executionId = options.executionId || uuidv4();
  
  const result = await executeWorkflow(workflowId, inputs, {
    ...options,
    executionId,  // 传递给 executor
  });
  
  return result.executionId || executionId;
}

/**
 * 启动 HTTP Server
 */
export function startServer(port: number = 13202): void {
  // 加载 MCP Servers
  const mcpConfigPath = path.join(process.env.HOME || '/root', '.openclaw/mcp-servers.yml');
  loadMCPServers(mcpConfigPath).catch(err => {
    console.log('[MCP] No MCP servers configured or config not found');
  });

  app.listen(port, () => {
    console.log(`agent-runtime API server running on port ${port}`);
    console.log(`http://localhost:${port}/health`);
  });
}

export { app };
