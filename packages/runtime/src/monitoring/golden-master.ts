/**
 * Golden Master 测试框架
 * 
 * 用于录制和验证工作流输出，防止回归
 */

import * as fs from 'fs';
import * as path from 'path';

// 类型定义
export interface GoldenMasterInput {
  workflowId: string;
  inputs: Record<string, any>;
  options?: {
    timeout?: number;
    mockAgent?: boolean;
  };
}

export interface GoldenMasterOutput {
  success: boolean;
  outputs: Record<string, any>;
  files: {
    path: string;
    content: string;
    hash: string;
  }[];
  metrics: {
    duration: number;
    tokenUsage?: {
      input: number;
      output: number;
    };
    stepCount: number;
  };
}

export interface GoldenMasterMetadata {
  workflowId: string;
  recordedAt: string;
  agentVersion: string;
  runtimeVersion: string;
  inputs: Record<string, any>;
  thresholds: {
    structureSimilarity: number;  // 结构相似度阈值 (0-1)
    fileCountDelta: number;       // 文件数量变化阈值
    tokenDelta: number;           // Token 变化阈值
  };
}

export interface GoldenMasterResult {
  passed: boolean;
  workflowId: string;
  comparedAt: string;
  checks: {
    name: string;
    passed: boolean;
    actual: number | string;
    expected: number | string;
    threshold?: number;
    message: string;
  }[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

// 配置
const DEFAULT_THRESHOLDS = {
  structureSimilarity: 0.85,  // 85% 结构相似度
  fileCountDelta: 3,          // 文件数变化 ≤3
  tokenDelta: 0.3,            // Token 变化 ≤30%
};

const GOLDEN_MASTERS_DIR = path.join(__dirname, '../../golden-masters');

/**
 * 计算字符串哈希
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * 分析文件结构
 */
export function analyzeStructure(content: string): {
  sections: string[];
  codeBlocks: number;
  lists: number;
  headings: { level: number; text: string }[];
} {
  const lines = content.split('\n');
  const sections: string[] = [];
  const headings: { level: number; text: string }[] = [];
  let codeBlocks = 0;
  let lists = 0;
  let inCodeBlock = false;

  for (const line of lines) {
    // 检测代码块
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      if (!inCodeBlock) codeBlocks++;
      continue;
    }

    // 检测标题
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      headings.push({ level, text });
      sections.push(text);
    }

    // 检测列表
    if (line.match(/^[\*\-\+]\s+/) || line.match(/^\d+\.\s+/)) {
      lists++;
    }
  }

  return { sections, codeBlocks, lists, headings };
}

/**
 * 计算结构相似度
 */
function calculateStructureSimilarity(
  actual: ReturnType<typeof analyzeStructure>,
  expected: ReturnType<typeof analyzeStructure>
): number {
  // 比对标题
  const actualHeadings = new Set(actual.headings.map(h => h.text.toLowerCase()));
  const expectedHeadings = new Set(expected.headings.map(h => h.text.toLowerCase()));
  
  const commonHeadings = [...actualHeadings].filter(h => expectedHeadings.has(h));
  const headingSimilarity = commonHeadings.length / Math.max(actualHeadings.size, expectedHeadings.size, 1);

  // 比对代码块数量
  const codeBlockDiff = Math.abs(actual.codeBlocks - expected.codeBlocks);
  const codeBlockSimilarity = 1 - Math.min(codeBlockDiff / Math.max(actual.codeBlocks, expected.codeBlocks, 1), 1);

  // 综合评分
  return (headingSimilarity * 0.7 + codeBlockSimilarity * 0.3);
}

/**
 * 录制 Golden Master
 */
export async function recordGoldenMaster(
  workflowId: string,
  inputs: Record<string, any>,
  executeWorkflow: (id: string, inputs: any) => Promise<any>
): Promise<GoldenMasterMetadata> {
  const outputDir = path.join(GOLDEN_MASTERS_DIR, workflowId);
  
  // 创建目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`[Golden Master] 录制工作流: ${workflowId}`);
  console.log(`[Golden Master] 输入:`, JSON.stringify(inputs, null, 2));

  // 执行工作流
  const startTime = Date.now();
  const result = await executeWorkflow(workflowId, inputs);
  const duration = Date.now() - startTime;

  // 构建输出
  const output: GoldenMasterOutput = {
    success: result.success,
    outputs: result.outputs || {},
    files: [],
    metrics: {
      duration,
      tokenUsage: result.tokenUsage,
      stepCount: result.stepCount || 0,
    },
  };

  // 收集输出文件
  if (result.outputDir && fs.existsSync(result.outputDir)) {
    const files = collectFiles(result.outputDir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      output.files.push({
        path: path.relative(result.outputDir, file),
        content: content.slice(0, 10000), // 限制内容大小
        hash: hashContent(content),
      });
    }
  }

  // 保存输出
  fs.writeFileSync(
    path.join(outputDir, 'output.json'),
    JSON.stringify(output, null, 2)
  );

  // 保存输入
  fs.writeFileSync(
    path.join(outputDir, 'input.json'),
    JSON.stringify(inputs, null, 2)
  );

  // 保存元数据
  const metadata: GoldenMasterMetadata = {
    workflowId,
    recordedAt: new Date().toISOString(),
    agentVersion: process.env.npm_package_version || 'unknown',
    runtimeVersion: process.version,
    inputs,
    thresholds: DEFAULT_THRESHOLDS,
  };

  fs.writeFileSync(
    path.join(outputDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  console.log(`[Golden Master] ✓ 录制完成`);
  console.log(`[Golden Master]   - 文件数: ${output.files.length}`);
  console.log(`[Golden Master]   - 耗时: ${duration}ms`);

  return metadata;
}

/**
 * 验证 Golden Master
 */
export async function verifyGoldenMaster(
  workflowId: string,
  executeWorkflow: (id: string, inputs: any) => Promise<any>
): Promise<GoldenMasterResult> {
  const outputDir = path.join(GOLDEN_MASTERS_DIR, workflowId);

  // 检查 Golden Master 是否存在
  if (!fs.existsSync(outputDir)) {
    throw new Error(`Golden Master not found for workflow: ${workflowId}`);
  }

  // 加载期望数据
  const expected: GoldenMasterOutput = JSON.parse(
    fs.readFileSync(path.join(outputDir, 'output.json'), 'utf-8')
  );
  const input: Record<string, any> = JSON.parse(
    fs.readFileSync(path.join(outputDir, 'input.json'), 'utf-8')
  );
  const metadata: GoldenMasterMetadata = JSON.parse(
    fs.readFileSync(path.join(outputDir, 'metadata.json'), 'utf-8')
  );

  console.log(`[Golden Master] 验证工作流: ${workflowId}`);

  // 执行工作流
  const startTime = Date.now();
  const result = await executeWorkflow(workflowId, input);
  const duration = Date.now() - startTime;

  // 构建实际输出
  const actual: GoldenMasterOutput = {
    success: result.success,
    outputs: result.outputs || {},
    files: [],
    metrics: {
      duration,
      tokenUsage: result.tokenUsage,
      stepCount: result.stepCount || 0,
    },
  };

  // 收集输出文件
  if (result.outputDir && fs.existsSync(result.outputDir)) {
    const files = collectFiles(result.outputDir);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      actual.files.push({
        path: path.relative(result.outputDir, file),
        content: content.slice(0, 10000),
        hash: hashContent(content),
      });
    }
  }

  // 执行检查
  const checks: GoldenMasterResult['checks'] = [];

  // 1. 执行成功检查
  checks.push({
    name: 'execution_success',
    passed: actual.success === expected.success,
    actual: actual.success ? 'success' : 'failed',
    expected: expected.success ? 'success' : 'failed',
    message: actual.success === expected.success 
      ? '执行状态一致' 
      : `执行状态不一致: 期望 ${expected.success}, 实际 ${actual.success}`,
  });

  // 2. 文件数量检查
  const fileCountDelta = Math.abs(actual.files.length - expected.files.length);
  checks.push({
    name: 'file_count',
    passed: fileCountDelta <= metadata.thresholds.fileCountDelta,
    actual: actual.files.length,
    expected: expected.files.length,
    threshold: metadata.thresholds.fileCountDelta,
    message: fileCountDelta <= metadata.thresholds.fileCountDelta
      ? `文件数量变化: ${fileCountDelta} (阈值: ${metadata.thresholds.fileCountDelta})`
      : `文件数量变化过大: ${fileCountDelta} > ${metadata.thresholds.fileCountDelta}`,
  });

  // 3. 结构相似度检查（逐文件）
  for (const expectedFile of expected.files) {
    const actualFile = actual.files.find(f => f.path === expectedFile.path);
    
    if (!actualFile) {
      checks.push({
        name: `file_exists_${expectedFile.path}`,
        passed: false,
        actual: 'missing',
        expected: 'present',
        message: `文件丢失: ${expectedFile.path}`,
      });
      continue;
    }

    const actualStructure = analyzeStructure(actualFile.content);
    const expectedStructure = analyzeStructure(expectedFile.content);
    const similarity = calculateStructureSimilarity(actualStructure, expectedStructure);

    checks.push({
      name: `structure_similarity_${expectedFile.path}`,
      passed: similarity >= metadata.thresholds.structureSimilarity,
      actual: similarity,
      expected: metadata.thresholds.structureSimilarity,
      threshold: metadata.thresholds.structureSimilarity,
      message: similarity >= metadata.thresholds.structureSimilarity
        ? `${expectedFile.path} 结构相似度: ${(similarity * 100).toFixed(1)}%`
        : `${expectedFile.path} 结构相似度过低: ${(similarity * 100).toFixed(1)}% < ${(metadata.thresholds.structureSimilarity * 100)}%`,
    });
  }

  // 4. Token 使用检查
  if (expected.metrics.tokenUsage && actual.metrics.tokenUsage) {
    const tokenDelta = Math.abs(
      (actual.metrics.tokenUsage.input + actual.metrics.tokenUsage.output) -
      (expected.metrics.tokenUsage.input + expected.metrics.tokenUsage.output)
    ) / (expected.metrics.tokenUsage.input + expected.metrics.tokenUsage.output);

    checks.push({
      name: 'token_usage',
      passed: tokenDelta <= metadata.thresholds.tokenDelta,
      actual: actual.metrics.tokenUsage.input + actual.metrics.tokenUsage.output,
      expected: expected.metrics.tokenUsage.input + expected.metrics.tokenUsage.output,
      threshold: metadata.thresholds.tokenDelta,
      message: tokenDelta <= metadata.thresholds.tokenDelta
        ? `Token 变化: ${(tokenDelta * 100).toFixed(1)}%`
        : `Token 变化过大: ${(tokenDelta * 100).toFixed(1)}% > ${(metadata.thresholds.tokenDelta * 100)}%`,
    });
  }

  // 5. 耗时检查（警告性质）
  const durationDelta = Math.abs(actual.metrics.duration - expected.metrics.duration);
  const durationPercentChange = durationDelta / expected.metrics.duration;
  checks.push({
    name: 'duration',
    passed: durationPercentChange <= 0.5, // 50% 容忍度
    actual: `${actual.metrics.duration}ms`,
    expected: `${expected.metrics.duration}ms`,
    message: `耗时变化: ${(durationPercentChange * 100).toFixed(1)}%`,
  });

  // 汇总结果
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;

  const result_final: GoldenMasterResult = {
    passed: failed === 0,
    workflowId,
    comparedAt: new Date().toISOString(),
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
    },
  };

  // 打印结果
  console.log('');
  console.log('=== Golden Master 验证结果 ===');
  console.log(`工作流: ${workflowId}`);
  console.log(`状态: ${result_final.passed ? '✅ 通过' : '❌ 失败'}`);
  console.log(`检查: ${passed}/${checks.length} 通过`);
  console.log('');
  
  for (const check of checks) {
    const icon = check.passed ? '✓' : '✗';
    console.log(`  ${icon} ${check.name}: ${check.message}`);
  }

  return result_final;
}

/**
 * 列出所有 Golden Masters
 */
export function listGoldenMasters(): string[] {
  if (!fs.existsSync(GOLDEN_MASTERS_DIR)) {
    return [];
  }
  
  return fs.readdirSync(GOLDEN_MASTERS_DIR)
    .filter(name => {
      const dir = path.join(GOLDEN_MASTERS_DIR, name);
      return fs.statSync(dir).isDirectory() && 
             fs.existsSync(path.join(dir, 'output.json'));
    });
}

/**
 * 收集目录下的所有文件
 */
function collectFiles(dir: string): string[] {
  const files: string[] = [];
  
  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        // 跳过隐藏目录和 node_modules
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        // 跳过隐藏文件
        if (!entry.name.startsWith('.')) {
          files.push(fullPath);
        }
      }
    }
  }
  
  walk(dir);
  return files;
}

// CLI 入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const workflowId = args[1];

  if (command === 'list') {
    const masters = listGoldenMasters();
    console.log('Golden Masters:');
    masters.forEach(m => console.log(`  - ${m}`));
  } else if (command === 'record') {
    if (!workflowId) {
      console.error('Usage: ts-node golden-master.ts record <workflow-id>');
      process.exit(1);
    }
    console.log(`Recording ${workflowId}...`);
    // 实际录制需要 executeWorkflow 函数
  } else if (command === 'verify') {
    if (!workflowId) {
      console.error('Usage: ts-node golden-master.ts verify <workflow-id>');
      process.exit(1);
    }
    console.log(`Verifying ${workflowId}...`);
    // 实际验证需要 executeWorkflow 函数
  } else {
    console.log('Usage:');
    console.log('  ts-node golden-master.ts list');
    console.log('  ts-node golden-master.ts record <workflow-id>');
    console.log('  ts-node golden-master.ts verify <workflow-id>');
  }
}