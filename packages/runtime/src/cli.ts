#!/usr/bin/env node

/**
 * agent-runtime CLI
 * 
 * 参数格式支持：
 * 1. JSON: --input '{"project": "/path"}'
 * 2. key=value: --input project=/path --input requirement="实现登录"
 * 3. 简写参数: --project /path --requirement "实现登录"
 * 4. 环境变量: PROJECT=/path REQUIREMENT="..." agent-runtime run wf-dev
 */

// 静默 dotenvx 输出（在导入任何模块之前）
const originalLog = console.log;
const originalError = console.error;
if (process.env.QUIET_DOTENV !== 'false') {
  console.log = (...args: any[]) => {
    // 过滤 dotenvx 提示信息
    const msg = args.join(' ');
    if (msg.includes('[dotenv@') || msg.includes('tip:')) return;
    originalLog.apply(console, args);
  };
  console.error = (...args: any[]) => {
    const msg = args.join(' ');
    if (msg.includes('[dotenv@') || msg.includes('tip:')) return;
    originalError.apply(console, args);
  };
}

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { 
  executeWorkflow, 
  listWorkflows, 
  listTools,
  listSteps,
  validateWorkflow,
  getWorkflowStatus 
} from './index';

// 从 package.json 读取版本号
import { readFileSync } from 'fs';
import { join } from 'path';
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('agent-runtime')
  .description('AI Agent 工作流执行引擎')
  .version(packageJson.version);

// ============================================
// 参数解析函数
// ============================================

/**
 * 解析输入参数（支持多种格式）
 */
function parseInputs(options: any): Record<string, any> {
  const inputs: Record<string, any> = {};
  
  // 1. 从环境变量读取
  const envMappings: Record<string, string> = {
    'PROJECT': 'project_path',
    'PROJECT_PATH': 'project_path',
    'REQUIREMENT': 'requirement',
    'FEATURE_ID': 'feature_id',
    'TASK': 'task',
    'TARGET': 'target',
    'TYPE': 'type',
  };
  
  for (const [envKey, inputKey] of Object.entries(envMappings)) {
    if (process.env[envKey]) {
      inputs[inputKey] = process.env[envKey];
    }
  }
  
  // 2. 从 --input 参数解析
  if (options.input) {
    const inputArray = Array.isArray(options.input) ? options.input : [options.input];
    
    for (const inputStr of inputArray) {
      try {
        // 尝试 JSON 解析
        const parsed = JSON.parse(inputStr);
        Object.assign(inputs, parsed);
      } catch (e) {
        // 不是 JSON，尝试 key=value 格式
        if (inputStr.includes('=')) {
          const [key, ...valueParts] = inputStr.split('=');
          const value = valueParts.join('=').trim();
          // 去掉引号
          inputs[key.trim()] = value.replace(/^["']|["']$/g, '');
        } else {
          // 作为 requirement 字段
          inputs.requirement = inputStr;
        }
      }
    }
  }
  
  // 3. 从简写参数读取
  const shorthandMappings: Record<string, string> = {
    'project': 'project_path',
    'p': 'project_path',
    'requirement': 'requirement',
    'r': 'requirement',
    'feature': 'feature_id',
    'f': 'feature_id',
    'task': 'task',
    'target': 'target',
    'type': 'type',
  };
  
  for (const [optionKey, inputKey] of Object.entries(shorthandMappings)) {
    if (options[optionKey]) {
      inputs[inputKey] = options[optionKey];
    }
  }
  
  // 4. workdir 映射到 project_path
  if (options.workdir && !inputs.project_path) {
    inputs.project_path = options.workdir;
  }
  
  return inputs;
}

// ============================================
// list 命令
// ============================================

program
  .command('list [type]')
  .description('列出能力（workflows / tools / steps）')
  .action(async (type?: 'workflows' | 'tools' | 'steps') => {
    const spinner = ora('加载中...').start();
    
    try {
      if (type === 'workflows' || !type) {
        const workflows = await listWorkflows();
        spinner.succeed(`Workflows (${workflows.length})`);
        workflows.forEach(w => {
          console.log(`  ${chalk.cyan(w.id)} - ${w.name || w.description || ''}`);
        });
        if (type === 'workflows') return;
      }
      
      if (type === 'tools' || !type) {
        spinner.stop();
        const tools = await listTools();
        console.log(`\nTools (${tools.length})`);
        tools.forEach(t => {
          console.log(`  ${chalk.yellow(t.id || t.name)} - ${t.description || ''}`);
        });
        if (type === 'tools') return;
      }
      
      if (type === 'steps' || !type) {
        spinner.stop();
        const steps = await listSteps();
        console.log(`\nSteps (${steps.length})`);
        // 按类别分组
        const grouped = steps.reduce((acc, step) => {
          const cat = step.category || 'other';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(step);
          return acc;
        }, {} as Record<string, typeof steps>);
        
        for (const [cat, catSteps] of Object.entries(grouped)) {
          console.log(`\n${chalk.magenta(cat.toUpperCase())}`);
          catSteps.slice(0, 10).forEach(s => {
            console.log(`  ${chalk.cyan(s.name)} - ${s.description || ''}`);
          });
          if (catSteps.length > 10) {
            console.log(`  ... 还有 ${catSteps.length - 10} 个`);
          }
        }
      }
    } catch (error) {
      spinner.fail('加载失败');
      console.error(error);
      process.exit(1);
    }
  });

// ============================================
// run 命令（增强版）
// ============================================

program
  .command('run <workflow>')
  .description('执行工作流')
  // 输入参数（多种格式）
  .option('-i, --input <input>', '输入参数（JSON / key=value / 简单字符串）', collectInputs, [])
  // 简写参数
  .option('-p, --project <path>', '项目路径（映射到 project_path）')
  .option('-r, --requirement <text>', '需求描述')
  .option('-f, --feature <id>', 'Feature ID（backlog 模式）')
  .option('--task <task>', '任务')
  .option('--target <target>', '目标')
  .option('--type <type>', '类型')
  // 执行选项
  .option('-w, --workdir <dir>', '工作目录')
  .option('-t, --timeout <ms>', '超时时间（毫秒）', parseInt)
  .option('--resume', '从断点恢复执行')
  .option('--force', '强制重新执行（忽略缓存和状态）')
  .option('--dry-run', '只解析参数，不执行（用于调试）')
  .action(async (workflowId: string, options) => {
    // 解析参数
    const inputs = parseInputs(options);
    
    // dry-run 模式：只显示解析结果
    if (options.dryRun) {
      console.log('\n解析结果:');
      console.log(`  Workflow: ${chalk.cyan(workflowId)}`);
      console.log(`  Inputs:`);
      Object.entries(inputs).forEach(([key, value]) => {
        console.log(`    ${key}: ${value}`);
      });
      console.log(`  Options:`);
      console.log(`    workdir: ${options.workdir || '(default)'}`);
      console.log(`    timeout: ${options.timeout || '(default)'}`);
      console.log(`    resume: ${options.resume || false}`);
      console.log(`    force: ${options.force || false}`);
      return;
    }
    
    const spinner = ora(`执行 ${workflowId}...`).start();
    
    // 显示恢复信息
    if (options.resume) {
      spinner.text = '检查恢复状态...';
    }
    
    try {
      const result = await executeWorkflow(workflowId, inputs, {
        workdir: options.workdir,
        timeout: options.timeout,
        resume: options.resume,
        force: options.force,
        onEvent: (event: any) => {
          if (event.type === 'workflow.resumed') {
            spinner.info(`从断点恢复: 已完成 ${event.data?.completedSteps?.length} 个步骤`);
            spinner.start(`执行 ${workflowId}...`);
          } else if (event.type === 'step.started') {
            spinner.text = `执行步骤: ${event.data?.stepId}`;
          } else if (event.type === 'step.completed') {
            spinner.text = `完成步骤: ${event.data?.stepId}`;
          } else if (event.type === 'step.skipped') {
            spinner.text = `跳过步骤: ${event.data?.stepId} (已完成)`;
          }
        }
      });
      
      spinner.succeed(`执行完成: ${result.executionId}`);
      
      console.log('\n输出:');
      if (Object.keys(result.outputs).length === 0) {
        console.log('  (无输出)');
      } else {
        Object.entries(result.outputs).forEach(([key, value]) => {
          if (typeof value === 'object') {
            console.log(`  ${chalk.cyan(key)}:`);
            console.log(JSON.stringify(value, null, 2).split('\n').map(l => `    ${l}`).join('\n'));
          } else {
            console.log(`  ${chalk.cyan(key)}: ${value}`);
          }
        });
      }
      
      // 显示统计
      if (result.duration) {
        console.log(`\n耗时: ${(result.duration / 1000).toFixed(1)}s`);
      }
      
      // 显示 Token 使用
      if (result.tokenUsage) {
        const tu = result.tokenUsage;
        console.log(`\n📊 Token 使用:`);
        console.log(`  模型: ${tu.model}`);
        console.log(`  已用: ${tu.used.toLocaleString()} / ${tu.limit.toLocaleString()} (${tu.percentage}%)`);
        console.log(`  步骤: ${tu.stepCount} 个，平均 ${tu.avgPerStep.toLocaleString()} tokens/步`);
      }
    } catch (error) {
      spinner.fail('执行失败');
      console.error(error);
      process.exit(1);
    }
  });

// 收集多个 --input 参数
function collectInputs(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

// ============================================
// status 命令
// ============================================

program
  .command('status <executionId>')
  .description('查询执行状态')
  .action(async (executionId: string) => {
    try {
      const status = await getWorkflowStatus(executionId);
      console.log(JSON.stringify(status, null, 2));
    } catch (error) {
      console.error('查询失败:', error);
      process.exit(1);
    }
  });

// ============================================
// validate 命令
// ============================================

program
  .command('validate <workflow>')
  .description('验证工作流定义')
  .action(async (workflowId: string) => {
    const spinner = ora(`验证 ${workflowId}...`).start();
    
    try {
      const result = await validateWorkflow(workflowId);
      if (result.valid) {
        spinner.succeed('验证通过');
      } else {
        spinner.fail('验证失败');
        result.errors?.forEach(err => {
          console.log(`  ${chalk.red('✗')} ${err}`);
        });
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('验证失败');
      console.error(error);
      process.exit(1);
    }
  });

// ============================================
// step 命令
// ============================================

program
  .command('step <step-name>')
  .description('执行单个原子步骤')
  .option('-i, --input <json>', '输入参数（JSON 格式）')
  .option('-p, --project <path>', '项目路径')
  .option('-w, --workdir <dir>', '工作目录')
  .action(async (stepName: string, options) => {
    const spinner = ora(`执行步骤 ${stepName}...`).start();
    
    try {
      const inputs = parseInputs(options);
      
      // 创建临时工作流执行单个步骤
      const result = await executeWorkflow(`step:${stepName}`, inputs, {
        workdir: options.workdir,
        onEvent: (event: any) => {
          if (event.type === 'step.started') {
            spinner.text = `执行中...`;
          }
        }
      });
      
      spinner.succeed(`步骤完成`);
      
      if (result.outputs) {
        console.log('\n输出:');
        Object.entries(result.outputs).forEach(([key, value]) => {
          if (typeof value === 'object') {
            console.log(`  ${chalk.cyan(key)}:`, JSON.stringify(value, null, 2));
          } else {
            console.log(`  ${chalk.cyan(key)}: ${value}`);
          }
        });
      }
    } catch (error) {
      spinner.fail('执行失败');
      console.error(error);
      process.exit(1);
    }
  });

// ============================================
// list-steps 命令
// ============================================

program
  .command('list-steps [category]')
  .description('列出所有原子步骤')
  .action(async (category?: string) => {
    const spinner = ora('加载步骤...').start();
    
    try {
      const steps = await listSteps();
      spinner.succeed(`原子步骤 (${steps.length})`);
      
      // 按类别分组
      const grouped = steps.reduce((acc, step) => {
        const cat = step.category || 'other';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(step);
        return acc;
      }, {} as Record<string, typeof steps>);
      
      for (const [cat, catSteps] of Object.entries(grouped)) {
        if (category && cat !== category) continue;
        console.log(`\n${chalk.magenta(cat.toUpperCase())} (${catSteps.length})`);
        catSteps.forEach(s => {
          console.log(`  ${chalk.cyan(s.name)} - ${s.description || ''}`);
        });
      }
    } catch (error) {
      spinner.fail('加载失败');
      console.error(error);
      process.exit(1);
    }
  });

// ============================================
// server 命令
// ============================================

program
  .command('server')
  .description('启动 HTTP API Server')
  .option('-p, --port <port>', '端口', parseInt)
  .action(async (options) => {
    const { startServer } = await import('./server');
    const port = options.port || 3001;
    console.log(chalk.cyan(`启动 HTTP API Server: http://localhost:${port}`));
    startServer(port);
  });

// ============================================
// help 命令（增强）
// ============================================

program
  .command('help [command]')
  .description('显示帮助信息')
  .action((command?: string) => {
    if (command) {
      // 显示特定命令的帮助
      const cmd = program.commands.find(c => c.name() === command);
      if (cmd) {
        cmd.help();
      } else {
        console.log(`未知命令: ${command}`);
        program.help();
      }
    } else {
      program.help();
    }
  });

program.parse();

// ============================================
// 使用示例（显示在帮助信息中）
// ============================================

/**
 * 使用示例：
 * 
 * # 列出工作流
 * agent-runtime list workflows
 *
 * # 执行工作流（JSON 参数）
 * agent-runtime run wf-dev --input '{"project_path": "~/myapp"}'
 *
 * # 执行工作流（key=value 参数）
 * agent-runtime run wf-dev --input project_path=~/myapp --input requirement="实现登录"
 *
 * # 执行工作流（简写参数）
 * agent-runtime run wf-dev --project ~/myapp --requirement "实现登录"
 *
 * # 执行工作流（环境变量）
 * PROJECT=~/myapp REQUIREMENT="实现登录" agent-runtime run wf-dev
 *
 * # 执行工作流（backlog 模式）
 * agent-runtime run wf-dev --project ~/myapp --feature FE-001
 *
 * # 调试参数解析（不执行）
 * agent-runtime run wf-dev --project ~/myapp --dry-run
 *
 * # 查询执行状态
 * agent-runtime status exec-xxx
 *
 * # 启动 HTTP API
 * agent-runtime server --port 3001
 */