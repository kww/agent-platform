/**
 * 上下文加载器
 * 
 * 功能：
 * 1. 加载语言/框架/模板上下文
 * 2. 自动检测项目类型
 * 3. 提供默认配置
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface ProjectContext {
  language?: string;
  framework?: string;
  type?: string;
  entryPoints: string[];
  excludeDirs: string[];
  testPatterns: string[];
  bestPractices: string[];
  commonDependencies: string[];
  [key: string]: any;
}

const CONTEXTS_DIR = process.env.AGENT_SKILLS_PATH 
  ? path.join(process.env.AGENT_SKILLS_PATH, '../contexts')
  : path.join(process.env.HOME || '/root', 'projects/agent-platform/packages/workflows/contexts');

/**
 * 加载上下文文件
 */
export async function loadContextFile(contextPath: string): Promise<ProjectContext | null> {
  const fullPath = path.join(CONTEXTS_DIR, contextPath);
  
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return yaml.load(content);
  } catch {
    return null;
  }
}

/**
 * 加载语言上下文
 */
export async function loadLanguageContext(language: string): Promise<ProjectContext | null> {
  return loadContextFile(`languages/${language}.yml`);
}

/**
 * 加载框架上下文
 */
export async function loadFrameworkContext(framework: string): Promise<ProjectContext | null> {
  return loadContextFile(`frameworks/${framework}.yml`);
}

/**
 * 加载模板上下文
 */
export async function loadTemplateContext(template: string): Promise<ProjectContext | null> {
  return loadContextFile(`templates/${template}.yml`);
}

/**
 * 自动检测项目类型
 */
export async function detectProjectContext(projectRoot: string): Promise<ProjectContext> {
  const context: ProjectContext = {
    entryPoints: [],
    excludeDirs: ['node_modules', 'dist', 'build', 'coverage', '.git'],
    testPatterns: [],
    bestPractices: [],
    commonDependencies: []
  };
  
  // 检测 package.json
  try {
    const packageJson = await readJson(path.join(projectRoot, 'package.json'));
    
    if (packageJson) {
      // TypeScript
      if (packageJson.devDependencies?.typescript) {
        context.language = 'typescript';
        const tsContext = await loadLanguageContext('typescript');
        if (tsContext) Object.assign(context, tsContext);
      }
      
      // Next.js
      if (packageJson.dependencies?.next) {
        context.framework = 'nextjs';
        const nextContext = await loadFrameworkContext('nextjs');
        if (nextContext) Object.assign(context, nextContext);
      }
      
      // Monorepo
      if (packageJson.workspaces || await fs.stat(path.join(projectRoot, 'pnpm-workspace.yaml')).then(() => true).catch(() => false)) {
        const monoContext = await loadTemplateContext('monorepo');
        if (monoContext) Object.assign(context, monoContext);
      }
    }
  } catch {
    // No package.json
  }
  
  // 检测 Python
  try {
    const pyproject = await fs.readFile(path.join(projectRoot, 'pyproject.toml'), 'utf-8');
    if (pyproject) {
      context.language = 'python';
      const pyContext = await loadLanguageContext('python');
      if (pyContext) Object.assign(context, pyContext);
      
      // FastAPI
      if (pyproject.includes('fastapi')) {
        context.framework = 'fastapi';
        const fastapiContext = await loadFrameworkContext('fastapi');
        if (fastapiContext) Object.assign(context, fastapiContext);
      }
    }
  } catch {
    // No pyproject.toml
  }
  
  return context;
}

/**
 * 合并上下文
 */
export function mergeContexts(...contexts: (ProjectContext | null | undefined)[]): ProjectContext {
  const result: ProjectContext = {
    entryPoints: [],
    excludeDirs: [],
    testPatterns: [],
    bestPractices: [],
    commonDependencies: []
  };
  
  for (const ctx of contexts.filter(Boolean) as ProjectContext[]) {
    result.language = ctx.language || result.language;
    result.framework = ctx.framework || result.framework;
    result.type = ctx.type || result.type;
    
    result.entryPoints.push(...(ctx.entryPoints || []));
    result.excludeDirs.push(...(ctx.excludeDirs || []));
    result.testPatterns.push(...(ctx.testPatterns || []));
    result.bestPractices.push(...(ctx.bestPractices || []));
    result.commonDependencies.push(...(ctx.commonDependencies || []));
    
    // 合并已知字段以外的自定义属性
    const KNOWN_KEYS = new Set(['language', 'framework', 'type', 'entryPoints', 'excludeDirs', 'testPatterns', 'bestPractices', 'commonDependencies']);
    for (const [key, value] of Object.entries(ctx)) {
      if (!KNOWN_KEYS.has(key)) {
        (result as any)[key] = value;
      }
    }
  }
  
  // 去重
  result.entryPoints = [...new Set(result.entryPoints)];
  result.excludeDirs = [...new Set(result.excludeDirs)];
  result.testPatterns = [...new Set(result.testPatterns)];
  result.bestPractices = [...new Set(result.bestPractices)];
  result.commonDependencies = [...new Set(result.commonDependencies)];
  
  return result;
}

/**
 * 构建上下文提示词
 */
export function buildContextPrompt(context: ProjectContext): string {
  const parts: string[] = [];
  
  if (context.language) {
    parts.push(`Language: ${context.language}`);
  }
  
  if (context.framework) {
    parts.push(`Framework: ${context.framework}`);
  }
  
  if (context.entryPoints.length > 0) {
    parts.push(`Entry Points: ${context.entryPoints.join(', ')}`);
  }
  
  if (context.bestPractices.length > 0) {
    parts.push(`Best Practices:\n${context.bestPractices.map(p => `- ${p}`).join('\n')}`);
  }
  
  return parts.join('\n\n');
}

/**
 * 读取 JSON 文件
 */
async function readJson(filePath: string): Promise<any | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
