/**
 * 内置处理器
 * 
 * 用于执行不需要 Agent 的数据处理任务
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as yaml from 'js-yaml';
import { stanceHandlers } from './stance-handlers';

export interface BuiltinHandler {
  (input: Record<string, any>, context?: any): Promise<any>;
}

/**
 * 生成任务清单
 * 从 requirements.md 和 architecture.md 生成 tasks.yml
 */
export const generateTasksHandler: BuiltinHandler = async (input, context) => {
  const { project_path, project_name, tech_stack } = input;
  const workdir = project_path || context?.workdir || process.cwd();
  
  console.log('📋 Generating tasks from documents...');
  
  // 读取需求文档
  const requirementsPath = path.join(workdir, 'requirements.md');
  const architecturePath = path.join(workdir, 'architecture.md');
  
  if (!fs.existsSync(requirementsPath)) {
    throw new Error(`requirements.md not found at ${requirementsPath}`);
  }
  if (!fs.existsSync(architecturePath)) {
    throw new Error(`architecture.md not found at ${architecturePath}`);
  }
  
  const requirementsContent = fs.readFileSync(requirementsPath, 'utf-8');
  const architectureContent = fs.readFileSync(architecturePath, 'utf-8');
  
  // 解析功能点
  const features = parseFeatures(requirementsContent);
  
  // 解析模块
  const modules = parseModules(architectureContent);
  
  // 解析技术栈
  const techStack = parseTechStack(architectureContent);
  
  // 生成任务
  const tasks = generateTasksFromFeatures(features, modules);
  
  // 生成执行计划
  const executionPlan = generateExecutionPlan(tasks, modules);
  
  // 构建 tasks.yml 内容
  const tasksYml = {
    project: {
      name: project_name || path.basename(workdir),
      description: extractDescription(requirementsContent),
      path: workdir,
      tech_stack: techStack,
      type: determineProjectType(techStack),
    },
    design_docs: {
      requirements: 'requirements.md',
      architecture: 'architecture.md',
    },
    infrastructure: generateInfrastructureTasks(modules, techStack),
    tasks: tasks,
    execution_plan: executionPlan,
    acceptance_criteria: {
      functional: features.filter(f => f.priority === 'P0').map(f => f.acceptance),
      quality: ['代码结构清晰', '无 console 错误', '测试通过'],
    },
  };
  
  // 写入 tasks.yml
  const tasksYmlPath = path.join(workdir, 'tasks.yml');
  fs.writeFileSync(tasksYmlPath, yaml.dump(tasksYml, { indent: 2 }));
  
  console.log(`✅ Generated tasks.yml with ${tasks.length} tasks`);
  
  return {
    success: true,
    path: tasksYmlPath,
    tasks_count: tasks.length,
    tasks: tasksYml,
  };
};

/**
 * 加载任务清单
 * 读取并解析 tasks.yml 文件
 */
export const loadTasksHandler: BuiltinHandler = async (input, context) => {
  const { path: tasksPath } = input;
  const workdir = context?.workdir || process.cwd();
  
  const tasksYmlPath = tasksPath || path.join(workdir, 'tasks.yml');
  
  if (!fs.existsSync(tasksYmlPath)) {
    throw new Error(`tasks.yml not found at ${tasksYmlPath}`);
  }
  
  console.log('📋 Loading tasks.yml...');
  
  const content = fs.readFileSync(tasksYmlPath, 'utf-8');
  const tasksYml = yaml.load(content) as any;
  
  // 构建依赖图
  const dependencyGraph = buildDependencyGraph(tasksYml.tasks || [], tasksYml.infrastructure || []);
  
  console.log(`✅ Loaded ${tasksYml.tasks?.length || 0} tasks`);
  
  return {
    project: tasksYml.project,
    infrastructure: tasksYml.infrastructure || [],
    tasks: tasksYml.tasks || [],
    execution_plan: tasksYml.execution_plan || [],
    dependency_graph: dependencyGraph,
  };
};

// ========== 解析函数 ==========

/**
 * 解析功能点列表
 */
function parseFeatures(content: string): Array<{
  priority: string;
  name: string;
  description: string;
  acceptance: string;
}> {
  const features: Array<{
    priority: string;
    name: string;
    description: string;
    acceptance: string;
  }> = [];
  
  // 匹配格式: - [P0/P1/P2] 功能名称
  const regex = /- \[P(\d)\]\s+(.+?)(?:\n\s+- 描述:\s*(.+?))?(?:\n\s+- 验收:\s*(.+?))?(?=\n- \[P|\n##|\n###|$)/gs;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    features.push({
      priority: `P${match[1]}`,
      name: match[2].trim(),
      description: match[3]?.trim() || match[2].trim(),
      acceptance: match[4]?.trim() || `实现${match[2].trim()}功能`,
    });
  }
  
  // 备用正则（简化格式）
  if (features.length === 0) {
    const simpleRegex = /- \[P(\d)\]\s+(.+)/g;
    while ((match = simpleRegex.exec(content)) !== null) {
      features.push({
        priority: `P${match[1]}`,
        name: match[2].trim(),
        description: match[2].trim(),
        acceptance: `实现${match[2].trim()}功能`,
      });
    }
  }
  
  return features;
}

/**
 * 解析模块划分
 */
function parseModules(content: string): Array<{
  path: string;
  responsibility: string;
  dependencies: string[];
}> {
  const modules: Array<{
    path: string;
    responsibility: string;
    dependencies: string[];
  }> = [];
  
  // 匹配格式: ### 模块: <路径>
  const regex = /### 模块:\s*(.+?)\n\s*- 职责:\s*(.+?)\n\s*- 依赖:\s*(.+)/g;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const depStr = match[3].trim();
    const deps = depStr === '无' ? [] : depStr.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    
    modules.push({
      path: match[1].trim(),
      responsibility: match[2].trim(),
      dependencies: deps,
    });
  }
  
  return modules;
}

/**
 * 解析技术栈
 */
function parseTechStack(content: string): Record<string, string> {
  const techStack: Record<string, string> = {};
  
  // 匹配表格格式
  const regex = /\|\s*(框架|语言|存储|构建|类别)\s*\|\s*(.+?)\s*\|/g;
  
  let match;
  while ((match = regex.exec(content)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    techStack[key] = value;
  }
  
  return techStack;
}

/**
 * 从功能点生成任务（AW-024 改进依赖推断）
 */
function generateTasksFromFeatures(
  features: Array<{ priority: string; name: string; description: string; acceptance: string }>,
  modules: Array<{ path: string; responsibility: string; dependencies: string[] }>
): Array<any> {
  const tasks: Array<any> = [];
  let taskIndex = 1;
  
  // 第一遍：生成所有任务（先不设置依赖）
  for (const feature of features) {
    // 查找相关模块（改进匹配逻辑）
    const relatedModules = findRelatedModules(feature, modules);
    
    // 估算任务复杂度和时间（AW-023）
    const estimation = estimateTaskComplexity(feature, relatedModules);
    
    tasks.push({
      id: `task-${String(taskIndex++).padStart(3, '0')}`,
      name: feature.name,
      type: 'feature',
      priority: feature.priority === 'P0' ? 'critical' : feature.priority === 'P1' ? 'high' : 'medium',
      risk: estimation.risk,
      complexity: estimation.complexity,
      value: feature.priority === 'P0' ? 'high' : feature.priority === 'P1' ? 'medium' : 'low',
      estimated_time: estimation.estimated_time,
      description: feature.description,
      files: relatedModules.length > 0 
        ? relatedModules.map(m => ({ path: m.path, type: 'module' }))
        : [{ path: `src/${slugify(feature.name)}.js`, type: 'module' }],
      dependencies: [],  // 先留空，第二遍填充
      spec: feature.description,
      test_required: true,
      acceptance: [feature.acceptance],
      _relatedModules: relatedModules,  // 临时保存，用于依赖推断
    });
  }
  
  // 第二遍：推断任务依赖（AW-024）
  const moduleToTaskMap = buildModuleToTaskMap(tasks, modules);
  
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const deps = inferTaskDependencies(task, tasks, modules, moduleToTaskMap, i);
    task.dependencies = deps;
    // 删除临时字段
    delete task._relatedModules;
  }
  
  return tasks;
}

/**
 * 查找相关模块（改进匹配逻辑）
 */
function findRelatedModules(
  feature: { name: string; description: string },
  modules: Array<{ path: string; responsibility: string; dependencies: string[] }>
): Array<{ path: string; responsibility: string; dependencies: string[] }> {
  const related: Array<{ path: string; responsibility: string; dependencies: string[] }> = [];
  
  // 关键词匹配表
  const keywordMap: Record<string, string[]> = {
    // 功能 → 模块路径关键词
    '用户': ['user', 'auth', 'login'],
    '认证': ['auth', 'login', 'session'],
    '登录': ['auth', 'login', 'client'],
    'API': ['api', 'routes', 'controllers'],
    '数据': ['data', 'model', 'storage'],
    '列表': ['list', 'todo', 'component'],
    '待办': ['todo', 'task', 'item'],
    '前端': ['client', 'frontend', 'ui'],
    '后端': ['server', 'backend', 'api'],
  };
  
  // 从功能名称和描述中提取关键词
  const featureKeywords = extractKeywords(feature.name + ' ' + feature.description);
  
  for (const module of modules) {
    const moduleKeywords = extractKeywords(module.path + ' ' + module.responsibility);
    
    // 关键词交集匹配
    const matchCount = featureKeywords.filter(k => 
      moduleKeywords.some(mk => mk.includes(k) || k.includes(mk))
    ).length;
    
    // 直接名称匹配
    const directMatch = 
      module.responsibility.includes(feature.name) ||
      feature.name.includes(module.path) ||
      feature.description.includes(module.responsibility);
    
    // 映射表匹配
    const mappedMatch = featureKeywords.some(fk => {
      const mappedPaths = keywordMap[fk] || [];
      return mappedPaths.some(mp => 
        module.path.toLowerCase().includes(mp) ||
        module.responsibility.toLowerCase().includes(mp)
      );
    });
    
    if (matchCount >= 2 || directMatch || mappedMatch) {
      related.push(module);
    }
  }
  
  return related;
}

/**
 * 提取关键词（简单实现）
 */
function extractKeywords(text: string): string[] {
  // 分词：按空格、标点、中英文分隔
  const words = text.toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, ' ')
    .split(' ')
    .filter(w => w.length >= 2);  // 过滤单字
  
  // 中文词提取（简单按字）
  const chinese = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  
  return [...words, ...chinese];
}

/**
 * 构建模块到任务的映射表
 */
function buildModuleToTaskMap(
  tasks: Array<any>,
  modules: Array<{ path: string; responsibility: string; dependencies: string[] }>
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  
  for (const module of modules) {
    // 查找与该模块相关的所有任务
    const relatedTasks = tasks.filter(t => 
      (t._relatedModules || []).some((m: any) => m.path === module.path)
    );
    map[module.path] = relatedTasks.map(t => t.id);
  }
  
  return map;
}

/**
 * 推断任务依赖（AW-024）
 */
function inferTaskDependencies(
  task: any,
  allTasks: Array<any>,
  modules: Array<{ path: string; responsibility: string; dependencies: string[] }>,
  moduleToTaskMap: Record<string, string[]>,
  taskIndex: number
): string[] {
  const deps: string[] = [];
  
  // 1. 基础设施依赖（所有任务依赖 setup-project）
  deps.push('setup-project');
  
  // 2. 模块依赖推断
  const relatedModules = task._relatedModules || [];
  for (const module of relatedModules) {
    for (const moduleDep of module.dependencies) {
      // 模块依赖 → 任务依赖
      const depTasks = moduleToTaskMap[moduleDep] || [];
      for (const depTaskId of depTasks) {
        if (depTaskId !== task.id && !deps.includes(depTaskId)) {
          deps.push(depTaskId);
        }
      }
    }
  }
  
  // 3. 功能逻辑依赖推断
  // 关键词：删除依赖添加、更新依赖读取
  const logicalDeps = inferLogicalDependencies(task, allTasks, taskIndex);
  for (const dep of logicalDeps) {
    if (!deps.includes(dep)) {
      deps.push(dep);
    }
  }
  
  // 4. 优先级顺序依赖（P2 依赖 P1，P1 依赖 P0）
  const priorityDeps = inferPriorityDependencies(task, allTasks);
  for (const dep of priorityDeps) {
    if (!deps.includes(dep)) {
      deps.push(dep);
    }
  }
  
  return deps;
}

/**
 * 功能逻辑依赖推断
 */
function inferLogicalDependencies(
  task: any,
  allTasks: Array<any>,
  taskIndex: number
): string[] {
  const deps: string[] = [];
  
  // 依赖规则表（精简版）
  const depRules: Array<{ pattern: string; dependsOn: string }> = [
    { pattern: '删除', dependsOn: '添加|创建' },
    { pattern: '修改|更新|编辑', dependsOn: '添加|创建|查询' },
    { pattern: '清空', dependsOn: '完成|标记' },
    { pattern: '持久化|存储', dependsOn: '创建|添加' },
    { pattern: '测试', dependsOn: '实现|功能' },
  ];
  
  for (const rule of depRules) {
    // 当前任务是否匹配 pattern
    if (task.name.match(new RegExp(rule.pattern)) || task.description.match(new RegExp(rule.pattern))) {
      // 找依赖任务（只取第一个匹配，避免依赖过多）
      const depTask = allTasks.find(t => 
        t.id !== task.id &&
        (t.name.match(new RegExp(rule.dependsOn)) || 
         t.description.match(new RegExp(rule.dependsOn)))
      );
      if (depTask) {
        deps.push(depTask.id);
      }
    }
  }
  
  return deps;
}

/**
 * 优先级顺序依赖推断
 */
function inferPriorityDependencies(
  task: any,
  allTasks: Array<any>
): string[] {
  const deps: string[] = [];
  
  // 只对 medium/low 优先级任务添加高优先级依赖
  if (task.priority === 'medium' || task.priority === 'low') {
    // 找一个 critical 任务作为代表
    const criticalTask = allTasks.find(t => t.priority === 'critical');
    if (criticalTask && criticalTask.id !== task.id) {
      deps.push(criticalTask.id);
    }
  }
  
  return deps;
}

/**
 * 估算任务复杂度和时间
 * 基于 split-tasks.yml 评分框架（AW-023）
 */
function estimateTaskComplexity(
  feature: { priority: string; name: string; description: string },
  relatedModules: Array<{ path: string; responsibility: string; dependencies: string[] }>
): {
  complexity: 'large' | 'medium' | 'small';
  risk: 'high' | 'medium' | 'low';
  estimated_time: '<1h' | '1-2h' | '2-4h' | '>4h';
} {
  // 计算评分（参考 split-tasks.yml 评分权重）
  let score = 0;
  
  // 优先级权重
  const priorityWeights: Record<string, number> = {
    'P0': 30,  // critical
    'P1': 20,  // high
    'P2': 10,  // medium
    'P3': 5,   // low
  };
  score += priorityWeights[feature.priority] || 10;
  
  // 模块数量权重（多模块 = 复杂）
  score += relatedModules.length * 10;
  
  // 描述长度权重（长描述 = 复杂）
  if (feature.description.length > 100) {
    score += 15;
  } else if (feature.description.length > 50) {
    score += 5;
  }
  
  // 关键词判断（高风险关键词）
  const highRiskKeywords = ['认证', '安全', '加密', '权限', '支付', '交易', '核心', '关键'];
  const isHighRisk = highRiskKeywords.some(kw => 
    feature.name.includes(kw) || feature.description.includes(kw)
  );
  
  // 确定复杂度
  let complexity: 'large' | 'medium' | 'small';
  if (score >= 50) {
    complexity = 'large';
  } else if (score >= 25) {
    complexity = 'medium';
  } else {
    complexity = 'small';
  }
  
  // 确定风险
  let risk: 'high' | 'medium' | 'low';
  if (isHighRisk || feature.priority === 'P0') {
    risk = 'high';
  } else if (feature.priority === 'P1' || relatedModules.length > 2) {
    risk = 'medium';
  } else {
    risk = 'low';
  }
  
  // 确定预估时间（基于评分）
  let estimated_time: '<1h' | '1-2h' | '2-4h' | '>4h';
  if (score >= 50) {
    estimated_time = '>4h';
  } else if (score >= 35) {
    estimated_time = '2-4h';
  } else if (score >= 20) {
    estimated_time = '1-2h';
  } else {
    estimated_time = '<1h';
  }
  
  return { complexity, risk, estimated_time };
}

/**
 * 生成基础设施任务
 */
function generateInfrastructureTasks(
  modules: Array<{ path: string; responsibility: string; dependencies: string[] }>,
  techStack: Record<string, string>
): Array<any> {
  const tasks: Array<any> = [];
  
  // 项目初始化任务
  tasks.push({
    id: 'setup-project',
    name: '项目初始化',
    priority: 'critical',
    risk: 'low',
    complexity: 'small',
    value: 'high',
    estimated_time: '<1h',
    description: '创建项目目录结构和基础配置',
    files: [{ path: 'package.json', type: 'config' }],
    dependencies: [],
    spec: '初始化项目，创建必要的配置文件和目录结构',
    test_required: false,
  });
  
  // 根据模块生成基础设施任务
  const infrastructureModules = modules.filter(m => 
    m.responsibility.includes('基础') || 
    m.responsibility.includes('配置') ||
    m.responsibility.includes('工具')
  );
  
  for (const mod of infrastructureModules) {
    tasks.push({
      id: slugify(mod.path),
      name: mod.responsibility,
      priority: 'high',
      risk: 'low',
      complexity: 'medium',
      value: 'medium',
      estimated_time: '1-2h',
      description: mod.responsibility,
      files: [{ path: mod.path, type: 'module' }],
      dependencies: mod.dependencies,
      spec: mod.responsibility,
      test_required: false,
    });
  }
  
  return tasks;
}

/**
 * 生成执行计划
 */
function generateExecutionPlan(
  tasks: Array<any>,
  modules: Array<{ path: string; responsibility: string; dependencies: string[] }>
): Array<any> {
  // 按优先级分组（v2.0.0 字符串格式）
  const criticalTasks = tasks.filter(t => t.priority === 'critical');
  const highTasks = tasks.filter(t => t.priority === 'high');
  const mediumTasks = tasks.filter(t => t.priority === 'medium');
  
  return [
    {
      phase: 'infrastructure',
      parallel: false,
      tasks: ['setup-project'],
    },
    {
      phase: 'core',
      parallel: true,
      tasks: criticalTasks.map(t => t.id),
    },
    {
      phase: 'enhancement',
      parallel: true,
      tasks: highTasks.map(t => t.id),
    },
    {
      phase: 'optional',
      parallel: true,
      tasks: mediumTasks.map(t => t.id),
    },
  ].filter(p => p.tasks.length > 0);
}

/**
 * 构建依赖图
 */
function buildDependencyGraph(
  tasks: Array<any>,
  infrastructure: Array<any>
): { nodes: string[]; edges: Array<[string, string]> } {
  const allTasks = [...infrastructure, ...tasks];
  const nodes = allTasks.map(t => t.id);
  const edges: Array<[string, string]> = [];
  
  for (const task of allTasks) {
    for (const dep of task.dependencies || []) {
      if (nodes.includes(dep)) {
        edges.push([dep, task.id]);
      }
    }
  }
  
  return { nodes, edges };
}

/**
 * 提取项目描述
 */
function extractDescription(content: string): string {
  const match = content.match(/## 项目概述\s*\n+(.+?)(?=\n##|\n#|$)/s);
  return match ? match[1].trim().split('\n')[0] : '待开发项目';
}

/**
 * 确定项目类型
 */
function determineProjectType(techStack: Record<string, string>): string {
  const hasBackend = techStack['存储']?.includes('API') || techStack['后端'] !== '无';
  const hasFrontend = techStack['框架'] || techStack['前端框架'];
  
  if (hasBackend && hasFrontend) return 'fullstack';
  if (hasBackend) return 'backend';
  if (hasFrontend) return 'frontend';
  return 'unknown';
}

/**
 * 生成 URL 友好的 ID
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 生成完成报告
 * 汇总工作流执行结果
 */
export const generateCompletionReportHandler: BuiltinHandler = async (input, context) => {
  const { project_path, project, test_result, review_result } = input;
  const workdir = project_path || context?.workdir || process.cwd();
  
  console.log('📊 Generating completion report...');
  
  const now = new Date();
  const timestamp = now.toISOString();
  
  // 构建报告内容
  const reportLines: string[] = [
    `# 项目完成报告`,
    ``,
    `> 生成时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    ``,
    `## 项目信息`,
    ``,
    `- **项目名称**: ${project?.name || path.basename(workdir)}`,
    `- **项目路径**: ${workdir}`,
    `- **技术栈**: ${JSON.stringify(project?.tech_stack || {})}`,
    ``,
    `## 执行结果`,
    ``,
  ];
  
  // 测试结果
  if (test_result) {
    const testStatus = test_result.passed ? '✅ 通过' : '❌ 失败';
    reportLines.push(`### 测试结果: ${testStatus}`);
    reportLines.push(``);
    if (test_result.total !== undefined) {
      reportLines.push(`- 总测试数: ${test_result.total}`);
      reportLines.push(`- 通过: ${test_result.passed_count || test_result.total}`);
      reportLines.push(`- 失败: ${test_result.failed_count || 0}`);
      if (test_result.coverage) {
        reportLines.push(`- 覆盖率: ${test_result.coverage}%`);
      }
    }
    reportLines.push(``);
  }
  
  // 代码审查结果
  if (review_result) {
    reportLines.push(`### 代码审查`);
    reportLines.push(``);
    if (review_result.score) {
      reportLines.push(`- 评分: ${review_result.score}/10`);
    }
    if (review_result.issues_fixed) {
      reportLines.push(`- 已修复问题: ${review_result.issues_fixed.length}`);
    }
    if (review_result.issues_pending) {
      reportLines.push(`- 待处理问题: ${review_result.issues_pending.length}`);
    }
    reportLines.push(``);
  }
  
  // 文件统计
  try {
    const stats = getFileStats(workdir);
    reportLines.push(`## 文件统计`);
    reportLines.push(``);
    reportLines.push(`- 源代码文件: ${stats.sourceFiles}`);
    reportLines.push(`- 测试文件: ${stats.testFiles}`);
    reportLines.push(`- 配置文件: ${stats.configFiles}`);
    reportLines.push(`- 总代码行数: ${stats.totalLines}`);
    reportLines.push(``);
  } catch (e) {
    // 忽略统计错误
  }
  
  reportLines.push(`---`);
  reportLines.push(``);
  reportLines.push(`*报告由 Agent Runtime 自动生成*`);
  
  const reportContent = reportLines.join('\n');
  
  // 写入报告文件
  const reportPath = path.join(workdir, 'COMPLETION_REPORT.md');
  fs.writeFileSync(reportPath, reportContent, 'utf-8');
  
  console.log(`✅ Generated completion report: ${reportPath}`);
  
  return {
    success: true,
    path: reportPath,
    content: reportContent,
    timestamp,
  };
};

/**
 * 获取文件统计
 */
function getFileStats(workdir: string): {
  sourceFiles: number;
  testFiles: number;
  configFiles: number;
  totalLines: number;
} {
  const stats = {
    sourceFiles: 0,
    testFiles: 0,
    configFiles: 0,
    totalLines: 0,
  };
  
  const excludeDirs = ['node_modules', '.git', 'dist', 'build', 'coverage'];
  
  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name)) {
          walk(path.join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        const filePath = path.join(dir, entry.name);
        
        // 统计源代码
        if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java'].includes(ext)) {
          if (entry.name.includes('.test.') || entry.name.includes('.spec.')) {
            stats.testFiles++;
          } else {
            stats.sourceFiles++;
          }
          
          // 计算行数
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            stats.totalLines += content.split('\n').length;
          } catch {}
        }
        
        // 统计配置文件
        if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext) ||
            ['.eslintrc', '.prettierrc', 'tsconfig', 'package'].some(p => entry.name.startsWith(p))) {
          stats.configFiles++;
        }
      }
    }
  }
  
  walk(workdir);
  
  return stats;
}

/**
 * Git 提交处理器
 * 审核通过后自动提交代码
 */
export const gitCommitHandler: BuiltinHandler = async (input, context) => {
  const { project_path, message, files } = input;
  const workdir = project_path || context?.workdir || process.cwd();
  
  console.log('📤 Committing changes...');
  
  const { execSync } = await import('child_process');
  
  try {
    // 检查是否有未提交的更改
    const statusOutput = execSync('git status --porcelain', { 
      cwd: workdir, 
      encoding: 'utf-8' 
    });
    
    if (!statusOutput.trim()) {
      console.log('ℹ️ No changes to commit');
      return {
        success: true,
        commit_hash: null,
        message: 'No changes to commit',
      };
    }
    
    // 如果指定了文件，只添加这些文件
    if (files && Array.isArray(files) && files.length > 0) {
      for (const file of files) {
        execSync(`git add "${file}"`, { cwd: workdir });
      }
    } else {
      // 否则添加所有更改
      execSync('git add -A', { cwd: workdir });
    }
    
    // 提交
    const commitMessage = message || 'chore: automated commit';
    execSync(`git commit -m "${commitMessage}"`, { cwd: workdir });
    
    // 获取 commit hash
    const commitHash = execSync('git rev-parse HEAD', { 
      cwd: workdir, 
      encoding: 'utf-8' 
    }).trim();
    
    console.log(`✅ Committed: ${commitHash.substring(0, 7)}`);
    
    return {
      success: true,
      commit_hash: commitHash,
      message: commitMessage,
    };
  } catch (error: any) {
    console.error('❌ Git commit failed:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * 失败报告处理器
 * 记录审核未通过的任务
 */
export const reportFailureHandler: BuiltinHandler = async (input, context) => {
  const { task, review, iterations } = input;
  const workdir = context?.workdir || process.cwd();
  
  console.log('⚠️ Reporting task failure...');
  
  const now = new Date();
  const reportPath = path.join(workdir, 'failure-reports', `${task.id}-${Date.now()}.md`);
  
  // 确保目录存在
  const reportDir = path.dirname(reportPath);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  // 构建报告
  const reportLines: string[] = [
    `# 任务失败报告`,
    ``,
    `> 生成时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    ``,
    `## 任务信息`,
    ``,
    `- **任务 ID**: ${task.id}`,
    `- **任务名称**: ${task.name}`,
    `- **描述**: ${task.description}`,
    ``,
    `## 审核结果`,
    ``,
    `- **修复轮次**: ${iterations}`,
    `- **最终评分**: ${review?.score || 'N/A'}/10`,
    ``,
    `### 未通过的验收标准`,
    ``,
  ];
  
  if (review?.criteria_results) {
    for (const criteria of review.criteria_results) {
      if (!criteria.passed) {
        reportLines.push(`- ❌ ${criteria.criterion}`);
        if (criteria.issue) {
          reportLines.push(`  - 问题: ${criteria.issue}`);
        }
        if (criteria.suggestion) {
          reportLines.push(`  - 建议: ${criteria.suggestion}`);
        }
      }
    }
  }
  
  reportLines.push(``);
  reportLines.push(`### 发现的问题`);
  reportLines.push(``);
  
  if (review?.issues) {
    for (const issue of review.issues) {
      reportLines.push(`- [${issue.severity?.toUpperCase() || 'UNKNOWN'}] ${issue.file}:${issue.line || '?'}`);
      reportLines.push(`  - ${issue.description}`);
      if (issue.suggestion) {
        reportLines.push(`  - 建议: ${issue.suggestion}`);
      }
    }
  }
  
  reportLines.push(``);
  reportLines.push(`---`);
  reportLines.push(``);
  reportLines.push(`*需要人工介入处理*`);
  
  const reportContent = reportLines.join('\n');
  fs.writeFileSync(reportPath, reportContent, 'utf-8');
  
  console.log(`✅ Failure report saved: ${reportPath}`);
  
  return {
    success: true,
    path: reportPath,
    task_id: task.id,
    iterations,
    needs_manual_review: true,
  };
};

/**
 * 生成迭代任务处理器
 * 从代码库分析和影响分析生成增量 tasks.yml
 */
export const generateIterationTasksHandler: BuiltinHandler = async (input, context) => {
  const { project_path, requirement, codebase, impact } = input;
  const workdir = project_path || context?.workdir || process.cwd();
  
  console.log('📋 Generating iteration tasks...');
  
  // 确保输出目录存在
  const agentDir = path.join(workdir, '.agent');
  if (!fs.existsSync(agentDir)) {
    fs.mkdirSync(agentDir, { recursive: true });
  }
  
  // 解析影响范围
  const affectedModules = impact?.affected_modules || [];
  const changeScope = impact?.change_scope || 'unknown';
  
  // 生成任务
  const tasks: any[] = [];
  let taskIndex = 1;
  
  // 为每个受影响的模块生成任务
  for (const module of affectedModules) {
    tasks.push({
      id: `iter-${String(taskIndex++).padStart(3, '0')}`,
      name: `更新 ${module.name || module}`,
      type: 'iteration',
      priority: module.priority || 2,
      description: `在 ${module.path || module} 中实现: ${requirement}`,
      files: [{ path: module.path || module, type: 'modify' }],
      dependencies: module.dependencies || [],
      spec: module.spec || `根据需求 "${requirement}" 修改此模块`,
      test_required: true,
      acceptance: [
        `功能符合需求描述`,
        `现有测试不被破坏`,
        `新增测试覆盖新功能`,
      ],
    });
  }
  
  // 生成执行计划
  const executionPlan = [
    {
      phase: 'preparation',
      parallel: false,
      tasks: tasks.filter(t => t.priority === 0).map(t => t.id),
    },
    {
      phase: 'core',
      parallel: true,
      tasks: tasks.filter(t => t.priority === 1).map(t => t.id),
    },
    {
      phase: 'secondary',
      parallel: true,
      tasks: tasks.filter(t => t.priority >= 2).map(t => t.id),
    },
  ].filter(p => p.tasks.length > 0);
  
  // 构建 tasks.yml
  const tasksYml = {
    project: {
      name: path.basename(workdir),
      path: workdir,
      tech_stack: codebase?.tech_stack || {},
      type: 'iteration',
    },
    iteration: {
      requirement,
      change_scope: changeScope,
      base_commit: await getGitHead(workdir),
    },
    tasks,
    execution_plan: executionPlan,
    acceptance_criteria: {
      functional: [`需求 "${requirement}" 已实现`],
      quality: ['现有测试全部通过', '新增测试覆盖新功能', '无 lint 错误'],
    },
  };
  
  // 写入文件
  const tasksPath = path.join(agentDir, 'iteration-tasks.yml');
  fs.writeFileSync(tasksPath, yaml.dump(tasksYml, { indent: 2 }));
  
  console.log(`✅ Generated ${tasks.length} iteration tasks`);
  
  return {
    success: true,
    path: tasksPath,
    tasks: tasksYml,
    task_count: tasks.length,
  };
};

/**
 * 验证完成处理器
 * 检查所有验证条件是否满足
 */
export const verifyCompletionHandler: BuiltinHandler = async (input, context) => {
  const { project_path, test_result } = input;
  const workdir = project_path || context?.workdir || process.cwd();
  
  console.log('✅ Verifying completion...');
  
  const now = new Date();
  const checks: { name: string; passed: boolean; details?: string }[] = [];
  
  // 检查测试结果
  const testPassed = test_result?.passed !== false;
  checks.push({
    name: '测试通过',
    passed: testPassed,
    details: test_result?.total 
      ? `${test_result.passed_count || test_result.total}/${test_result.total} 通过`
      : undefined,
  });
  
  // 检查是否有未提交的更改
  try {
    const { execSync } = await import('child_process');
    const statusOutput = execSync('git status --porcelain', { 
      cwd: workdir, 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const hasUncommitted = statusOutput.trim().length > 0;
    checks.push({
      name: '代码已提交',
      passed: !hasUncommitted,
      details: hasUncommitted ? '有未提交的更改' : '所有更改已提交',
    });
  } catch {
    checks.push({
      name: '代码已提交',
      passed: true,
      details: '非 Git 项目',
    });
  }
  
  // 汇总结果
  const allPassed = checks.every(c => c.passed);
  
  const reportLines: string[] = [
    `# 验证报告`,
    ``,
    `> 时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
    ``,
    `## 检查结果`,
    ``,
    `| 检查项 | 状态 | 详情 |`,
    `|--------|:----:|------|`,
  ];
  
  for (const check of checks) {
    const status = check.passed ? '✅' : '❌';
    reportLines.push(`| ${check.name} | ${status} | ${check.details || '-'} |`);
  }
  
  reportLines.push(``);
  reportLines.push(`## 结论`);
  reportLines.push(``);
  reportLines.push(allPassed ? '✅ 所有检查通过' : '❌ 存在未通过的检查');
  
  // 写入报告
  const reportPath = path.join(workdir, '.agent', 'verification-report.md');
  if (!fs.existsSync(path.dirname(reportPath))) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  }
  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf-8');
  
  console.log(allPassed ? '✅ Verification passed' : '❌ Verification failed');
  
  return {
    success: allPassed,
    passed: allPassed,
    checks,
    report_path: reportPath,
  };
};

/**
 * 获取当前 Git HEAD
 */
async function getGitHead(workdir: string): Promise<string | null> {
  try {
    const { execSync } = await import('child_process');
    return execSync('git rev-parse HEAD', { 
      cwd: workdir, 
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * 校验 tasks.yml 格式和内容
 */
export const validateTasksHandler: BuiltinHandler = async (input, context) => {
  const { tasks_path, strict } = input;
  const workdir = context?.workdir || process.cwd();
  
  console.log('🔍 Validating tasks.yml...');
  
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const tasksYmlPath = tasks_path || path.join(workdir, 'tasks.yml');
  
  // 检查文件是否存在
  if (!fs.existsSync(tasksYmlPath)) {
    errors.push(`tasks.yml not found at ${tasksYmlPath}`);
    return {
      valid: false,
      errors,
      warnings,
      tasks_summary: null,
    };
  }
  
  // 解析 YAML
  let tasksYml: any;
  try {
    const content = fs.readFileSync(tasksYmlPath, 'utf-8');
    tasksYml = yaml.load(content) as any;
  } catch (e: any) {
    errors.push(`YAML 解析失败: ${e.message}`);
    return {
      valid: false,
      errors,
      warnings,
      tasks_summary: null,
    };
  }
  
  // 校验 project 字段
  if (!tasksYml.project) {
    errors.push('缺少 project 字段');
  } else {
    if (!tasksYml.project.name) {
      errors.push('缺少 project.name');
    }
    if (!tasksYml.project.path) {
      errors.push('缺少 project.path');
    }
  }
  
  // 收集所有 ID（用于后续校验）
  const infrastructureIds = new Set<string>();
  const taskIds = new Set<string>();
  
  // 收集 infrastructure ID
  for (const task of tasksYml.infrastructure || []) {
    if (task.id) {
      if (infrastructureIds.has(task.id)) {
        errors.push(`infrastructure 中 ID 重复: ${task.id}`);
      }
      infrastructureIds.add(task.id);
    }
  }
  
  // 校验 tasks 字段
  if (!tasksYml.tasks || !Array.isArray(tasksYml.tasks)) {
    errors.push('缺少 tasks 数组');
  } else if (tasksYml.tasks.length === 0) {
    errors.push('tasks 数组为空');
  } else {
    
    for (let i = 0; i < tasksYml.tasks.length; i++) {
      const task = tasksYml.tasks[i];
      const prefix = `tasks[${i}]`;
      
      // 检查必需字段
      if (!task.id) {
        errors.push(`${prefix}.id 缺失`);
      } else {
        // 检查 tasks 内重复
        if (taskIds.has(task.id)) {
          errors.push(`${prefix}.id 重复: ${task.id}`);
        }
        // 检查与 infrastructure 的冲突
        if (infrastructureIds.has(task.id)) {
          errors.push(`${prefix}.id 与 infrastructure 冲突: ${task.id}`);
        }
        taskIds.add(task.id);
        
        // 检查 ID 格式
        if (!task.id.match(/^[a-z0-9-]+$/)) {
          warnings.push(`${prefix}.id 格式不规范: ${task.id} (建议: task-001)`);
        }
      }
      
      if (!task.name) {
        errors.push(`${prefix}.name 缺失`);
      }
      
      if (!task.description) {
        warnings.push(`${prefix}.description 缺失`);
      }
      
      if (task.test_required === undefined) {
        warnings.push(`${prefix}.test_required 未设置，默认为 true`);
      }
    }
    
    // 检查依赖是否存在（合并 infrastructure 和 tasks）
    const allTaskIdsForDep = new Set([...infrastructureIds, ...taskIds]);
    
    for (const task of tasksYml.tasks) {
      if (task.dependencies && Array.isArray(task.dependencies)) {
        for (const dep of task.dependencies) {
          if (!allTaskIdsForDep.has(dep)) {
            errors.push(`任务 ${task.id} 依赖不存在的任务: ${dep}`);
          }
        }
      }
    }
    
    // 检查 infrastructure 依赖
    for (const task of tasksYml.infrastructure || []) {
      if (task.dependencies && Array.isArray(task.dependencies)) {
        for (const dep of task.dependencies) {
          if (!allTaskIdsForDep.has(dep)) {
            errors.push(`基础设施任务 ${task.id} 依赖不存在的任务: ${dep}`);
          }
        }
      }
    }
    
    // 检查循环依赖（合并 infrastructure 和 tasks）
    const allTasksForCycle = [...(tasksYml.infrastructure || []), ...tasksYml.tasks];
    const cycleResult = detectCycles(allTasksForCycle);
    if (cycleResult.hasCycle) {
      errors.push(`检测到循环依赖: ${cycleResult.cycle.join(' → ')}`);
    }
  }
  
  // 校验 execution_plan 字段
  if (!tasksYml.execution_plan || !Array.isArray(tasksYml.execution_plan)) {
    errors.push('缺少 execution_plan 数组');
  } else {
    // 复用已收集的 ID
    const allTaskIds = new Set([...infrastructureIds, ...taskIds]);
    const plannedTaskIds = new Set<string>();
    
    for (let i = 0; i < tasksYml.execution_plan.length; i++) {
      const phase = tasksYml.execution_plan[i];
      const prefix = `execution_plan[${i}]`;
      
      if (!phase.phase) {
        warnings.push(`${prefix}.phase 缺失`);
      }
      
      if (phase.parallel === undefined) {
        warnings.push(`${prefix}.parallel 未设置，默认 false`);
      }
      
      if (phase.tasks && Array.isArray(phase.tasks)) {
        for (const taskId of phase.tasks) {
          if (!allTaskIds.has(taskId)) {
            errors.push(`${prefix} 引用不存在的任务: ${taskId}`);
          }
          plannedTaskIds.add(taskId);
        }
      }
    }
    
    // 检查是否所有任务都在执行计划中（复用已收集的 ID）
    const allTaskIdsList = [...infrastructureIds, ...taskIds];
    const unplanned = allTaskIdsList.filter((id: string) => !plannedTaskIds.has(id));
    if (unplanned.length > 0) {
      warnings.push(`以下任务未在执行计划中: ${unplanned.join(', ')}`);
    }
  }
  
  // 构建摘要
  const tasksSummary = {
    total_tasks: tasksYml.tasks?.length || 0,
    phases: tasksYml.execution_plan?.length || 0,
    has_infrastructure: (tasksYml.infrastructure?.length || 0) > 0,
    has_design_docs: !!tasksYml.design_docs,
  };
  
  // 判断是否通过
  const valid = errors.length === 0 && (!strict || warnings.length === 0);
  
  if (valid) {
    console.log(`✅ tasks.yml 校验通过`);
    if (warnings.length > 0) {
      console.log(`⚠️ ${warnings.length} 个警告`);
    }
  } else {
    console.log(`❌ tasks.yml 校验失败`);
    console.log(`   错误: ${errors.length}, 警告: ${warnings.length}`);
  }
  
  return {
    valid,
    errors,
    warnings,
    tasks_summary: tasksSummary,
    path: tasksYmlPath,
  };
};

/**
 * 检测循环依赖
 */
function detectCycles(tasks: any[]): { hasCycle: boolean; cycle: string[] } {
  const graph = new Map<string, string[]>();
  
  // 构建图
  for (const task of tasks) {
    graph.set(task.id, task.dependencies || []);
  }
  
  // DFS 检测环
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycle: string[] = [];
  
  function dfs(node: string): boolean {
    visited.add(node);
    recursionStack.add(node);
    
    const deps = graph.get(node) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (dfs(dep)) {
          cycle.push(dep);
          return true;
        }
      } else if (recursionStack.has(dep)) {
        cycle.push(dep);
        cycle.push(node);
        return true;
      }
    }
    
    recursionStack.delete(node);
    return false;
  }
  
  for (const task of tasks) {
    if (!visited.has(task.id)) {
      if (dfs(task.id)) {
        return { hasCycle: true, cycle: cycle.reverse() };
      }
    }
  }
  
  return { hasCycle: false, cycle: [] };
}

/**
 * 任务分批处理器
 * 将任务列表按依赖关系和批次大小拆分成多个批次
 */
export const splitBatchHandler: BuiltinHandler = async (input, context) => {
  const { 
    tasks, 
    batch_size = 3, 
    respect_dependencies = true,
    strategy = 'balanced'
  } = input;
  
  if (!Array.isArray(tasks)) {
    throw new Error('tasks must be an array');
  }
  
  console.log(`📦 Splitting ${tasks.length} tasks into batches (size: ${batch_size}, strategy: ${strategy})`);
  
  let batches: any[][];
  
  switch (strategy) {
    case 'sequential':
      // 严格串行：每个任务一个批次
      batches = tasks.map(task => [task]);
      break;
      
    case 'parallel':
      // 并行：忽略依赖，按批次大小分
      batches = batchArray(tasks, batch_size);
      break;
      
    case 'balanced':
    default:
      // 平衡模式：考虑依赖关系
      batches = splitByDependencies(tasks, batch_size, respect_dependencies);
      break;
  }
  
  // 生成执行计划
  const executionPlan = {
    total_tasks: tasks.length,
    batch_size,
    strategy,
    total_batches: batches.length,
    estimated_time: `${batches.length * 5}-${batches.length * 10} minutes`
  };
  
  // 生成依赖图（简化版）
  const dependencyGraph = buildTaskDependencyGraph(tasks);
  
  console.log(`✅ Created ${batches.length} batches`);
  
  return {
    batches,
    total_batches: batches.length,
    execution_plan: executionPlan,
    dependency_graph: dependencyGraph
  };
};

/**
 * 按批次大小分批（忽略依赖）
 */
function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * 按依赖关系分批
 */
function splitByDependencies(tasks: any[], batchSize: number, respectDeps: boolean): any[][] {
  if (!respectDeps) {
    return batchArray(tasks, batchSize);
  }
  
  // 构建依赖图
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  
  // 初始化
  for (const task of tasks) {
    inDegree.set(task.id, 0);
    dependents.set(task.id, []);
  }
  
  // 计算入度
  for (const task of tasks) {
    const deps = task.dependencies || [];
    inDegree.set(task.id, deps.length);
    for (const depId of deps) {
      const list = dependents.get(depId) || [];
      list.push(task.id);
      dependents.set(depId, list);
    }
  }
  
  // 拓扑排序分批
  const batches: any[][] = [];
  const processed = new Set<string>();
  let currentBatch: any[] = [];
  
  while (processed.size < tasks.length) {
    // 找出入度为 0 的任务
    const ready: any[] = [];
    for (const task of tasks) {
      if (!processed.has(task.id) && inDegree.get(task.id) === 0) {
        ready.push(task);
      }
    }
    
    // 🆕 按优先级排序：priority 越小优先级越高
    ready.sort((a, b) => (a.priority || 99) - (b.priority || 99));
    
    if (ready.length === 0) {
      // 有循环依赖，强制处理剩余任务
      const remaining = tasks.filter(t => !processed.has(t.id));
      if (remaining.length > 0) {
        batches.push([...remaining.slice(0, batchSize)]);
        remaining.slice(0, batchSize).forEach(t => processed.add(t.id));
      }
      break;
    }
    
    // 按批次大小添加
    for (const task of ready) {
      if (currentBatch.length >= batchSize) {
        batches.push(currentBatch);
        currentBatch = [];
      }
      currentBatch.push(task);
      processed.add(task.id);
      
      // 更新依赖任务入度
      const deps = dependents.get(task.id) || [];
      for (const depId of deps) {
        inDegree.set(depId, (inDegree.get(depId) || 1) - 1);
      }
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
    }
  }
  
  return batches;
}

/**
 * 构建任务依赖图（用于 split-batch 输出）
 */
function buildTaskDependencyGraph(tasks: any[]): any {
  const nodes = tasks.map(t => ({
    id: t.id,
    name: t.name,
    type: t.type || 'task'
  }));
  
  const edges: any[] = [];
  for (const task of tasks) {
    const deps = task.dependencies || [];
    for (const depId of deps) {
      edges.push({
        source: depId,
        target: task.id,
        type: 'depends_on'
      });
    }
  }
  
  return { nodes, edges };
}

// ============================================
// Backlog Handlers (P2)
// ============================================

/**
 * 添加待办项
 */
export const backlogAddHandler: BuiltinHandler = async (input, context) => {
  const { project_path, item } = input;


  const backlogPath = path.join(project_path || context.workdir, '.agent', 'backlog.yml');
  
  // 加载现有 backlog
  let backlog: any = { project: { name: '' }, items: [], stats: { total: 0, by_type: {}, by_status: {}, by_priority: {} } };
  if (fs.existsSync(backlogPath)) {
    const content = fs.readFileSync(backlogPath, 'utf-8');
    backlog = yaml.load(content) || backlog;
  }
  
  // 生成 ID
  const type = item.type || 'task';
  const typePrefix: Record<string, string> = {
    bug: 'BUG',
    feature: 'FEAT',
    enhancement: 'ENH',
    performance: 'PERF',
    'tech-debt': 'DEBT',
    patch: 'PATCH',
    task: 'TASK',
  };
  const prefix = typePrefix[type] || 'ITEM';
  const existingIds = backlog.items.filter((i: any) => i.id.startsWith(prefix)).map((i: any) => i.id);
  const maxNum = existingIds.reduce((max: number, id: string) => {
    const num = parseInt(id.split('-')[1] || '0', 10);
    return Math.max(max, num);
  }, 0);
  
  const newItem = {
    id: `${prefix}-${String(maxNum + 1).padStart(3, '0')}`,
    type,
    title: item.title,
    priority: item.priority || 'medium',
    status: 'open',
    labels: item.labels || [],
    description: item.description || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...item,
  };
  
  backlog.items.push(newItem);
  
  // 更新统计
  backlog.stats = updateBacklogStats(backlog.items);
  
  // 保存
  fs.mkdirSync(path.dirname(backlogPath), { recursive: true });
  fs.writeFileSync(backlogPath, yaml.dump(backlog), 'utf-8');
  
  return {
    success: true,
    item: newItem,
    backlog_path: backlogPath,
  };
};

/**
 * 列出待办项
 */
export const backlogListHandler: BuiltinHandler = async (input, context) => {
  const { project_path, type, status, priority, limit } = input;


  const backlogPath = path.join(project_path || context.workdir, '.agent', 'backlog.yml');
  
  if (!fs.existsSync(backlogPath)) {
    return { items: [], stats: { total: 0 } };
  }
  
  const content = fs.readFileSync(backlogPath, 'utf-8');
  const backlog = yaml.load(content) || { items: [] };
  
  let items = backlog.items || [];
  
  // 过滤
  if (type) items = items.filter((i: any) => i.type === type);
  if (status) items = items.filter((i: any) => i.status === status);
  if (priority) items = items.filter((i: any) => i.priority === priority);
  
  // 排序：按优先级排序
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  items.sort((a: any, b: any) => {
    const pa = priorityOrder[a.priority] ?? 2;
    const pb = priorityOrder[b.priority] ?? 2;
    return pa - pb;
  });
  
  // 限制数量
  if (limit) items = items.slice(0, limit);
  
  return {
    items,
    stats: backlog.stats,
    total: items.length,
  };
};

/**
 * 更新待办项状态
 */
export const backlogUpdateHandler: BuiltinHandler = async (input, context) => {
  const { project_path, item_id, status, priority, assignee } = input;


  const backlogPath = path.join(project_path || context.workdir, '.agent', 'backlog.yml');
  
  if (!fs.existsSync(backlogPath)) {
    throw new Error('Backlog not found');
  }
  
  const content = fs.readFileSync(backlogPath, 'utf-8');
  const backlog = yaml.load(content);
  
  const item = backlog.items.find((i: any) => i.id === item_id);
  if (!item) {
    throw new Error(`Item not found: ${item_id}`);
  }
  
  if (status) item.status = status;
  if (priority) item.priority = priority;
  if (assignee) item.assignee = assignee;
  item.updated_at = new Date().toISOString();
  
  backlog.stats = updateBacklogStats(backlog.items);
  
  fs.writeFileSync(backlogPath, yaml.dump(backlog), 'utf-8');
  
  return { success: true, item };
};

/**
 * 解决待办项
 */
export const backlogResolveHandler: BuiltinHandler = async (input, context) => {
  const { project_path, item_id, resolution, workflow_execution_id } = input;


  const backlogPath = path.join(project_path || context.workdir, '.agent', 'backlog.yml');
  
  if (!fs.existsSync(backlogPath)) {
    throw new Error('Backlog not found');
  }
  
  const content = fs.readFileSync(backlogPath, 'utf-8');
  const backlog = yaml.load(content);
  
  const item = backlog.items.find((i: any) => i.id === item_id);
  if (!item) {
    throw new Error(`Item not found: ${item_id}`);
  }
  
  item.status = 'resolved';
  item.resolved_by = workflow_execution_id || context.executionId;
  item.resolved_at = new Date().toISOString();
  item.resolution = resolution || '';
  item.updated_at = new Date().toISOString();
  
  backlog.stats = updateBacklogStats(backlog.items);
  
  fs.writeFileSync(backlogPath, yaml.dump(backlog), 'utf-8');
  
  return { success: true, item };
};

/**
 * 智能决策下一个待处理项
 */
export const backlogDecideHandler: BuiltinHandler = async (input, context) => {
  const { project_path } = input;


  const backlogPath = path.join(project_path || context.workdir, '.agent', 'backlog.yml');
  
  if (!fs.existsSync(backlogPath)) {
    return { recommendation: null, reason: 'No backlog found' };
  }
  
  const content = fs.readFileSync(backlogPath, 'utf-8');
  const backlog = yaml.load(content);
  
  // 获取 open 状态的项
  const openItems = (backlog.items || []).filter((i: any) => i.status === 'open');
  
  if (openItems.length === 0) {
    return { recommendation: null, reason: 'No open items' };
  }
  
  // 优先级排序
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  openItems.sort((a: any, b: any) => {
    const pa = priorityOrder[a.priority] ?? 2;
    const pb = priorityOrder[b.priority] ?? 2;
    return pa - pb;
  });
  
  const topItem = openItems[0];
  
  // 类型→工作流映射
  const workflowMap: Record<string, string> = {
    bug: 'wf-bugfix',
    feature: 'wf-iterate',
    enhancement: 'wf-iterate',
    performance: 'wf-iterate',
    'tech-debt': 'wf-iterate',
    patch: 'wf-patch',
  };
  
  return {
    recommendation: topItem,
    suggested_workflow: workflowMap[topItem.type] || 'wf-iterate',
    reason: `Highest priority ${topItem.priority} item: ${topItem.title}`,
    queue: openItems.slice(0, 5),  // 前 5 个待处理项
  };
};

/**
 * 更新 Backlog 统计
 */
function updateBacklogStats(items: any[]): any {
  const stats = {
    total: items.length,
    by_type: {} as Record<string, number>,
    by_status: {} as Record<string, number>,
    by_priority: {} as Record<string, number>,
  };
  
  for (const item of items) {
    stats.by_type[item.type] = (stats.by_type[item.type] || 0) + 1;
    stats.by_status[item.status] = (stats.by_status[item.status] || 0) + 1;
    stats.by_priority[item.priority] = (stats.by_priority[item.priority] || 0) + 1;
  }
  
  return stats;
}

// ============================================
// Project State Handlers (P2)
// ============================================

/**
 * 加载项目状态
 */
export const projectLoadStateHandler: BuiltinHandler = async (input, context) => {
  const { project_path } = input;


  const statePath = path.join(project_path || context.workdir, '.agent', 'project-state.yml');
  
  if (!fs.existsSync(statePath)) {
    return {
      exists: false,
      state: null,
      message: 'Project state not found. Run wf-planning or wf-full first.',
    };
  }
  
  const content = fs.readFileSync(statePath, 'utf-8');
  const state = yaml.load(content);
  
  return {
    exists: true,
    state,
    state_path: statePath,
  };
};

/**
 * 保存项目状态
 */
export const projectSaveStateHandler: BuiltinHandler = async (input, context) => {
  const { project_path, state } = input;


  const statePath = path.join(project_path || context.workdir, '.agent', 'project-state.yml');
  
  // 加载现有状态
  let existingState: any = {
    project: { name: '', phase: 'development' },
    workflows: [],
    pending: [],
    stats: { total_executions: 0, total_tokens: 0, by_workflow: {} },
  };
  
  if (fs.existsSync(statePath)) {
    const content = fs.readFileSync(statePath, 'utf-8');
    existingState = yaml.load(content) || existingState;
  }
  
  // 合并状态
  const newState = {
    ...existingState,
    ...state,
    project: { ...existingState.project, ...state.project },
    updated_at: new Date().toISOString(),
  };
  
  // 更新统计
  if (state.last_run) {
    newState.stats.total_executions = (existingState.stats?.total_executions || 0) + 1;
    const wfId = state.last_run.workflow;
    newState.stats.by_workflow[wfId] = (newState.stats.by_workflow[wfId] || 0) + 1;
    
    // 添加到工作流历史
    newState.workflows = newState.workflows || [];
    newState.workflows.push({
      workflow: state.last_run.workflow,
      execution_id: state.last_run.execution_id,
      status: state.last_run.status,
      completed_at: state.last_run.completed_at,
    });
  }
  
  // 保存
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, yaml.dump(newState), 'utf-8');
  
  return {
    success: true,
    state: newState,
    state_path: statePath,
  };
};

/**
 * 智能决策下一步工作流
 */
export const decideNextWorkflowHandler: BuiltinHandler = async (input, context) => {
  const { project_path } = input;


  const statePath = path.join(project_path || context.workdir, '.agent', 'project-state.yml');
  const tasksPath = path.join(project_path || context.workdir, 'tasks.yml');
  const backlogPath = path.join(project_path || context.workdir, '.agent', 'backlog.yml');
  
  // 1. 检查是否有未完成的 tasks.yml
  if (fs.existsSync(tasksPath)) {
    const tasksContent = fs.readFileSync(tasksPath, 'utf-8');
    const tasks = yaml.load(tasksContent);
    
    if (tasks.tasks && tasks.tasks.length > 0) {
      const completed = tasks.tasks.filter((t: any) => t.status === 'completed').length;
      const total = tasks.tasks.length;
      
      if (completed < total) {
        return {
          decision: 'wf-continue',
          reason: `Found pending tasks: ${completed}/${total} completed`,
          pending_tasks: total - completed,
          next_workflow: 'wf-continue',
        };
      }
    }
  }
  
  // 2. 检查项目状态
  if (fs.existsSync(statePath)) {
    const stateContent = fs.readFileSync(statePath, 'utf-8');
    const state = yaml.load(stateContent);
    
    // 检查待处理项
    if (state.pending && state.pending.length > 0) {
      const pending = state.pending[0];
      const workflowMap: Record<string, string> = {
        bugfix: 'wf-bugfix',
        feature: 'wf-iterate',
        enhancement: 'wf-iterate',
        patch: 'wf-patch',
      };
      
      return {
        decision: workflowMap[pending.type] || 'wf-iterate',
        reason: `Pending item: ${pending.title}`,
        pending_item: pending,
        next_workflow: workflowMap[pending.type] || 'wf-iterate',
      };
    }
  }
  
  // 3. 检查 Backlog
  if (fs.existsSync(backlogPath)) {
    const backlogContent = fs.readFileSync(backlogPath, 'utf-8');
    const backlog = yaml.load(backlogContent);
    
    const openItems = (backlog.items || []).filter((i: any) => i.status === 'open');
    if (openItems.length > 0) {
      // 调用 backlog/decide 逻辑
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      openItems.sort((a: any, b: any) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));
      
      const topItem = openItems[0];
      const workflowMap: Record<string, string> = {
        bug: 'wf-bugfix',
        feature: 'wf-iterate',
        enhancement: 'wf-iterate',
        performance: 'wf-iterate',
        'tech-debt': 'wf-iterate',
        patch: 'wf-patch',
      };
      
      return {
        decision: workflowMap[topItem.type] || 'wf-iterate',
        reason: `Backlog item: ${topItem.title} (${topItem.priority})`,
        backlog_item: topItem,
        next_workflow: workflowMap[topItem.type] || 'wf-iterate',
      };
    }
  }
  
  // 4. 默认：询问用户
  return {
    decision: 'ask_user',
    reason: 'No pending tasks or backlog items found',
    suggestions: [
      { workflow: 'wf-iterate', description: 'Start new iteration development' },
      { workflow: 'wf-planning', description: 'Plan new features' },
      { workflow: 'wf-test', description: 'Run tests' },
    ],
  };
};

/**
 * 代码解析处理器
 * 使用 Tree-sitter 解析代码文件，提取 AST 结构
 */
export const codeParseHandler: BuiltinHandler = async (input, context) => {
  const { file_path, language, project_path } = input;
  const workdir = project_path || context?.workdir || process.cwd();
  


  const absolutePath = path.join(workdir, file_path);
  
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  
  const content = fs.readFileSync(absolutePath, 'utf-8');
  const ext = path.extname(file_path).toLowerCase();
  
  // 语言映射
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.cpp': 'cpp',
    '.c': 'c',
    '.rb': 'ruby',
    '.php': 'php',
  };
  
  const detectedLang = language || langMap[ext] || 'unknown';
  
  // 简单的正则提取（生产环境应使用 Tree-sitter）
  const functions: any[] = [];
  const classes: any[] = [];
  const imports: any[] = [];
  const exports: any[] = [];
  
  if (detectedLang === 'typescript' || detectedLang === 'javascript') {
    // 提取函数
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{\s]+))?/g;
    let match;
    while ((match = funcRegex.exec(content)) !== null) {
      functions.push({
        name: match[1],
        params: match[2].split(',').map((p: string) => p.trim()).filter(Boolean),
        returnType: match[3]?.trim(),
        lineRange: [content.substring(0, match.index).split('\n').length, 0],
      });
    }
    
    // 提取箭头函数
    const arrowRegex = /(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)(?:\s*:\s*([^=\s]+))?\s*=>/g;
    while ((match = arrowRegex.exec(content)) !== null) {
      functions.push({
        name: match[1],
        params: match[2].split(',').map((p: string) => p.trim()).filter(Boolean),
        returnType: match[3]?.trim(),
        lineRange: [content.substring(0, match.index).split('\n').length, 0],
      });
    }
    
    // 提取类
    const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{/g;
    while ((match = classRegex.exec(content)) !== null) {
      const classStart = match.index;
      const classContent = extractBlockContent(content, classStart);
      classes.push({
        name: match[1],
        extends: match[2],
        methods: extractMethods(classContent),
        properties: extractProperties(classContent),
        lineRange: [content.substring(0, classStart).split('\n').length, 0],
      });
    }
    
    // 提取导入
    const importRegex = /import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push({
        source: match[4],
        specifiers: (match[1] || match[2] || match[3] || '').split(',').map((s: string) => s.trim()).filter(Boolean),
      });
    }
    
    // 提取导出
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type|enum)\s+(\w+)/g;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push({ name: match[1] });
    }
  }
  
  // 通用 AST 节点
  const astNodes = [
    ...functions.map((f, i) => ({ id: `func-${i}`, type: 'function', ...f })),
    ...classes.map((c, i) => ({ id: `class-${i}`, type: 'class', ...c })),
  ];
  
  return {
    success: true,
    file_path,
    language: detectedLang,
    ast_nodes: astNodes,
    functions,
    classes,
    imports,
    exports,
    content_hash: crypto.createHash('sha256').update(content).digest('hex'),
    total_lines: content.split('\n').length,
  };
};

// 辅助函数：提取块内容
function extractBlockContent(content: string, startIndex: number): string {
  let braceCount = 0;
  let inBlock = false;
  let blockStart = startIndex;
  
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
      if (!inBlock) {
        inBlock = true;
        blockStart = i;
      }
      braceCount++;
    } else if (content[i] === '}') {
      braceCount--;
      if (braceCount === 0 && inBlock) {
        return content.substring(blockStart + 1, i);
      }
    }
  }
  return '';
}

// 辅助函数：提取方法
function extractMethods(classContent: string): string[] {
  const methods: string[] = [];
  const methodRegex = /(?:async\s+)?(\w+)\s*\(/g;
  let match;
  while ((match = methodRegex.exec(classContent)) !== null) {
    if (!['if', 'for', 'while', 'switch', 'catch'].includes(match[1])) {
      methods.push(match[1]);
    }
  }
  return methods;
}

// 辅助函数：提取属性
function extractProperties(classContent: string): string[] {
  const properties: string[] = [];
  const propRegex = /(?:private|public|protected)?\s*(\w+)\s*[:=]/g;
  let match;
  while ((match = propRegex.exec(classContent)) !== null) {
    if (!['constructor', 'function', 'async'].includes(match[1])) {
      properties.push(match[1]);
    }
  }
  return properties;
}

/**
 * 代码指纹处理器
 * 生成代码结构指纹，用于变更检测
 */
export const codeFingerprintHandler: BuiltinHandler = async (input, context) => {
  const { file_path, project_path, compare_with } = input;
  const workdir = project_path || context?.workdir || process.cwd();
  


  const absolutePath = path.join(workdir, file_path);
  const fingerprintPath = path.join(workdir, '.agent', 'fingerprints.json');
  
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  
  const content = fs.readFileSync(absolutePath, 'utf-8');
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');
  
  // 解析代码结构
  const parseResult = await codeParseHandler({ file_path, project_path: workdir }, context);
  
  // 构建指纹
  const fingerprint = {
    file_path,
    content_hash: contentHash,
    functions: parseResult.functions.map((f: any) => ({
      name: f.name,
      params: f.params,
      returnType: f.returnType,
    })),
    classes: parseResult.classes.map((c: any) => ({
      name: c.name,
      methods: c.methods,
      properties: c.properties,
    })),
    imports: parseResult.imports.map((i: any) => ({
      source: i.source,
      specifiers: i.specifiers,
    })),
    exports: parseResult.exports.map((e: any) => e.name),
    total_lines: parseResult.total_lines,
    has_structural_analysis: true,
    generated_at: new Date().toISOString(),
  };
  
  // 加载现有指纹库
  let existingStore: any = { version: '1.0.0', files: {} };
  if (fs.existsSync(fingerprintPath)) {
    try {
      existingStore = JSON.parse(fs.readFileSync(fingerprintPath, 'utf-8'));
    } catch (e) {
      // 忽略解析错误
    }
  }
  
  // 比较指纹
  let changeLevel = 'NONE';
  let details: string[] = [];
  
  const oldFp = existingStore.files[file_path];
  if (oldFp) {
    if (oldFp.content_hash === contentHash) {
      changeLevel = 'NONE';
    } else {
      // 比较结构
      const funcDiff = compareArrays(
        oldFp.functions.map((f: any) => f.name),
        fingerprint.functions.map((f: any) => f.name),
      );
      const classDiff = compareArrays(
        oldFp.classes.map((c: any) => c.name),
        fingerprint.classes.map((c: any) => c.name),
      );
      
      if (funcDiff.added.length > 0) details.push(`new functions: ${funcDiff.added.join(', ')}`);
      if (funcDiff.removed.length > 0) details.push(`removed functions: ${funcDiff.removed.join(', ')}`);
      if (classDiff.added.length > 0) details.push(`new classes: ${classDiff.added.join(', ')}`);
      if (classDiff.removed.length > 0) details.push(`removed classes: ${classDiff.removed.join(', ')}`);
      
      // 检查签名变更
      for (const newFn of fingerprint.functions) {
        const oldFn = oldFp.functions?.find((f: any) => f.name === newFn.name);
        if (oldFn && JSON.stringify(oldFn.params) !== JSON.stringify(newFn.params)) {
          details.push(`params changed: ${newFn.name}`);
        }
      }
      
      changeLevel = details.length > 0 ? 'STRUCTURAL' : 'COSMETIC';
      if (changeLevel === 'COSMETIC') {
        details = ['internal logic changed (no structural impact)'];
      }
    }
  } else {
    changeLevel = 'STRUCTURAL';
    details = ['new file'];
  }
  
  // 更新指纹库
  existingStore.files[file_path] = fingerprint;
  existingStore.updated_at = new Date().toISOString();
  
  fs.mkdirSync(path.dirname(fingerprintPath), { recursive: true });
  fs.writeFileSync(fingerprintPath, JSON.stringify(existingStore, null, 2));
  
  return {
    success: true,
    fingerprint,
    content_hash: contentHash,
    change_level: changeLevel,
    details,
    fingerprint_path: fingerprintPath,
  };
};

// 辅助函数：比较数组
function compareArrays(oldArr: string[], newArr: string[]): { added: string[]; removed: string[] } {
  const oldSet = new Set(oldArr);
  const newSet = new Set(newArr);
  return {
    added: newArr.filter((x) => !oldSet.has(x)),
    removed: oldArr.filter((x) => !newSet.has(x)),
  };
}

/**
 * 语言注册表
 */
const LANGUAGE_REGISTRY: Record<string, {
  extensions: string[];
  features: string[];
  patterns?: {
    function?: RegExp[];
    class?: RegExp[];
    import?: RegExp[];
    export?: RegExp[];
  };
}> = {
  typescript: {
    extensions: ['.ts', '.tsx'],
    features: ['functions', 'classes', 'interfaces', 'imports', 'exports', 'types'],
  },
  javascript: {
    extensions: ['.js', '.jsx', '.mjs', '.cjs'],
    features: ['functions', 'classes', 'imports', 'exports'],
  },
  python: {
    extensions: ['.py', '.pyw'],
    features: ['functions', 'classes', 'imports', 'decorators'],
    patterns: {
      function: [/def\s+(\w+)\s*\(([^)]*)\)/g, /async\s+def\s+(\w+)\s*\(([^)]*)\)/g],
      class: [/class\s+(\w+)(?:\(([^)]+)\))?\s*:/g],
      import: [/import\s+(\w+)/g, /from\s+([\w.]+)\s+import\s+(.+)/g],
    },
  },
  go: {
    extensions: ['.go'],
    features: ['functions', 'structs', 'interfaces', 'imports'],
    patterns: {
      function: [/func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)/g],
      class: [/type\s+(\w+)\s+struct\s*{/g],
      import: [/import\s+(?:\(([^)]+)\)|"([^"]+)")/g],
    },
  },
  rust: {
    extensions: ['.rs'],
    features: ['functions', 'structs', 'enums', 'impls', 'imports'],
    patterns: {
      function: [/(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*[<(]/g],
      class: [/(?:pub\s+)?struct\s+(\w+)/g],
      import: [/use\s+([\w:]+)(?:\s+as\s+(\w+))?/g],
    },
  },
  java: {
    extensions: ['.java'],
    features: ['classes', 'interfaces', 'methods', 'imports'],
    patterns: {
      class: [/(?:public|private|protected)?\s*class\s+(\w+)/g],
      import: [/import\s+([\w.]+);/g],
    },
  },
  cpp: {
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h'],
    features: ['functions', 'classes', 'structs', 'includes'],
    patterns: {
      function: [/[\w:*&\s]+\s+(\w+)\s*\(([^)]*)\)\s*(?:const)?\s*{/g],
      class: [/class\s+(\w+)(?:\s*:\s*(?:public|private|protected)\s+\w+)?\s*{/g],
      import: [/#include\s*[<"]([^>"]+)[>"]/g],
    },
  },
  ruby: {
    extensions: ['.rb', '.rake'],
    features: ['methods', 'classes', 'modules', 'requires'],
    patterns: {
      function: [/def\s+(?:self\.)?(\w+)(?:\(([^)]*)\))?/g],
      class: [/class\s+(\w+)(?:\s*<\s*(\w+))?/g],
      import: [/require(?:_relative)?\s+['"]([^'"]+)['"]/g],
    },
  },
  php: {
    extensions: ['.php'],
    features: ['functions', 'classes', 'interfaces', 'includes'],
    patterns: {
      function: [/function\s+(\w+)\s*\(([^)]*)\)/g],
      class: [/(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?/g],
      import: [/(?:require|include)(?:_once)?\s+['"]([^'"]+)['"]/g],
    },
  },
  swift: {
    extensions: ['.swift'],
    features: ['functions', 'classes', 'structs', 'protocols'],
    patterns: {
      function: [/func\s+(\w+)\s*\(([^)]*)\)/g],
      class: [/class\s+(\w+)(?:\s*:\s*([^{]+))?/g],
    },
  },
  kotlin: {
    extensions: ['.kt', '.kts'],
    features: ['functions', 'classes', 'interfaces', 'objects'],
    patterns: {
      function: [/fun\s+(?:\w+\.)?(\w+)\s*\(([^)]*)\)/g],
      class: [/class\s+(\w+)(?:\s*[<(])/g],
    },
  },
  scala: {
    extensions: ['.scala', '.sc'],
    features: ['functions', 'classes', 'traits', 'objects'],
    patterns: {
      function: [/def\s+(\w+)\s*\(([^)]*)\)/g],
      class: [/class\s+(\w+)(?:\s*\[([^\]]+)\])?/g],
    },
  },
  csharp: {
    extensions: ['.cs'],
    features: ['methods', 'classes', 'interfaces', 'namespaces'],
    patterns: {
      function: [/(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:[\w<>]+)\s+(\w+)\s*\(([^)]*)\)/g],
      class: [/(?:public|internal)\s+class\s+(\w+)/g],
      import: [/using\s+([\w.]+);/g],
    },
  },
  dart: {
    extensions: ['.dart'],
    features: ['functions', 'classes', 'imports'],
    patterns: {
      function: [/(?:void|[\w<>]+)\s+(\w+)\s*\(([^)]*)\)/g],
      class: [/class\s+(\w+)(?:\s+extends\s+\w+)?/g],
      import: [/import\s+['"]([^'"]+)['"]/g],
    },
  },
  lua: {
    extensions: ['.lua'],
    features: ['functions', 'tables', 'requires'],
    patterns: {
      function: [/function\s+(?:\w+:)?(\w+)\s*\(([^)]*)\)/g],
      import: [/require\s*[('"]([^)'"]+)[)'"]/g],
    },
  },
  bash: {
    extensions: ['.sh', '.bash'],
    features: ['functions', 'sources'],
    patterns: {
      function: [/function\s+(\w+)|(\w+)\s*\(\)\s*{/g],
      import: [/source\s+(['"]?)([^'"]+)\1/g],
    },
  },
  sql: {
    extensions: ['.sql'],
    features: ['tables', 'views', 'procedures', 'functions'],
    patterns: {
      function: [/create\s+(?:or\s+replace\s+)?function\s+(\w+)/gi],
      class: [/create\s+table\s+(\w+)/gi],
    },
  },
  html: {
    extensions: ['.html', '.htm'],
    features: ['elements', 'scripts', 'styles'],
  },
  css: {
    extensions: ['.css', '.scss', '.sass', '.less'],
    features: ['selectors', 'rules', 'variables'],
  },
  json: {
    extensions: ['.json', '.jsonc'],
    features: ['keys', 'values'],
  },
  yaml: {
    extensions: ['.yml', '.yaml'],
    features: ['keys', 'values'],
  },
  markdown: {
    extensions: ['.md', '.markdown'],
    features: ['headings', 'links', 'code_blocks'],
  },
};

/**
 * 语言注册处理器
 */
export const codeRegisterLanguageHandler: BuiltinHandler = async (input, context) => {
  const { language, extensions, parser_config } = input;
  
  const langKey = language.toLowerCase();
  
  // 检查是否已存在
  if (LANGUAGE_REGISTRY[langKey]) {
    // 更新现有配置
    if (extensions && Array.isArray(extensions)) {
      LANGUAGE_REGISTRY[langKey].extensions = [
        ...new Set([...LANGUAGE_REGISTRY[langKey].extensions, ...extensions]),
      ];
    }
    if (parser_config) {
      LANGUAGE_REGISTRY[langKey].patterns = {
        ...LANGUAGE_REGISTRY[langKey].patterns,
        ...parser_config,
      };
    }
    
    return {
      success: true,
      registered: true,
      language_config: LANGUAGE_REGISTRY[langKey],
      supported_features: LANGUAGE_REGISTRY[langKey].features,
      message: `Language '${language}' updated`,
    };
  }
  
  // 注册新语言
  LANGUAGE_REGISTRY[langKey] = {
    extensions: extensions || [`.${langKey}`],
    features: parser_config ? Object.keys(parser_config) : ['functions', 'classes', 'imports'],
    patterns: parser_config,
  };
  
  return {
    success: true,
    registered: true,
    language_config: LANGUAGE_REGISTRY[langKey],
    supported_features: LANGUAGE_REGISTRY[langKey].features,
    message: `Language '${language}' registered`,
  };
};

/**
 * 获取语言配置
 */
export function getLanguageConfig(language: string) {
  return LANGUAGE_REGISTRY[language.toLowerCase()];
}

/**
 * 根据文件扩展名获取语言
 */
export function detectLanguage(filePath: string): string | undefined {
  const ext = '.' + filePath.split('.').pop()?.toLowerCase();
  for (const [lang, config] of Object.entries(LANGUAGE_REGISTRY)) {
    if (config.extensions.includes(ext)) {
      return lang;
    }
  }
  return undefined;
}

/**
 * 列出所有支持的语言
 */
export function listSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_REGISTRY);
}

// 内置处理器映射（必须在所有 handler 定义之后）
export const builtinHandlers: Record<string, BuiltinHandler> = {
  'generate-tasks': generateTasksHandler,
  'load-tasks': loadTasksHandler,
  'generate-completion-report': generateCompletionReportHandler,
  'git-commit': gitCommitHandler,
  'report-failure': reportFailureHandler,
  'generate-iteration-tasks': generateIterationTasksHandler,
  'verify-completion': verifyCompletionHandler,
  'validate-tasks': validateTasksHandler,
  'split-batch': splitBatchHandler,
  // Backlog handlers
  'backlog/add': backlogAddHandler,
  'backlog/list': backlogListHandler,
  'backlog/update': backlogUpdateHandler,
  'backlog/resolve': backlogResolveHandler,
  'backlog/decide': backlogDecideHandler,
  // Project state handlers
  'project/load-state': projectLoadStateHandler,
  'project/save-state': projectSaveStateHandler,
  'decide-next-workflow': decideNextWorkflowHandler,
  // Workflow execution handler
  'execute-workflow': async (input: any, context: any) => {
    const { workflow_id, project_path, backlog_item } = input;
    const workdir = project_path || context?.workdir || process.cwd();
    
    console.log(`🔀 执行工作流: ${workflow_id}`);
    console.log(`📁 项目路径: ${workdir}`);
    if (backlog_item) {
      console.log(`📋 待办项: ${backlog_item.title || backlog_item.id}`);
    }
    
    // 工作流存在性检查 - 使用环境变量配置路径
    const workflowsBasePath = process.env.AGENT_WORKFLOWS_PATH || path.join(process.env.HOME || '~', 'agent-workflows');
    const globalWorkflowPath = path.join(workflowsBasePath, 'workflows', `${workflow_id}.yml`);
    
    if (!fs.existsSync(globalWorkflowPath)) {
      // 尝试解析 ~ 路径
      const expandedPath = workflowsBasePath.replace(/^~/, process.env.HOME || '~');
      const expandedWorkflowPath = path.join(expandedPath, 'workflows', `${workflow_id}.yml`);
      
      if (!fs.existsSync(expandedWorkflowPath)) {
        return {
          success: false,
          error: `工作流不存在: ${workflow_id}`,
          workflows_path: expandedPath,
          hint: '请设置 AGENT_WORKFLOWS_PATH 环境变量或安装 @dommaker/workflows 包',
        };
      }
    }
    
    // 读取工作流定义
    const workflowContent = fs.readFileSync(globalWorkflowPath, 'utf-8');
    const workflow = yaml.load(workflowContent) as Record<string, any>;
    
    console.log(`✅ 工作流加载成功: ${workflow.name || workflow_id}`);
    
    // 返回工作流执行信息
    // 实际执行由 workflow engine 处理
    return {
      success: true,
      workflow_id,
      workflow_name: workflow.name || workflow_id,
      workflow_path: globalWorkflowPath,
      project_path: workdir,
      backlog_item,
      steps_count: workflow.steps?.length || 0,
      message: `工作流 ${workflow_id} 已准备执行`,
    };
  },
  // Code analysis handlers
  'code_parse': codeParseHandler,
  'code_fingerprint': codeFingerprintHandler,
  'code_register_language': codeRegisterLanguageHandler,
  // Stance handlers (立场隔离机制)
  ...stanceHandlers,
  // Evolution handlers (自我进化机制)
  'evolution/report-gap': async (input: any, context: any) => {
    const { handleReportGap } = await import('../executors/evolution');
    return handleReportGap(input);
  },
  'evolution/prioritize': async (input: any, context: any) => {
    const { handlePrioritize } = await import('../executors/evolution');
    return handlePrioritize(input);
  },
  // Governance handlers (治理机制)
  'governance/create-voting-session': async (input: any, context: any) => {
    const { handleCreateVotingSession } = await import('../executors/governance');
    return handleCreateVotingSession(input, context?.workdir || process.cwd());
  },
  'governance/cast-vote': async (input: any, context: any) => {
    const { handleCastVote } = await import('../executors/governance');
    return handleCastVote(input, context?.workdir || process.cwd());
  },
  'governance/vote-tally': async (input: any, context: any) => {
    const { handleVoteTally } = await import('../executors/governance');
    return handleVoteTally(input, context?.workdir || process.cwd());
  },
  'governance/audit-task': async (input: any, context: any) => {
    const { handleAuditTask } = await import('../executors/governance');
    return handleAuditTask(input, context?.workdir || process.cwd());
  },
  'governance/impeach': async (input: any, context: any) => {
    const { handleImpeach } = await import('../executors/governance');
    return handleImpeach(input, context?.workdir || process.cwd());
  },
  'governance/track-effect': async (input: any, context: any) => {
    const { handleTrackEffect } = await import('../executors/governance');
    return handleTrackEffect(input, context?.workdir || process.cwd());
  },
  'governance/rollback': async (input: any, context: any) => {
    const { handleRollback } = await import('../executors/governance');
    return handleRollback(input, context?.workdir || process.cwd());
  },
  // Validation handlers (验证工具)
  'validation/check-reuse': async (input: any, context: any) => {
    const { execSync } = await import('child_process');
    const workflowsPath = input.workflows_path || process.env.AGENT_WORKFLOWS_PATH || path.join(process.env.HOME || '~', 'agent-workflows');
    
    const capabilityType = input.capability_type;
    const keywords = Array.isArray(input.keywords) ? input.keywords.join(',') : input.keywords;
    const description = input.description || '';
    
    console.log(`🔍 复用检查: 创建新 ${capabilityType}`);
    console.log(`关键词: ${keywords}`);
    
    // 搜索现有能力
    const searchDir = capabilityType === 'step' ? 'steps' :
                      capabilityType === 'tool' ? 'tools' : 'workflows';
    
    try {
      const expandedPath = workflowsPath.replace(/^~/, process.env.HOME || '~');
      
      // 使用 grep 搜索关键词
      let found: string[] = [];
      
      for (const keyword of input.keywords) {
        try {
          const result = execSync(
            `find ${expandedPath}/${searchDir} -name "*.yml" -exec grep -l "${keyword}" {} \\; 2>/dev/null || true`,
            { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
          );
          
          if (result.trim()) {
            found = found.concat(result.trim().split('\n'));
          }
        } catch (e) {
          // 忽略搜索错误
        }
      }
      
      // 去重
      found = [...new Set(found)];
      
      const hasReusable = found.length > 0;
      
      return {
        has_reusable: hasReusable,
        existing_capabilities: found,
        reuse_recommendation: hasReusable ? 
          (found.length >= 3 ? 'evaluate' : 'check') : 'create',
        should_create: !hasReusable,
        checked_at: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        has_reusable: false,
        existing_capabilities: [],
        reuse_recommendation: 'create',
        should_create: true,
        error: error.message,
      };
    }
  },
  // Deploy rollback handler (占位实现)
  'rollback': async (input: any, context: any) => {
    const { execSync } = await import('child_process');
    const workdir = context?.workdir || input.project_path || process.cwd();
    
    const rollbackType = input.rollback_type || 'previous_commit';
    const target = input.target;
    const forcePush = input.force_push !== false;
    
    console.log(`🔄 执行部署回滚: ${rollbackType}`);
    
    try {
      let rollbackCommit = '';
      
      if (rollbackType === 'previous_commit') {
        // 获取上一个 commit
        rollbackCommit = execSync('git rev-parse HEAD~1', { cwd: workdir, encoding: 'utf-8' }).trim();
        // 执行 reset
        execSync('git reset --hard HEAD~1', { cwd: workdir });
      } else if (rollbackType === 'tag' && target) {
        rollbackCommit = execSync(`git rev-parse ${target}`, { cwd: workdir, encoding: 'utf-8' }).trim();
        execSync(`git checkout ${target}`, { cwd: workdir });
      } else if (rollbackType === 'branch' && target) {
        rollbackCommit = execSync(`git rev-parse ${target}`, { cwd: workdir, encoding: 'utf-8' }).trim();
        execSync(`git checkout ${target}`, { cwd: workdir });
      }
      
      // 强制推送
      if (forcePush) {
        execSync('git push --force', { cwd: workdir });
      }
      
      return {
        success: true,
        rollback_commit: rollbackCommit,
        status: 'completed',
        message: `已回滚到 ${rollbackCommit.substring(0, 7)}`,
      };
    } catch (error: any) {
      return {
        success: false,
        status: 'failed',
        error: error.message,
      };
    }
  },
};
