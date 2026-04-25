/**
 * Messages Prompt Builder - messages 传递实现
 * 
 * 功能：
 * 1. 从 messages 构建 prompt（支持 full/summary/hybrid 策略）
 * 2. Token 控制（分层压缩）
 * 3. 提取关键数据
 * 
 * WA-004: messages 传递实现（1.5h）
 */

import type { AgentConfig } from '../core/types';

/**
 * Message 结构
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  stepId?: string;          // 关联步骤
  compressed?: boolean;     // 是否已压缩
  timestamp?: Date;
}

/**
 * 构建配置
 */
export interface BuildPromptConfig {
  historyStrategy: 'full' | 'summary' | 'hybrid';
  recentCount?: number;           // hybrid 模式保留最近轮次（默认 2）
  maxHistoryTokens?: number;      // 最大历史 Token（默认 50000）
}

/**
 * 默认配置
 */
const DEFAULT_RECENT_COUNT = 2;
const DEFAULT_MAX_HISTORY_TOKENS = 50000;

/**
 * Token 估算系数（简单估算）
 */
const TOKEN_RATIO = 4;  // 1 token ≈ 4 characters (English), 中文需要调整

/**
 * 构建包含 messages 的 prompt
 */
export function buildSessionPromptFromMessages(
  messages: Message[],
  currentPrompt: string,
  config: BuildPromptConfig
): string {
  const {
    historyStrategy,
    recentCount = DEFAULT_RECENT_COUNT,
    maxHistoryTokens = DEFAULT_MAX_HISTORY_TOKENS,
  } = config;

  // 空 messages
  if (!messages || messages.length === 0) {
    return currentPrompt;
  }

  switch (historyStrategy) {
    case 'full':
      return buildFullPrompt(messages, currentPrompt);
    
    case 'summary':
      return buildSummaryPrompt(messages, currentPrompt);
    
    case 'hybrid':
      return buildHybridPrompt(messages, currentPrompt, recentCount, maxHistoryTokens);
    
    default:
      return buildFullPrompt(messages, currentPrompt);
  }
}

/**
 * 完整历史模式（full）
 */
function buildFullPrompt(messages: Message[], currentPrompt: string): string {
  const history = buildPromptFromMessages(messages);
  
  return [
    '## 📋 对话历史',
    '',
    history,
    '',
    '---',
    '',
    '## 🎯 当前任务',
    '',
    currentPrompt,
  ].join('\n');
}

/**
 * 摘要模式（summary）
 */
function buildSummaryPrompt(messages: Message[], currentPrompt: string): string {
  const keyData = extractKeyDataFromMessages(messages);
  
  const summary = formatKeyData(keyData);
  
  return [
    '## 📋 前序步骤摘要',
    '',
    summary,
    '',
    '---',
    '',
    '## 🎯 当前任务',
    '',
    currentPrompt,
  ].join('\n');
}

/**
 * 混合模式（hybrid）
 * 
 * 前序消息压缩为摘要 + 最近消息完整保留
 */
function buildHybridPrompt(
  messages: Message[],
  currentPrompt: string,
  recentCount: number,
  maxHistoryTokens: number
): string {
  const totalCount = messages.length;
  
  // 前序消息（压缩）
  const oldMessages = messages.slice(0, totalCount - recentCount * 2);
  const oldSummary = oldMessages.length > 0 
    ? summarizeOldMessages(oldMessages) 
    : '';
  
  // 最近消息（完整）
  const recentMessages = messages.slice(totalCount - recentCount * 2);
  const recentHistory = buildPromptFromMessages(recentMessages);
  
  // Token 预算
  const currentPromptTokens = estimateTokens(currentPrompt);
  const historyBudget = maxHistoryTokens - currentPromptTokens - 2000;  // 保留 2000 buffer
  
  // 检查是否超限
  let recentTokens = estimateMessagesTokens(recentMessages);
  let recentHistoryStr = recentHistory;
  
  if (recentTokens > historyBudget) {
    // 超限：截断最近消息
    const truncatedRecent = truncateMessages(recentMessages, historyBudget);
    recentHistoryStr = buildPromptFromMessages(truncatedRecent);
  }
  
  const parts: string[] = [
    '## 📋 Workflow 内对话历史',
    '',
  ];
  
  if (oldSummary) {
    parts.push('### 前序步骤摘要');
    parts.push('');
    parts.push(oldSummary);
    parts.push('');
  }
  
  if (recentHistoryStr) {
    parts.push('### 最近对话（完整）');
    parts.push('');
    parts.push(recentHistoryStr);
  }
  
  parts.push('');
  parts.push('---');
  parts.push('');
  parts.push('## 🎯 当前任务');
  parts.push('');
  parts.push(currentPrompt);
  
  return parts.join('\n');
}

/**
 * 从 messages 构建 prompt
 */
export function buildPromptFromMessages(messages: Message[]): string {
  const lines: string[] = [];
  
  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? '用户' : 
                      msg.role === 'assistant' ? '助手' : '系统';
    
    const content = msg.compressed 
      ? msg.content  // 已压缩
      : truncateContent(msg.content, 5000);  // 截断到 5000 字符
    
    lines.push(`### ${roleLabel}`);
    lines.push(content);
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * 摘要旧消息
 */
function summarizeOldMessages(messages: Message[]): string {
  // 提取关键数据
  const keyData = extractKeyDataFromMessages(messages);
  
  // 按步骤组织
  const steps: Map<string, Message[]> = new Map();
  
  for (const msg of messages) {
    if (msg.stepId) {
      if (!steps.has(msg.stepId)) {
        steps.set(msg.stepId, []);
      }
      steps.get(msg.stepId)!.push(msg);
    }
  }
  
  // 构建摘要
  const summaryParts: string[] = [];
  
  for (const [stepId, msgs] of steps.entries()) {
    const stepOutput = msgs.find(m => m.role === 'assistant');
    if (stepOutput) {
      summaryParts.push(`步骤 ${stepId}: ${truncateContent(stepOutput.content, 200)}`);
    }
  }
  
  // 添加关键数据
  if (keyData.techStack) {
    summaryParts.push(`技术栈: ${keyData.techStack}`);
  }
  if (keyData.decisions) {
    summaryParts.push(`决策: ${keyData.decisions}`);
  }
  if (keyData.completed) {
    summaryParts.push(`已完成: ${keyData.completed}`);
  }
  
  return summaryParts.join('\n');
}

/**
 * 从 messages 提取关键数据
 */
export function extractKeyDataFromMessages(messages: Message[]): KeyData {
  const keyData: KeyData = {};
  
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const content = msg.content;
      
      // 提取技术栈
      const techStackMatch = content.match(/技术栈[：:]\s*([^\n]+)/);
      if (techStackMatch) {
        keyData.techStack = techStackMatch[1].trim();
      }
      
      // 提取决策
      const decisionsMatch = content.match(/决策[：:]\s*([^\n]+)/);
      if (decisionsMatch) {
        keyData.decisions = decisionsMatch[1].trim();
      }
      
      // 提取已完成
      const completedMatch = content.match(/已完成[：:]\s*([^\n]+)/);
      if (completedMatch) {
        keyData.completed = completedMatch[1].trim();
      }
      
      // 提取文件列表
      const filesMatch = content.match(/文件[：:]\s*([^\n]+)/);
      if (filesMatch) {
        keyData.files = filesMatch[1].trim();
      }
    }
  }
  
  return keyData;
}

/**
 * 格式化关键数据
 */
function formatKeyData(keyData: KeyData): string {
  const parts: string[] = [];
  
  if (keyData.techStack) parts.push(`技术栈: ${keyData.techStack}`);
  if (keyData.decisions) parts.push(`决策: ${keyData.decisions}`);
  if (keyData.completed) parts.push(`已完成: ${keyData.completed}`);
  if (keyData.files) parts.push(`文件: ${keyData.files}`);
  
  return parts.join('\n') || '无关键数据';
}

/**
 * 关键数据结构
 */
interface KeyData {
  techStack?: string;
  decisions?: string;
  completed?: string;
  files?: string;
}

/**
 * Token 估算
 */
export function estimateTokens(text: string): number {
  // 简单估算：字符数 / TOKEN_RATIO
  return Math.ceil(text.length / TOKEN_RATIO);
}

/**
 * Messages Token 估算
 */
export function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
}

/**
 * 截断内容
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  
  return content.slice(0, maxLength) + '...(已截断)';
}

/**
 * 截断 messages（按 Token 预算）
 */
function truncateMessages(messages: Message[], tokenBudget: number): Message[] {
  const result: Message[] = [];
  let currentTokens = 0;
  
  // 从最近消息开始保留（优先保留最近）
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg.content);
    
    if (currentTokens + msgTokens <= tokenBudget) {
      result.unshift(msg);
      currentTokens += msgTokens;
    } else {
      // 超限：截断此消息
      const truncatedContent = truncateContent(
        msg.content, 
        (tokenBudget - currentTokens) * TOKEN_RATIO
      );
      result.unshift({
        ...msg,
        content: truncatedContent,
        compressed: true,
      });
      break;
    }
  }
  
  return result;
}

/**
 * 嵌入 messages 到 prompt（用于 spawnAgent）
 */
export function embedMessagesIntoPrompt(messages: Message[], prompt: string): string {
  if (!messages || messages.length === 0) {
    return prompt;
  }
  
  const history = messages.map(m => 
    `${m.role === 'user' ? '用户' : '助手'}: ${truncateContent(m.content, 5000)}`
  ).join('\n\n---\n\n');
  
  return [
    '## 📋 对话历史',
    '',
    history,
    '',
    '---',
    '',
    '## 🎯 当前任务',
    '',
    prompt,
  ].join('\n');
}