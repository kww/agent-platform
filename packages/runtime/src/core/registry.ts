/**
 * 能力注册表
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { config } from '../utils/config';
import { WorkflowMeta, ToolMeta, StepDefinition } from './types';

// ============================================
// Workflows
// ============================================

/**
 * 扫描所有 Workflows
 */
export async function listWorkflows(): Promise<WorkflowMeta[]> {
  const workflowsDir = path.join(config.workflowsPath, 'workflows');
  
  if (!fs.existsSync(workflowsDir)) {
    return [];
  }
  
  const files = fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml'));
  
  return files.map(file => {
    const content = fs.readFileSync(path.join(workflowsDir, file), 'utf-8');
    const data = yaml.load(content);
    const workflowName = data.name || file.replace('.yml', '');
    
    // 支持 steps、phases、sub_workflows 三种字段
    let stepIds: string[] = [];
    if (data.steps) {
      stepIds = data.steps.map((s: any) => typeof s === 'string' ? s : (s.id || s.pipeline || s.step || ''));
    } else if (data.phases) {
      stepIds = data.phases.flatMap((phase: any) => {
        if (phase.steps) {
          return phase.steps.map((s: any) => typeof s === 'string' ? s : (s.id || s.pipeline || s.step || ''));
        }
        return phase.id || '';
      }).filter(Boolean);
    } else if (data.sub_workflows) {
      // sub_workflows 模式：每个子工作流算一个步骤
      stepIds = data.sub_workflows.map((sw: any) => sw.id || sw.workflow || '');
    }
    
    return {
      id: data.id || workflowName.toLowerCase().replace(/\s+/g, '-'),
      name: workflowName,
      description: data.description || '',
      category: data.category || 'general',
      type: 'workflow' as const,
      stage: data.stage,  // 新增：Stage 分类
      stepIds,
      openclaw: data.openclaw,
      path: file
    };
  });
}

/**
 * 扫描所有 Tools
 * 支持两级目录结构: tools/{core,std,ext}/{category}/*.yml
 */
export async function listTools(): Promise<ToolMeta[]> {
  const toolsDir = path.join(config.workflowsPath, 'tools');
  
  if (!fs.existsSync(toolsDir)) {
    return [];
  }
  
  const tools: ToolMeta[] = [];
  const tierDirs = fs.readdirSync(toolsDir).filter(d => d !== 'README.md');
  
  for (const tier of tierDirs) {
    const tierPath = path.join(toolsDir, tier);
    if (!fs.statSync(tierPath).isDirectory()) continue;
    
    const categories = fs.readdirSync(tierPath);
    
    for (const category of categories) {
      const categoryPath = path.join(tierPath, category);
      if (!fs.statSync(categoryPath).isDirectory()) continue;
      
      const files = fs.readdirSync(categoryPath)
        .filter(f => f.endsWith('.yml'));
      
      for (const file of files) {
        const filePath = path.join(categoryPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = yaml.load(content);
        const toolId = data.id || file.replace('.yml', '');
        
        tools.push({
          id: toolId,
          name: data.name || toolId,
          description: data.description || '',
          category: `${tier}/${category}`,
          type: 'tool',
          path: path.join(tier, category, file)
        });
      }
    }
  }
  
  return tools;
}

/**
 * 获取 Workflow
 */
export function getWorkflow(workflowId: string): WorkflowMeta | null {
  const workflows = listWorkflowsSync();
  return workflows.find(w => w.id === workflowId) || null;
}

/**
 * 获取 Tool
 */
export function getTool(name: string): ToolMeta | null {
  const tools = listToolsSync();
  return tools.find(t => t.name === name) || null;
}

/**
 * 列出所有 Steps（从 workflows/tools/std 目录）
 */
export async function listSteps(): Promise<StepDefinition[]> {
  return listStepsSync();
}

/**
 * 同步列出 Steps
 */
export function listStepsSync(): StepDefinition[] {
  const stepsDir = config.skillsPath;
  
  if (!fs.existsSync(stepsDir)) {
    return [];
  }
  
  const steps: StepDefinition[] = [];
  const categories = fs.readdirSync(stepsDir);
  
  for (const category of categories) {
    const categoryPath = path.join(stepsDir, category);
    if (fs.statSync(categoryPath).isDirectory()) {
      const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.yml'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(categoryPath, file), 'utf-8');
        const data = yaml.load(content);
        const stepName = data.name || file.replace('.yml', '');
        
        steps.push({
          id: data.id || stepName.toLowerCase().replace(/\s+/g, '-'),
          name: stepName,
          description: data.description || '',
          category: data.category || category,
          type: 'skill',
          agent: data.agent || 'codex',
          temperature: data.temperature,
          tools: data.tools || [],
          prompt: data.prompt || '',
          inputs: data.inputs,
          outputs: data.outputs,
          path: path.join(category, file)
        });
      }
    }
  }
  
  return steps;
}

/**
 * 获取 Step 定义
 * 支持两种格式：
 * 1. "category/name" - 直接定位到 category 目录下的 name.yml
 * 2. "name" - 在所有目录下搜索 name 字段
 */
export function getStep(name: string): StepDefinition | null {
  const stepsDir = config.skillsPath;
  const workflowsPath = config.workflowsPath;
  
  if (name.includes('/')) {
    const [category, fileName] = name.split('/');
    
    // 尝试多个可能的路径
    const possiblePaths = [
      // 1. skills 目录: skills/category/file.yml
      path.join(stepsDir, category, `${fileName}.yml`),
      // 2. tools 目录: tools/category/file.yml
      path.join(workflowsPath, 'tools', category, `${fileName}.yml`),
      // 3. tools/std 目录: tools/std/category/file.yml
      path.join(workflowsPath, 'tools', 'std', category, `${fileName}.yml`),
      // 4. workflows 目录: workflows/category/file.yml（子工作流）
      path.join(workflowsPath, 'workflows', category, `${fileName}.yml`),
      // 5. workflows/steps 目录: workflows/steps/category/file.yml
      path.join(workflowsPath, 'workflows', 'steps', category, `${fileName}.yml`),
    ];
    
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return yaml.load(content);
      }
    }
    
    // 尝试 name 字段匹配
    for (const dirPath of possiblePaths.map(p => path.dirname(p))) {
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.yml'));
        for (const file of files) {
          const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
          const data = yaml.load(content);
          if (data.name === fileName || data.id === fileName) {
            return data;
          }
        }
      }
    }
    
    return null;
  }
  
  // 格式 2: name（向后兼容）- 在所有目录下搜索
  const searchDirs = [
    stepsDir,
    path.join(workflowsPath, 'tools'),
    path.join(workflowsPath, 'tools', 'std'),
    path.join(workflowsPath, 'workflows'),
    path.join(workflowsPath, 'workflows', 'steps'),
  ];
  
  for (const searchDir of searchDirs) {
    if (!fs.existsSync(searchDir)) continue;
    
    const categories = fs.readdirSync(searchDir);
    for (const category of categories) {
      const categoryPath = path.join(searchDir, category);
      if (!fs.statSync(categoryPath).isDirectory()) continue;
      
      const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.yml'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(categoryPath, file), 'utf-8');
        const data = yaml.load(content);
        if (data.name === name || data.id === name) {
          return data;
        }
      }
    }
  }
  
  return null;
}

// 同步版本（内部使用）
function listWorkflowsSync(): WorkflowMeta[] {
  const workflowsDir = path.join(config.workflowsPath, 'workflows');
  if (!fs.existsSync(workflowsDir)) return [];
  
  return fs.readdirSync(workflowsDir)
    .filter(f => f.endsWith('.yml'))
    .map(file => {
      const content = fs.readFileSync(path.join(workflowsDir, file), 'utf-8');
      const data = yaml.load(content);
      const workflowName = data.name || file.replace('.yml', '');
      
      // 支持 steps、phases、sub_workflows 三种字段
      let stepIds: string[] = [];
      if (data.steps) {
        stepIds = data.steps.map((s: any) => typeof s === 'string' ? s : (s.id || s.pipeline || s.step || ''));
      } else if (data.phases) {
        stepIds = data.phases.flatMap((phase: any) => {
          if (phase.steps) {
            return phase.steps.map((s: any) => typeof s === 'string' ? s : (s.id || s.pipeline || s.step || ''));
          }
          return phase.id || '';
        }).filter(Boolean);
      } else if (data.sub_workflows) {
        stepIds = data.sub_workflows.map((sw: any) => sw.id || sw.workflow || '');
      }

      return {
        id: data.id || workflowName.toLowerCase().replace(/\s+/g, '-'),
        name: workflowName,
        description: data.description || '',
        category: data.category || 'general',
        type: 'workflow' as const,
        stage: data.stage,
        stepIds,
        openclaw: data.openclaw,
        path: file
      };
    });
}

function listToolsSync(): ToolMeta[] {
  const toolsDir = path.join(config.workflowsPath, 'tools');
  if (!fs.existsSync(toolsDir)) return [];
  
  const tools: ToolMeta[] = [];
  const categories = fs.readdirSync(toolsDir);
  
  for (const category of categories) {
    const categoryPath = path.join(toolsDir, category);
    if (fs.statSync(categoryPath).isDirectory()) {
      const files = fs.readdirSync(categoryPath).filter(f => f.endsWith('.yml'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(categoryPath, file), 'utf-8');
        const data = yaml.load(content);
        const toolName = data.name || file.replace('.yml', '');
        
        tools.push({
          id: data.id || toolName.toLowerCase().replace(/\s+/g, '-'),
          name: toolName,
          description: data.description || '',
          category: data.category || category,
          type: 'tool',
          stage: data.stage,  // 新增：Stage 分类
          path: path.join(category, file)
        });
      }
    }
  }
  
  return tools;
}

// ========== Stage Classification（责任链模型）==========

import { Stage } from './types';

/**
 * Stage 分类数据
 */
export interface StageCategory {
  id: Stage;
  name: string;
  description: string;
  workflows: WorkflowMeta[];
  tools: ToolMeta[];
}

const STAGE_NAMES: Record<Stage, string> = {
  plan: '规划',
  develop: '开发',
  verify: '验证',
  deploy: '部署',
  fix: '修复',
  govern: '治理',
};

/**
 * 构建 Stage 分类数据
 * 
 * 从 Registry 自动聚合，按 Stage 分类
 */
export function buildStageCategories(): StageCategory[] {
  const workflows = listWorkflowsSync();
  const tools = listToolsSync();
  
  const categories: StageCategory[] = [];
  const stages: Stage[] = ['plan', 'develop', 'verify', 'deploy', 'fix', 'govern'];
  
  for (const stage of stages) {
    const stageWorkflows = workflows.filter(w => w.stage === stage);
    const stageTools = tools.filter(t => t.stage === stage);
    
    categories.push({
      id: stage,
      name: STAGE_NAMES[stage],
      description: '',
      workflows: stageWorkflows,
      tools: stageTools,
    });
  }
  
  return categories;
}

/**
 * 获取指定 Stage 的 Workflows
 */
export function listWorkflowsByStage(stage: Stage): WorkflowMeta[] {
  const workflows = listWorkflowsSync();
  return workflows.filter(w => w.stage === stage);
}

/**
 * 获取指定 Stage 的 Tools
 */
export function listToolsByStage(stage: Stage): ToolMeta[] {
  const tools = listToolsSync();
  return tools.filter(t => t.stage === stage);
}
