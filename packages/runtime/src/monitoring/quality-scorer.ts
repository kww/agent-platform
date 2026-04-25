/**
 * 质量评分系统
 * 
 * 复用现有模块：
 * - Prometheus 查询（performance-regression）
 * - 结构分析（golden-master）
 * - 百分位计算（performance-regression）
 */

import * as fs from 'fs';
import * as path from 'path';
import { queryPrometheus, calculatePercentile } from './performance-regression';
import { analyzeStructure } from './golden-master';
import { getLocalWorkflowMetrics, isLocalDataAvailable, getAllWorkflowMetrics } from './local-data-source';

// 类型定义
export interface DimensionScore {
  score: number;      // 0-100
  weight: number;     // 权重
  value: number;      // 原始值
  grade: 'A' | 'B' | 'C' | 'D';
  details?: Record<string, any>;
}

export interface QualityScore {
  workflowId: string;
  score: number;      // 总分 0-100
  grade: 'A' | 'B' | 'C' | 'D';
  timestamp: string;
  
  dimensions: {
    successRate: DimensionScore;
    efficiency: DimensionScore;
    tokenEfficiency: DimensionScore;
    outputQuality: DimensionScore;
  };
  
  trend?: {
    previousScore: number;
    change: number;
    direction: 'improving' | 'declining' | 'stable';
  };
  
  recommendations: string[];
}

export interface QualityReport {
  workflowId: string;
  generatedAt: string;
  score: QualityScore;
  history: QualityScore[];
  analysis: {
    strengths: string[];
    weaknesses: string[];
    improvements: string[];
  };
}

// 评分权重
const WEIGHTS = {
  successRate: 0.40,
  efficiency: 0.25,
  tokenEfficiency: 0.20,
  outputQuality: 0.15,
};

// 等级划分
function getGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  return 'D';
}

// Token 效率基准（行/Token）
const TOKEN_EFFICIENCY_BENCHMARKS = {
  excellent: 0.015,
  good: 0.010,
  acceptable: 0.005,
};

/**
 * 获取成功率（优先本地数据）
 */
async function getSuccessRate(workflowId: string): Promise<number> {
  // 优先使用本地数据
  if (isLocalDataAvailable()) {
    const localMetrics = getLocalWorkflowMetrics(workflowId);
    if (localMetrics.successRate !== undefined) {
      return localMetrics.successRate;
    }
  }
  
  // 回退到 Prometheus 查询
  const result = await queryPrometheus(
    `sum(rate(workflow_completed_total{workflow_id="${workflowId}"}[24h])) / sum(rate(workflow_started_total{workflow_id="${workflowId}"}[24h]))`
  );
  
  if (result.length === 0 || !result[0]?.value) {
    return 0;
  }
  
  return parseFloat(result[0].value[1]) || 0;
}

/**
 * 获取耗时数据（优先本地数据）
 */
async function getDurations(workflowId: string): Promise<number[]> {
  // 优先使用本地数据
  if (isLocalDataAvailable()) {
    const localMetrics = getLocalWorkflowMetrics(workflowId);
    if (localMetrics.duration) {
      // 重构采样数据
      const d = localMetrics.duration;
      return [
        ...Array(Math.floor(d.samples * 0.5)).fill(d.p50),
        ...Array(Math.floor(d.samples * 0.4)).fill(d.p90),
        ...Array(Math.floor(d.samples * 0.1)).fill(d.p99),
      ];
    }
  }
  
  // 回退到 Prometheus 查询
  const result = await queryPrometheus(
    `workflow_duration_seconds_bucket{workflow_id="${workflowId}"}`
  );
  
  const durations: number[] = [];
  
  for (const item of result) {
    const value = parseFloat(item.value?.[1] || '0');
    if (value > 0) {
      durations.push(value * 1000); // 转换为毫秒
    }
  }
  
  return durations;
}

/**
 * 获取 Token 效率（优先本地数据）
 */
async function getTokenEfficiency(workflowId: string): Promise<{
  totalTokens: number;
  efficiency: number;
}> {
  // 优先使用本地数据
  if (isLocalDataAvailable()) {
    const localMetrics = getLocalWorkflowMetrics(workflowId);
    if (localMetrics.tokens) {
      const totalTokens = localMetrics.tokens.total;
      const efficiency = totalTokens > 0 ? (totalTokens / 100) / totalTokens : 0;
      return { totalTokens, efficiency };
    }
  }
  
  // 回退到 Prometheus 查询
  const inputResult = await queryPrometheus(
    `sum(rate(token_usage_total{workflow_id="${workflowId}",type="input"}[24h]))`
  );
  
  const outputResult = await queryPrometheus(
    `sum(rate(token_usage_total{workflow_id="${workflowId}",type="output"}[24h]))`
  );
  
  const inputTokens = parseFloat(inputResult[0]?.value?.[1] || '0');
  const outputTokens = parseFloat(outputResult[0]?.value?.[1] || '0');
  const totalTokens = inputTokens + outputTokens;
  
  // 估算有效输出（简化计算）
  // 假设每 1000 token 产生约 10 行代码或文档
  const estimatedLines = totalTokens / 100;
  const efficiency = totalTokens > 0 ? estimatedLines / totalTokens : 0;
  
  return { totalTokens, efficiency };
}

/**
 * 计算输出质量
 */
function calculateOutputQuality(outputDir: string): {
  score: number;
  structureScore: number;
  completenessScore: number;
  files: number;
} {
  if (!fs.existsSync(outputDir)) {
    return { score: 0, structureScore: 0, completenessScore: 0, files: 0 };
  }
  
  const files = fs.readdirSync(outputDir, { recursive: true }) as string[];
  let totalStructureScore = 0;
  let totalCompletenessScore = 0;
  let analyzedFiles = 0;
  
  for (const file of files) {
    const filePath = path.join(outputDir, file);
    
    // 跳过目录和非文本文件
    if (fs.statSync(filePath).isDirectory()) continue;
    if (!file.endsWith('.md') && !file.endsWith('.ts') && !file.endsWith('.json')) continue;
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const structure = analyzeStructure(content);
      
      // 结构评分：标题、代码块、列表
      const structureScore = Math.min(100, 
        structure.headings.length * 5 + 
        structure.codeBlocks * 10 + 
        Math.min(structure.lists * 2, 20)
      );
      
      // 完整度评分：内容长度、结构完整性
      const completenessScore = Math.min(100,
        (content.length / 100) +  // 内容量
        (structure.headings.length > 0 ? 20 : 0) +  // 有标题
        (structure.codeBlocks > 0 ? 20 : 0) +  // 有代码
        (structure.sections.length > 3 ? 20 : 0)  // 有章节
      );
      
      totalStructureScore += structureScore;
      totalCompletenessScore += completenessScore;
      analyzedFiles++;
    } catch (e) {
      // 忽略读取错误
    }
  }
  
  const avgStructureScore = analyzedFiles > 0 ? totalStructureScore / analyzedFiles : 0;
  const avgCompletenessScore = analyzedFiles > 0 ? totalCompletenessScore / analyzedFiles : 0;
  
  return {
    score: (avgStructureScore + avgCompletenessScore) / 2,
    structureScore: avgStructureScore,
    completenessScore: avgCompletenessScore,
    files: analyzedFiles,
  };
}

/**
 * 计算质量评分
 */
export async function calculateQualityScore(
  workflowId: string,
  outputDir?: string
): Promise<QualityScore> {
  console.log(`[Quality] 计算质量评分: ${workflowId}`);
  
  const recommendations: string[] = [];
  
  // 1. 成功率维度
  const successRateValue = await getSuccessRate(workflowId);
  const successRateScore = successRateValue * 100;
  const successRateGrade = getGrade(successRateScore);
  
  if (successRateScore < 90) {
    recommendations.push(`成功率 ${successRateScore.toFixed(1)}% 低于 90%，建议检查失败原因`);
  }
  
  const successRate: DimensionScore = {
    score: successRateScore,
    weight: WEIGHTS.successRate,
    value: successRateValue,
    grade: successRateGrade,
    details: { rate: successRateValue },
  };
  
  // 2. 效率维度
  const durations = await getDurations(workflowId);
  let efficiencyScore = 80; // 默认值
  let p99 = 0;
  
  if (durations.length > 0) {
    p99 = calculatePercentile(durations, 99);
    const p50 = calculatePercentile(durations, 50);
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    
    // 假设基准为 60 秒
    const baseline = 60000;
    efficiencyScore = Math.min(100, Math.max(0, (baseline / p99) * 80 + 20));
    
    if (p99 > baseline * 1.2) {
      recommendations.push(`P99 耗时 ${(p99 / 1000).toFixed(1)}s 超过基准 ${(baseline / 1000).toFixed(0)}s，建议优化`);
    }
  }
  
  const efficiency: DimensionScore = {
    score: efficiencyScore,
    weight: WEIGHTS.efficiency,
    value: p99,
    grade: getGrade(efficiencyScore),
    details: { p99, samples: durations.length },
  };
  
  // 3. Token 效率维度
  const { totalTokens, efficiency: tokenEff } = await getTokenEfficiency(workflowId);
  let tokenEfficiencyScore = 70; // 默认值
  
  if (tokenEff > 0) {
    if (tokenEff >= TOKEN_EFFICIENCY_BENCHMARKS.excellent) {
      tokenEfficiencyScore = 95;
    } else if (tokenEff >= TOKEN_EFFICIENCY_BENCHMARKS.good) {
      tokenEfficiencyScore = 85;
    } else if (tokenEff >= TOKEN_EFFICIENCY_BENCHMARKS.acceptable) {
      tokenEfficiencyScore = 70;
    } else {
      tokenEfficiencyScore = 50;
      recommendations.push(`Token 效率 ${(tokenEff * 1000).toFixed(2)} 行/千Token，低于基准，建议优化提示词`);
    }
  }
  
  const tokenEfficiency: DimensionScore = {
    score: tokenEfficiencyScore,
    weight: WEIGHTS.tokenEfficiency,
    value: tokenEff,
    grade: getGrade(tokenEfficiencyScore),
    details: { totalTokens, efficiency: tokenEff },
  };
  
  // 4. 输出质量维度
  const outputQualityData = outputDir 
    ? calculateOutputQuality(outputDir)
    : { score: 75, structureScore: 75, completenessScore: 75, files: 0 };
  
  if (outputQualityData.score < 70) {
    recommendations.push(`输出质量评分 ${outputQualityData.score.toFixed(0)}，建议改进文档结构或代码质量`);
  }
  
  const outputQuality: DimensionScore = {
    score: outputQualityData.score,
    weight: WEIGHTS.outputQuality,
    value: outputQualityData.score,
    grade: getGrade(outputQualityData.score),
    details: outputQualityData,
  };
  
  // 5. 计算总分
  const totalScore = 
    successRateScore * WEIGHTS.successRate +
    efficiencyScore * WEIGHTS.efficiency +
    tokenEfficiencyScore * WEIGHTS.tokenEfficiency +
    outputQualityData.score * WEIGHTS.outputQuality;
  
  const grade = getGrade(totalScore);
  
  // 6. 获取趋势
  const trend = await getTrend(workflowId, totalScore);
  
  const result: QualityScore = {
    workflowId,
    score: Math.round(totalScore * 10) / 10,
    grade,
    timestamp: new Date().toISOString(),
    dimensions: {
      successRate,
      efficiency,
      tokenEfficiency,
      outputQuality,
    },
    trend,
    recommendations,
  };
  
  // 保存评分历史
  saveScoreHistory(workflowId, result);
  
  return result;
}

/**
 * 获取趋势
 */
async function getTrend(workflowId: string, currentScore: number): Promise<QualityScore['trend']> {
  const historyPath = path.join(__dirname, '../../quality-scores', workflowId, 'history.json');
  
  if (!fs.existsSync(historyPath)) {
    return undefined;
  }
  
  try {
    const history: QualityScore[] = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    if (history.length === 0) return undefined;
    
    const previousScore = history[history.length - 1].score;
    const change = currentScore - previousScore;
    
    return {
      previousScore,
      change: Math.round(change * 10) / 10,
      direction: change > 2 ? 'improving' : change < -2 ? 'declining' : 'stable',
    };
  } catch {
    return undefined;
  }
}

/**
 * 保存评分历史
 */
function saveScoreHistory(workflowId: string, score: QualityScore): void {
  const outputDir = path.join(__dirname, '../../quality-scores', workflowId);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const historyPath = path.join(outputDir, 'history.json');
  let history: QualityScore[] = [];
  
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
    } catch {
      history = [];
    }
  }
  
  // 只保留最近 30 条记录
  history.push(score);
  if (history.length > 30) {
    history = history.slice(-30);
  }
  
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  
  // 保存最新评分
  fs.writeFileSync(
    path.join(outputDir, 'latest.json'),
    JSON.stringify(score, null, 2)
  );
}

/**
 * 批量计算所有工作流评分
 */
export async function calculateAllScores(): Promise<QualityScore[]> {
  // 优先使用本地数据
  if (isLocalDataAvailable()) {
    console.log('[Quality] 使用本地数据源计算所有评分');
    const allMetrics = getAllWorkflowMetrics();
    const scores: QualityScore[] = [];
    
    for (const [workflowId, metrics] of allMetrics) {
      try {
        // 直接从本地指标构建评分
        const score = await calculateQualityScore(workflowId);
        scores.push(score);
      } catch (error) {
        console.error(`Failed to calculate score for ${workflowId}:`, error);
      }
    }
    
    return scores.sort((a, b) => b.score - a.score);
  }
  
  // 回退到 Prometheus 查询
  console.log('[Quality] 本地数据不可用，使用 Prometheus 查询');
  const result = await queryPrometheus('workflow_started_total');
  const workflowIds = new Set<string>();
  
  for (const item of result) {
    const workflowId = item.metric?.workflow_id;
    if (workflowId) {
      workflowIds.add(workflowId);
    }
  }
  
  const scores: QualityScore[] = [];
  
  for (const workflowId of workflowIds) {
    try {
      const score = await calculateQualityScore(workflowId);
      scores.push(score);
    } catch (error) {
      console.error(`Failed to calculate score for ${workflowId}:`, error);
    }
  }
  
  // 按分数排序
  return scores.sort((a, b) => b.score - a.score);
}

/**
 * 生成质量报告
 */
export async function generateQualityReport(workflowId: string): Promise<QualityReport> {
  const score = await calculateQualityScore(workflowId);
  
  // 获取历史
  const historyPath = path.join(__dirname, '../../quality-scores', workflowId, 'history.json');
  let history: QualityScore[] = [];
  
  if (fs.existsSync(historyPath)) {
    history = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));
  }
  
  // 分析优势和劣势
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const improvements: string[] = [];
  
  const dims = score.dimensions;
  
  if (dims.successRate.grade === 'A') {
    strengths.push(`成功率高 (${dims.successRate.value.toFixed(1)}%)`);
  } else if (dims.successRate.grade === 'D') {
    weaknesses.push(`成功率低 (${dims.successRate.value.toFixed(1)}%)`);
  }
  
  if (dims.efficiency.grade === 'A') {
    strengths.push(`执行效率优秀`);
  } else if (dims.efficiency.grade === 'D') {
    weaknesses.push(`执行效率低 (P99: ${(dims.efficiency.value / 1000).toFixed(1)}s)`);
    improvements.push('优化耗时较长的步骤');
  }
  
  if (dims.tokenEfficiency.grade === 'D') {
    weaknesses.push(`Token 效率低`);
    improvements.push('优化提示词减少无效输出');
  }
  
  if (dims.outputQuality.grade === 'D') {
    weaknesses.push(`输出质量不足`);
    improvements.push('改进文档结构和代码规范');
  }
  
  return {
    workflowId,
    generatedAt: new Date().toISOString(),
    score,
    history,
    analysis: {
      strengths,
      weaknesses,
      improvements: improvements.length > 0 ? improvements : ['当前质量良好，继续保持'],
    },
  };
}

/**
 * 列出所有评分
 */
export function listScores(): { workflowId: string; score: number; grade: string }[] {
  const scoresDir = path.join(__dirname, '../../quality-scores');
  
  if (!fs.existsSync(scoresDir)) {
    return [];
  }
  
  const results: { workflowId: string; score: number; grade: string }[] = [];
  
  const dirs = fs.readdirSync(scoresDir);
  for (const dir of dirs) {
    const latestPath = path.join(scoresDir, dir, 'latest.json');
    if (fs.existsSync(latestPath)) {
      try {
        const score: QualityScore = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
        results.push({
          workflowId: score.workflowId,
          score: score.score,
          grade: score.grade,
        });
      } catch {
        // 忽略错误
      }
    }
  }
  
  return results.sort((a, b) => b.score - a.score);
}

// CLI 入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const workflowId = args[1];
  
  if (command === 'score') {
    if (!workflowId) {
      console.error('Usage: ts-node quality-scorer.ts score <workflow-id>');
      process.exit(1);
    }
    calculateQualityScore(workflowId).then(score => {
      console.log('\n=== 质量评分结果 ===');
      console.log(`工作流: ${score.workflowId}`);
      console.log(`总分: ${score.score} (${score.grade})`);
      console.log('\n维度评分:');
      for (const [name, dim] of Object.entries(score.dimensions)) {
        console.log(`  ${name}: ${dim.score.toFixed(1)} (${dim.grade})`);
      }
      if (score.recommendations.length > 0) {
        console.log('\n建议:');
        score.recommendations.forEach(r => console.log(`  - ${r}`));
      }
    }).catch(console.error);
  } else if (command === 'all') {
    calculateAllScores().then(scores => {
      console.log('\n=== 所有工作流质量评分 ===\n');
      console.log('工作流'.padEnd(30) + '评分'.padStart(8) + '等级'.padStart(6));
      console.log('-'.repeat(46));
      scores.forEach(s => {
        console.log(s.workflowId.padEnd(30) + s.score.toFixed(1).padStart(8) + s.grade.padStart(6));
      });
    }).catch(console.error);
  } else if (command === 'report') {
    if (!workflowId) {
      console.error('Usage: ts-node quality-scorer.ts report <workflow-id>');
      process.exit(1);
    }
    generateQualityReport(workflowId).then(report => {
      console.log(JSON.stringify(report, null, 2));
    }).catch(console.error);
  } else if (command === 'list') {
    const scores = listScores();
    console.log('工作流'.padEnd(30) + '评分'.padStart(8) + '等级'.padStart(6));
    console.log('-'.repeat(46));
    scores.forEach(s => {
      console.log(s.workflowId.padEnd(30) + s.score.toFixed(1).padStart(8) + s.grade.padStart(6));
    });
  } else {
    console.log('Usage:');
    console.log('  ts-node quality-scorer.ts score <workflow-id>');
    console.log('  ts-node quality-scorer.ts all');
    console.log('  ts-node quality-scorer.ts report <workflow-id>');
    console.log('  ts-node quality-scorer.ts list');
  }
}