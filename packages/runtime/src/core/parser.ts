/**
 * YAML 解析器
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { config } from '../utils/config';
import { Workflow, Tool, Registry } from './types';

/**
 * 解析 Workflow YAML
 */
export function parseWorkflow(workflowId: string): Workflow {
  const filePath = path.join(config.workflowsPath, 'workflows', `${workflowId}.yml`);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = yaml.load(content);
  
  // 验证必需字段
  if (!data.id) data.id = workflowId;
  if (!data.name) data.name = workflowId;
  
  // 🆕 AW-035: 支持简单工作流（有 execute/prompt 但没有 steps）
  // 如果有 execute 或 prompt，但没有 steps/phases，自动创建一个步骤
  if (!data.steps && !data.phases) {
    if (data.execute || data.prompt) {
      data.steps = [{
        id: data.id || 'main',
        name: data.name || 'Main Step',
        execute: data.execute,
        prompt: data.prompt,
        input: data.inputs,
        output: data.outputs,
        agent: data.agent,
        temperature: data.temperature,
      }];
    } else {
      throw new Error(`Workflow ${workflowId} must have 'steps', 'phases', 'execute', or 'prompt' field`);
    }
  }
  
  // 如果使用 phases，展开为 steps（保持向后兼容）
  if (data.phases && !data.steps) {
    data.steps = flattenPhases(data.phases);
  }
  
  // 确保 steps 存在
  if (!data.steps) {
    data.steps = [];
  }
  
  return data as Workflow;
}

/**
 * 将 phases 展开为扁平 steps
 */
function flattenPhases(phases: any[]): any[] {
  const steps: any[] = [];
  
  for (const phase of phases) {
    // 阶段内的串行步骤
    if (phase.steps) {
      for (const step of phase.steps) {
        // 添加阶段标记
        step.phaseId = phase.id;
        step.phaseName = phase.name;
        steps.push(step);
      }
    }
    
    // 阶段内的并行步骤
    if (phase.parallel) {
      steps.push({
        id: `phase-${phase.id}-parallel`,
        phaseId: phase.id,
        phaseName: phase.name,
        parallel: phase.parallel
      });
    }
  }
  
  return steps;
}

/**
 * 解析 Tool YAML
 */
export function parseTool(name: string): Tool {
  // 支持两种格式：
  // 1. git/worktree → 在 tools/git/ 目录下查找
  // 2. git-worktree → 在所有目录下搜索 name 字段
  
  // 如果包含 /，则直接定位到对应目录
  if (name.includes('/')) {
    const [category, fileName] = name.split('/');
    
    // 尝试多个可能的路径
    const possiblePaths = [
      // 1. 直接路径: tools/category/file.yml
      path.join(config.workflowsPath, 'tools', category, `${fileName}.yml`),
      // 2. std 子目录: tools/std/category/file.yml
      path.join(config.workflowsPath, 'tools', 'std', category, `${fileName}.yml`),
      // 3. workflows 子目录: workflows/category/file.yml（步骤文件）
      path.join(config.workflowsPath, 'workflows', category, `${fileName}.yml`),
      // 4. workflows/steps 子目录: workflows/steps/category/file.yml
      path.join(config.workflowsPath, 'workflows', 'steps', category, `${fileName}.yml`),
    ];
    
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return yaml.load(content) as Tool;
      }
    }
    
    // 尝试 name 字段匹配（遍历所有可能的目录）
    for (const dirPath of possiblePaths.map(p => path.dirname(p))) {
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.yml'));
        for (const file of files) {
          const fileContent = fs.readFileSync(path.join(dirPath, file), 'utf-8');
          const tool = yaml.load(fileContent) as Tool;
          if (tool.name === name || tool.name === name.replace('/', '-') || (tool as any).id === name) {
            return tool;
          }
        }
      }
    }
    
    throw new Error(`Tool not found: ${name} (searched: ${possiblePaths.join(', ')})`);
  }
  
  // 不包含 /，在所有目录下搜索
  const categories = ['git', 'spawn', 'npm', 'docker', 'browser', 'file', 'verification', 'notification', 'governance'];
  
  for (const category of categories) {
    const toolsDir = path.join(config.workflowsPath, 'tools', category);
    if (!fs.existsSync(toolsDir)) continue;
    
    const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.yml'));
    for (const file of files) {
      const filePath = path.join(toolsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const tool = yaml.load(content) as Tool;
      
      // 匹配 name 字段
      if (tool.name === name) {
        return tool;
      }
    }
  }
  
  throw new Error(`Tool not found: ${name}`);
}

/**
 * 验证 Workflow
 */
export function validateWorkflow(workflowId: string): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];
  
  try {
    const workflow = parseWorkflow(workflowId);
    
    // 检查必需字段
    if (!workflow.id) errors.push('Missing id');
    if (!workflow.name) errors.push('Missing name');
    
    // 新架构：支持 steps 或 phases
    const hasSteps = workflow.steps && workflow.steps.length > 0;
    const hasPhases = workflow.phases && workflow.phases.length > 0;
    
    if (!hasSteps && !hasPhases) {
      errors.push('Missing or empty steps/phases');
    }
    
    // 检查步骤引用（steps 字段）
    if (workflow.steps) {
      for (const step of workflow.steps) {
        if (step.parallel) {
          for (const subStep of step.parallel) {
            validateStepReference(subStep, errors);
          }
        } else {
          validateStepReference(step, errors);
        }
      }
    }
    
    // 检查 phases 字段
    if (workflow.phases) {
      for (const phase of workflow.phases) {
        if (phase.steps) {
          for (const step of phase.steps) {
            if (step.parallel) {
              for (const subStep of step.parallel) {
                validateStepReference(subStep, errors);
              }
            } else {
              validateStepReference(step, errors);
            }
          }
        }
      }
    }
    
  } catch (error) {
    errors.push((error as Error).message);
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}

function validateStepReference(step: any, errors: string[]): void {
  if (!step.id) {
    errors.push(`Step missing id`);
    return;
  }
  
  if (step.tool) {
    try {
      parseTool(step.tool);
    } catch {
      errors.push(`Step ${step.id}: Tool not found: ${step.tool}`);
    }
  }
}

/**
 * 验证 Tool
 */
export function validateTool(name: string): { valid: boolean; errors?: string[] } {
  const errors: string[] = [];
  
  try {
    const tool = parseTool(name);
    if (!tool.name) errors.push('Missing name');
  } catch (error) {
    errors.push((error as Error).message);
  }
  
  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  };
}
