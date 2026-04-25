/**
 * Understand 执行器 - 生成代码库知识图谱
 * 
 * 功能：
 * 1. 调用 understand-anything skill 分析代码库
 * 2. 生成 knowledge-graph.json
 * 3. 返回知识图谱数据供后续步骤使用
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import type { UnderstandConfig, KnowledgeGraph, ExecutionContext } from '../core/types';
import { config } from '../utils/config';

const UNDERSTAND_SKILL_PATH = process.env.UNDERSTAND_SKILL_PATH || 
  path.join(process.env.HOME || '/root', '.openclaw/skills/understand-anything/understand');

export interface UnderstandResult {
  graphPath: string;
  nodes: number;
  edges: number;
  layers: number;
  graph?: KnowledgeGraph;
}

/**
 * 执行知识图谱分析
 */
export async function executeUnderstand(
  stepId: string,
  understandConfig: UnderstandConfig,
  context: ExecutionContext
): Promise<UnderstandResult> {
  const projectRoot = context.workdir || process.cwd();
  const outputPath = understandConfig.outputPath || 
    path.join(projectRoot, '.understand-anything/knowledge-graph.json');
  const metaPath = path.join(projectRoot, '.understand-anything/meta.json');

  // 1. 检查是否需要增量更新
  const shouldAnalyze = await checkIfAnalysisNeeded(
    projectRoot, 
    metaPath, 
    understandConfig.force || false
  );

  if (!shouldAnalyze) {
    // 图谱已是最新，直接读取
    const graph = await readKnowledgeGraph(outputPath);
    return {
      graphPath: outputPath,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      layers: graph.layers.length,
      graph
    };
  }

  // 2. 创建输出目录
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.mkdir(path.join(projectRoot, '.understand-anything/intermediate'), { recursive: true });
  await fs.mkdir(path.join(projectRoot, '.understand-anything/tmp'), { recursive: true });

  // 3. 执行分析
  const result = await runAnalysis(projectRoot, understandConfig, context);

  // 4. 读取生成的图谱
  const graph = await readKnowledgeGraph(outputPath);

  // 5. 更新 meta 信息
  const gitHash = await getGitCommitHash(projectRoot);
  await fs.writeFile(metaPath, JSON.stringify({
    gitCommitHash: gitHash,
    analyzedAt: new Date().toISOString(),
    version: '1.0.0',
    filesAnalyzed: graph.nodes.filter(n => n.type === 'file').length,
    nodesCount: graph.nodes.length,
    edgesCount: graph.edges.length
  }, null, 2));

  return {
    graphPath: outputPath,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    layers: graph.layers.length,
    graph
  };
}

/**
 * 检查是否需要分析
 */
async function checkIfAnalysisNeeded(
  projectRoot: string,
  metaPath: string,
  force: boolean
): Promise<boolean> {
  if (force) return true;

  try {
    const metaContent = await fs.readFile(metaPath, 'utf-8');
    const meta = JSON.parse(metaContent);
    
    const currentHash = await getGitCommitHash(projectRoot);
    if (meta.gitCommitHash === currentHash) {
      console.log('✓ Knowledge graph is up to date');
      return false;
    }
  } catch {
    // meta 不存在，需要分析
  }

  return true;
}

/**
 * 获取当前 git commit hash
 */
async function getGitCommitHash(projectRoot: string): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn('git', ['rev-parse', 'HEAD'], { cwd: projectRoot });
    let hash = '';
    proc.stdout.on('data', (data) => hash += data.toString().trim());
    proc.on('close', () => resolve(hash || 'unknown'));
    proc.on('error', () => resolve('unknown'));
  });
}

/**
 * 运行分析 - 使用 Codex 执行 understand skill
 */
async function runAnalysis(
  projectRoot: string,
  understandConfig: UnderstandConfig,
  context: ExecutionContext
): Promise<void> {
  const scope = understandConfig.scope || '';
  const scopeArg = scope ? `--scope ${scope}` : '';
  const forceArg = understandConfig.force ? '--force' : '';
  
  // 构建分析提示词
  const prompt = buildAnalysisPrompt(projectRoot, understandConfig);

  // 使用 Codex 执行分析
  return new Promise((resolve, reject) => {
    const codexPath = config.codexPath || 'codex';
    
    const proc = spawn(codexPath, [
      'exec',
      '--full-auto',
      '--skip-git-repo-check',
      prompt
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        CODING_API_KEY: process.env.CODING_API_KEY || process.env.OPENAI_API_KEY
      }
    });

    let output = '';
    let error = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
      console.log(`[Codex] ${data.toString().trim()}`);
    });

    proc.stderr.on('data', (data) => {
      error += data.toString();
      console.error(`[Codex Error] ${data.toString().trim()}`);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('✓ Analysis completed');
        resolve();
      } else {
        reject(new Error(`Analysis failed with code ${code}: ${error}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 构建分析提示词
 */
function buildAnalysisPrompt(projectRoot: string, config: UnderstandConfig): string {
  const excludeDirs = config.excludeDirs || ['node_modules', 'dist', 'coverage', '.git', 'build'];
  const includeTests = config.includeTests ? 'true' : 'false';

  return `
You are a code analysis expert. Analyze this codebase and generate a knowledge graph.

PROJECT ROOT: ${projectRoot}
SCOPE: ${config.scope || 'entire project'}
EXCLUDE DIRS: ${excludeDirs.join(', ')}
INCLUDE TESTS: ${includeTests}

## Instructions

Follow the Understand-Anything workflow:

### Phase 1: SCAN
1. Scan the project directory to discover all source files
2. Detect languages and frameworks
3. Count file lines and estimate complexity
4. Write results to .understand-anything/intermediate/scan-result.json

### Phase 2: ANALYZE
1. Batch files into groups of 5-10
2. For each file, extract:
   - Functions (name, line range, params)
   - Classes/Interfaces/Types
   - Imports (source, specifiers, resolved path)
   - Exports
3. Generate nodes with:
   - id: file:path or func:path:name
   - type: file, function, class, module, concept
   - summary: brief description
   - tags: relevant tags
   - complexity: simple, moderate, complex
4. Generate edges with:
   - source, target
   - type: imports, exports, calls, contains
   - direction: forward, backward, bidirectional
   - weight: 0-1

### Phase 3: ASSEMBLE
1. Merge all batch results
2. Create layers (core, utils, etc.)
3. Create tour steps for onboarding

### Phase 4: OUTPUT
Write the final knowledge graph to:
${config.outputPath || '.understand-anything/knowledge-graph.json'}

Format:
{
  "project": { "name", "description", "languages", "frameworks", "analyzedAt", "gitCommitHash" },
  "nodes": [...],
  "edges": [...],
  "layers": [...],
  "tour": [...]
}

After completion, report:
- Number of nodes
- Number of edges
- Number of layers
`.trim();
}

/**
 * 读取知识图谱
 */
async function readKnowledgeGraph(path: string): Promise<KnowledgeGraph> {
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content);
}
