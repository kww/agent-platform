/**
 * 自定义命令处理
 * 
 * 支持的命令：
 * - !do <需求描述> - 智能执行（直接调用 Workflow）
 * - !init <workflow-id> - 初始化 Workflow（收集必要信息）
 * - !status [execution-id] - 查看执行状态
 * - !list-workflows - 列出所有 Workflow
 */

import { getWorkflow, getStep } from './registry';

export interface CommandResult {
  success: boolean;
  message: string;
  data?: any;
  action?: 'workflow' | 'init' | 'status';
  target?: string;
}

/**
 * 解析命令
 */
export function parseCommand(input: string): { command: string; args: string } | null {
  const trimmed = input.trim();
  
  // 匹配 !command 格式
  const match = trimmed.match(/^!(\w+)\s*(.*)/);
  if (!match) {
    return null;
  }
  
  return {
    command: match[1].toLowerCase(),
    args: match[2].trim()
  };
}

/**
 * 处理命令
 */
export async function handleCommand(
  input: string,
  context: {
    workdir?: string;
    projectDir?: string;
  } = {}
): Promise<CommandResult> {
  const parsed = parseCommand(input);
  
  if (!parsed) {
    return {
      success: false,
      message: '无效命令格式。使用 !command <args>',
    };
  }
  
  const { command, args } = parsed;
  
  switch (command) {
    case 'do':
      return handleDoCommand(args, context);
    
    case 'init':
      return handleInitCommand(args);
    
    case 'status':
      return handleStatusCommand(args);
    
    case 'list-workflows':
      return handleListWorkflowsCommand();
    
    default:
      return {
        success: false,
        message: `未知命令: !${command}。支持: !do, !init, !status, !list-workflows`,
      };
  }
}

// ============================================
// 命令处理函数
// ============================================

/**
 * !do 命令 - 智能执行
 */
async function handleDoCommand(
  args: string,
  context: { workdir?: string; projectDir?: string }
): Promise<CommandResult> {
  if (!args) {
    return {
      success: false,
      message: '请提供需求描述。用法: !do <需求>',
    };
  }
  
  // 直接返回 workflow 选择建议
  return {
    success: true,
    message: `需求: ${args}\n建议使用 wf-dev 或 wf-planning`,
    action: 'workflow',
    target: 'wf-dev',
  };
}

/**
 * !init 命令 - 初始化 Workflow
 */
async function handleInitCommand(args: string): Promise<CommandResult> {
  if (!args) {
    return {
      success: false,
      message: '请提供 Workflow ID。用法: !init <workflow-id>',
    };
  }
  
  const workflowId = args.trim();
  const workflow = await getWorkflow(workflowId);
  
  if (!workflow) {
    return {
      success: false,
      message: `Workflow ${workflowId} 不存在`,
    };
  }
  
  return {
    success: true,
    message: `Workflow: ${workflow.name || workflowId}\n描述: ${workflow.description || '无'}`,
    action: 'init',
    target: workflowId,
    data: workflow,
  };
}

/**
 * !status 命令 - 查看执行状态
 */
async function handleStatusCommand(args: string): Promise<CommandResult> {
  const executionId = args.trim();
  
  if (!executionId) {
    return {
      success: true,
      message: '请提供 execution ID 查看状态',
      action: 'status',
    };
  }
  
  return {
    success: true,
    message: `执行状态查询: ${executionId}\n请使用 API 查询详细状态`,
    action: 'status',
    target: executionId,
  };
}

/**
 * !list-workflows 命令 - 列出所有 Workflow
 */
async function handleListWorkflowsCommand(): Promise<CommandResult> {
  const { listWorkflows } = await import('./registry');
  const workflows = await listWorkflows();
  
  const lines: string[] = ['可用 Workflow:'];
  for (const wf of workflows) {
    lines.push(`  - ${wf.id}: ${wf.name || wf.id}`);
  }
  
  return {
    success: true,
    message: lines.join('\n'),
    data: { workflows },
  };
}