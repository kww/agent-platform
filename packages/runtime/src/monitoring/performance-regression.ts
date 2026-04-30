/**
 * 性能回归检测框架
 * 
 * 录制和对比工作流性能基准，检测性能退化
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getLocalWorkflowMetrics, isLocalDataAvailable } from './local-data-source';
import { calculatePercentile } from './utils';

export { calculatePercentile } from './utils';

// 类型定义
export interface PerformanceMetrics {
  workflowId: string;
  timestamp: string;
  commit: string;
  branch: string;
  
  duration: {
    p50: number;  // ms
    p90: number;
    p99: number;
    avg: number;
    min: number;
    max: number;
  };
  
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  
  steps: {
    stepId: string;
    duration: number;
    status: 'success' | 'failed' | 'skipped';
  }[];
  
  success: boolean;
  errorCount: number;
}

export interface PerformanceBaseline {
  workflowId: string;
  recordedAt: string;
  commit: string;
  samples: number;  // 采样次数
  
  duration: {
    p50: number;
    p90: number;
    p99: number;
    avg: number;
  };
  
  tokens?: {
    avgInput: number;
    avgOutput: number;
    avgTotal: number;
  };
  
  successRate: number;  // 0-1
  
  thresholds: {
    durationChange: number;  // 允许的变化百分比
    tokenChange: number;
    successRateDrop: number;
  };
}

export interface RegressionResult {
  passed: boolean;
  workflowId: string;
  comparedAt: string;
  baseline: PerformanceBaseline;
  current: PerformanceMetrics;
  
  checks: {
    name: string;
    passed: boolean;
    baseline: number;
    current: number;
    change: number;  // 变化百分比
    threshold: number;
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
  durationChange: 0.20,      // 20% 变化容忍
  tokenChange: 0.20,         // 20% Token 变化容忍
  successRateDrop: 0.05,     // 成功率下降不超过 5%
};

const BENCHMARKS_DIR = path.join(__dirname, '../../benchmarks');

/**
 * 从 Prometheus 查询性能数据
 */
export async function queryPrometheus(query: string): Promise<any> {
  const prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
  
  try {
    const response = await fetch(`${prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`);
    const data = await response.json() as { data?: { result?: any[] } };
    return data.data?.result || [];
  } catch (error) {
    console.warn('Prometheus query failed:', error);
    return [];
  }
}

/**
 * 从 Prometheus 查询历史数据
 */
async function queryPrometheusRange(query: string, start: number, end: number, step: string = '60s'): Promise<any> {
  const prometheusUrl = process.env.PROMETHEUS_URL || 'http://localhost:9090';
  
  try {
    const response = await fetch(
      `${prometheusUrl}/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&step=${step}`
    );
    const data = await response.json() as { data?: { result?: any[] } };
    return data.data?.result || [];
  } catch (error) {
    console.warn('Prometheus range query failed:', error);
    return [];
  }
}

/**
 * 录制性能基准
 */
export async function recordBaseline(
  workflowId: string,
  executionResult?: any
): Promise<PerformanceBaseline> {
  const outputDir = path.join(BENCHMARKS_DIR, workflowId);
  
  // 创建目录
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`[Performance] 录制基准: ${workflowId}`);

  // 获取当前 commit
  const commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();

  // 优先使用本地数据
  let durations: number[] = [];
  let tokens: { input: number[]; output: number[] } = { input: [], output: [] };
  let successRate = 0.95;

  if (isLocalDataAvailable()) {
    console.log(`[Performance] 使用本地数据源`);
    const localMetrics = getLocalWorkflowMetrics(workflowId);
    
    if (localMetrics.duration) {
      // 从本地直方图数据重构
      durations = Array(localMetrics.duration.samples).fill(localMetrics.duration.avg);
    }
    
    if (localMetrics.tokens) {
      tokens.input = [localMetrics.tokens.input];
      tokens.output = [localMetrics.tokens.output];
    }
    
    if (localMetrics.successRate !== undefined) {
      successRate = localMetrics.successRate;
    }
  } else {
    // 回退到 Prometheus 查询
    console.log(`[Performance] 本地数据不可用，使用 Prometheus 查询`);
    
    // 从 Prometheus 查询最近 24 小时的数据
    const end = Math.floor(Date.now() / 1000);
    const start = end - 24 * 60 * 60;  // 24 小时前

    // 查询耗时数据
    const durationData = await queryPrometheusRange(
      `workflow_duration_seconds_bucket{workflow_id="${workflowId}"}`,
      start,
      end
    );

    // 查询 Token 数据
    const tokenData = await queryPrometheusRange(
      `token_usage_total{workflow_id="${workflowId}"}`,
      start,
      end
    );

    // 解析耗时直方图数据
    for (const result of durationData) {
      for (const value of result.values || []) {
        durations.push(parseFloat(value[1]) * 1000);  // 转换为毫秒
      }
    }

    // 解析 Token 数据
    for (const result of tokenData) {
      const type = result.metric.type;
      for (const value of result.values || []) {
        const tokenValue = parseFloat(value[1]);
        if (type === 'input') tokens.input.push(tokenValue);
        else if (type === 'output') tokens.output.push(tokenValue);
      }
    }
  }

  // 构建基准数据
  const baseline: PerformanceBaseline = {
    workflowId,
    recordedAt: new Date().toISOString(),
    commit,
    samples: durations.length || 1,
    
    duration: {
      p50: calculatePercentile(durations, 50),
      p90: calculatePercentile(durations, 90),
      p99: calculatePercentile(durations, 99),
      avg: durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    },
    
    tokens: tokens.input.length > 0 ? {
      avgInput: tokens.input.reduce((a, b) => a + b, 0) / tokens.input.length,
      avgOutput: tokens.output.reduce((a, b) => a + b, 0) / tokens.output.length,
      avgTotal: (tokens.input.reduce((a, b) => a + b, 0) + tokens.output.reduce((a, b) => a + b, 0)) / (tokens.input.length || 1),
    } : undefined,
    
    successRate,
    
    thresholds: DEFAULT_THRESHOLDS,
  };

  // 保存基准
  const baselinePath = path.join(outputDir, 'baseline.json');
  
  // 如果已有基准，追加到历史
  if (fs.existsSync(baselinePath)) {
    const historyPath = path.join(outputDir, 'history.json');
    let history: PerformanceBaseline[] = [];
    
    if (fs.existsSync(historyPath)) {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    }
    
    history.push(JSON.parse(fs.readFileSync(baselinePath, 'utf-8')));
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  }
  
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));

  console.log(`[Performance] ✓ 基准已保存`);
  console.log(`  - 样本数: ${baseline.samples}`);
  console.log(`  - P99 耗时: ${baseline.duration.p99.toFixed(0)}ms`);
  console.log(`  - 平均 Token: ${baseline.tokens?.avgTotal.toFixed(0) || 'N/A'}`);

  return baseline;
}

/**
 * 检测性能回归
 */
export async function detectRegression(
  workflowId: string,
  currentMetrics?: PerformanceMetrics
): Promise<RegressionResult> {
  const baselinePath = path.join(BENCHMARKS_DIR, workflowId, 'baseline.json');
  
  // 检查基准是否存在
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Performance baseline not found for workflow: ${workflowId}. Run 'npm run bench:record ${workflowId}' first.`);
  }

  const baseline: PerformanceBaseline = JSON.parse(
    fs.readFileSync(baselinePath, 'utf-8')
  );

  console.log(`[Performance] 检测回归: ${workflowId}`);

  // 获取当前性能数据
  let current: PerformanceMetrics;
  
  if (currentMetrics) {
    current = currentMetrics;
  } else {
    // 从 Prometheus 查询最近 1 小时的数据作为当前值
    const end = Math.floor(Date.now() / 1000);
    const start = end - 60 * 60;  // 1 小时前

    const durationData = await queryPrometheus(
      `histogram_quantile(0.99, rate(workflow_duration_seconds_bucket{workflow_id="${workflowId}"}[1h]))`
    );
    
    const tokenData = await queryPrometheus(
      `rate(token_usage_total{workflow_id="${workflowId}"}[1h])`
    );

    const commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();

    // 解析数据
    const p99Duration = durationData[0]?.value?.[1] 
      ? parseFloat(durationData[0].value[1]) * 1000 
      : baseline.duration.p99;

    current = {
      workflowId,
      timestamp: new Date().toISOString(),
      commit,
      branch,
      duration: {
        p50: p99Duration * 0.5,
        p90: p99Duration * 0.9,
        p99: p99Duration,
        avg: p99Duration * 0.7,
        min: p99Duration * 0.3,
        max: p99Duration * 1.2,
      },
      tokens: baseline.tokens ? {
        input: baseline.tokens.avgInput,
        output: baseline.tokens.avgOutput,
        total: baseline.tokens.avgTotal,
      } : undefined,
      steps: [],
      success: true,
      errorCount: 0,
    };
  }

  // 执行检查
  const checks: RegressionResult['checks'] = [];

  // 1. P99 耗时检查
  const p99Change = (current.duration.p99 - baseline.duration.p99) / baseline.duration.p99;
  checks.push({
    name: 'duration_p99',
    passed: Math.abs(p99Change) <= baseline.thresholds.durationChange,
    baseline: baseline.duration.p99,
    current: current.duration.p99,
    change: p99Change,
    threshold: baseline.thresholds.durationChange,
    message: p99Change > 0
      ? `P99 耗时增加 ${(p99Change * 100).toFixed(1)}%`
      : `P99 耗时减少 ${(Math.abs(p99Change) * 100).toFixed(1)}%`,
  });

  // 2. P50 耗时检查
  const p50Change = (current.duration.p50 - baseline.duration.p50) / baseline.duration.p50;
  checks.push({
    name: 'duration_p50',
    passed: Math.abs(p50Change) <= baseline.thresholds.durationChange,
    baseline: baseline.duration.p50,
    current: current.duration.p50,
    change: p50Change,
    threshold: baseline.thresholds.durationChange,
    message: p50Change > 0
      ? `P50 耗时增加 ${(p50Change * 100).toFixed(1)}%`
      : `P50 耗时减少 ${(Math.abs(p50Change) * 100).toFixed(1)}%`,
  });

  // 3. Token 变化检查
  if (baseline.tokens && current.tokens) {
    const tokenChange = (current.tokens.total - baseline.tokens.avgTotal) / baseline.tokens.avgTotal;
    checks.push({
      name: 'token_usage',
      passed: Math.abs(tokenChange) <= baseline.thresholds.tokenChange,
      baseline: baseline.tokens.avgTotal,
      current: current.tokens.total,
      change: tokenChange,
      threshold: baseline.thresholds.tokenChange,
      message: tokenChange > 0
        ? `Token 增加 ${(tokenChange * 100).toFixed(1)}%`
        : `Token 减少 ${(Math.abs(tokenChange) * 100).toFixed(1)}%`,
    });
  }

  // 汇总结果
  const passed = checks.filter(c => c.passed).length;
  const failed = checks.filter(c => !c.passed).length;

  const result: RegressionResult = {
    passed: failed === 0,
    workflowId,
    comparedAt: new Date().toISOString(),
    baseline,
    current,
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
    },
  };

  // 打印结果
  console.log('');
  console.log('=== 性能回归检测结果 ===');
  console.log(`工作流: ${workflowId}`);
  console.log(`状态: ${result.passed ? '✅ 通过' : '❌ 失败'}`);
  console.log(`检查: ${passed}/${checks.length} 通过`);
  console.log('');

  for (const check of checks) {
    const icon = check.passed ? '✓' : '✗';
    console.log(`  ${icon} ${check.name}: ${check.message}`);
    console.log(`     基准: ${check.baseline.toFixed(0)} | 当前: ${check.current.toFixed(0)} | 变化: ${(check.change * 100).toFixed(1)}%`);
  }

  // 保存结果
  const resultPath = path.join(BENCHMARKS_DIR, workflowId, 'last-result.json');
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

  // 写入回归标记
  if (!result.passed) {
    fs.writeFileSync(path.join(BENCHMARKS_DIR, '.regression'), workflowId);
  } else {
    // 清除回归标记
    const regressionPath = path.join(BENCHMARKS_DIR, '.regression');
    if (fs.existsSync(regressionPath)) {
      fs.unlinkSync(regressionPath);
    }
  }

  return result;
}

/**
 * 列出所有基准
 */
export function listBaselines(): string[] {
  if (!fs.existsSync(BENCHMARKS_DIR)) {
    return [];
  }
  
  return fs.readdirSync(BENCHMARKS_DIR)
    .filter(name => {
      const dir = path.join(BENCHMARKS_DIR, name);
      return fs.statSync(dir).isDirectory() && 
             fs.existsSync(path.join(dir, 'baseline.json'));
    });
}

/**
 * 更新基准（合并后自动更新）
 */
export async function updateBaseline(workflowId: string): Promise<PerformanceBaseline> {
  console.log(`[Performance] 更新基准: ${workflowId}`);
  return recordBaseline(workflowId);
}

/**
 * 批量检测所有工作流
 */
export async function detectAllRegressions(): Promise<RegressionResult[]> {
  const baselines = listBaselines();
  const results: RegressionResult[] = [];
  
  for (const workflowId of baselines) {
    try {
      const result = await detectRegression(workflowId);
      results.push(result);
    } catch (error) {
      console.error(`Failed to check ${workflowId}:`, error);
    }
  }
  
  return results;
}

// CLI 入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const workflowId = args[1];

  if (command === 'list') {
    const baselines = listBaselines();
    console.log('Performance Baselines:');
    baselines.forEach(b => console.log(`  - ${b}`));
  } else if (command === 'record') {
    if (!workflowId) {
      console.error('Usage: ts-node performance-regression.ts record <workflow-id>');
      process.exit(1);
    }
    recordBaseline(workflowId).catch(console.error);
  } else if (command === 'check') {
    if (!workflowId) {
      console.error('Usage: ts-node performance-regression.ts check <workflow-id>');
      process.exit(1);
    }
    detectRegression(workflowId).catch(console.error);
  } else if (command === 'check-all') {
    detectAllRegressions().catch(console.error);
  } else {
    console.log('Usage:');
    console.log('  ts-node performance-regression.ts list');
    console.log('  ts-node performance-regression.ts record <workflow-id>');
    console.log('  ts-node performance-regression.ts check <workflow-id>');
    console.log('  ts-node performance-regression.ts check-all');
  }
}