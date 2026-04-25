/**
 * @spec HZ-002
 * @implements HZ-002-C3
 * @acceptance AC-001-3
 * 
 * Progressive Disclosure for Agent Context
 * 
 * 使用 harness ProgressiveLoader 实现 Agent 上下文渐进式披露
 */

import {
  ProgressiveLoader,
  TokenEstimator,
  TokenBudget,
  LoadResult
} from '@dommaker/harness';

export interface AgentContext {
  messages: ContextMessage[];
  tools: ToolDefinition[];
  memories: Memory[];
  files: FileReference[];
}

export interface ContextMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: Date;
  priority?: number;  // 优先级，用于排序
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface Memory {
  id: string;
  content: string;
  relevance: number;  // 相关度 0-1
  timestamp: Date;
}

export interface FileReference {
  id: string;
  name: string;
  content: string;
  size: number;
}

export interface DisclosureOptions {
  /** Token 预算 */
  tokenBudget: number;
  /** 优先保留的消息数 */
  minMessages?: number;
  /** 优先保留的工具数 */
  minTools?: number;
  /** 是否包含文件内容 */
  includeFiles?: boolean;
  /** 记忆相关度阈值 */
  memoryThreshold?: number;
}

export interface DisclosedContext {
  messages: ContextMessage[];
  tools: ToolDefinition[];
  memories: Memory[];
  files: FileReference[];
  /** Token 使用情况 */
  tokensUsed: number;
  /** 是否被截断 */
  truncated: boolean;
  /** 披露策略说明 */
  disclosureSummary: string;
}

/**
 * Agent 上下文渐进式披露器
 * 
 * 在 Token 预算范围内，智能选择和披露 Agent 上下文
 */
export class ProgressiveDisclosure {
  private loader: ProgressiveLoader;

  constructor() {
    this.loader = new ProgressiveLoader();
  }

  /**
   * 披露上下文
   * 
   * 根据 Token 预算，智能选择最重要的上下文内容
   */
  async discloseContext(
    context: AgentContext,
    options: DisclosureOptions
  ): Promise<DisclosedContext> {
    const {
      tokenBudget,
      minMessages = 3,
      minTools = 0,
      includeFiles = false,
      memoryThreshold = 0.5
    } = options;

    const budget = new TokenBudget(tokenBudget);
    const disclosed: DisclosedContext = {
      messages: [],
      tools: [],
      memories: [],
      files: [],
      tokensUsed: 0,
      truncated: false,
      disclosureSummary: ''
    };

    // 1. 优先披露系统消息（如果有）
    const systemMessages = context.messages.filter(m => m.role === 'system');
    for (const msg of systemMessages) {
      const tokens = TokenEstimator.estimateText(msg.content);
      if (budget.consume(tokens)) {
        disclosed.messages.push(msg);
      }
    }

    // 2. 披露工具定义（优先级高，通常不大）
    const toolsResult = await this.loader.loadWithBudget(context.tools, {
      budget: budget.remaining,
      estimator: (tool) => TokenEstimator.estimateObject(tool),
      onBudgetExceeded: 'truncate',
      minItems: minTools
    });

    disclosed.tools = toolsResult.items;
    budget.consume(toolsResult.tokensUsed);

    // 3. 披露用户/助手消息（按时间倒序，最近优先）
    const chatMessages = context.messages
      .filter(m => m.role !== 'system')
      .sort((a, b) => {
        // 按优先级和时间排序
        const priorityDiff = (b.priority || 0) - (a.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return b.timestamp.getTime() - a.timestamp.getTime();
      });

    const messagesResult = await this.loader.loadWithBudget(chatMessages, {
      budget: budget.remaining,
      estimator: (msg) => TokenEstimator.estimateText(msg.content),
      onBudgetExceeded: 'truncate',
      minItems: minMessages
    });

    disclosed.messages.push(...messagesResult.items);
    budget.consume(messagesResult.tokensUsed);

    // 4. 披露相关记忆（按相关度排序）
    const relevantMemories = context.memories
      .filter(m => m.relevance >= memoryThreshold)
      .sort((a, b) => b.relevance - a.relevance);

    const memoriesResult = await this.loader.loadWithBudget(relevantMemories, {
      budget: budget.remaining,
      estimator: (mem) => TokenEstimator.estimateText(mem.content),
      onBudgetExceeded: 'truncate',
      minItems: 0
    });

    disclosed.memories = memoriesResult.items;
    budget.consume(memoriesResult.tokensUsed);

    // 5. 披露文件（如果预算允许且需要）
    if (includeFiles && budget.remaining > 100) {
      const filesResult = await this.loader.loadWithBudget(context.files, {
        budget: budget.remaining,
        estimator: (file) => TokenEstimator.estimateText(file.content),
        onBudgetExceeded: 'truncate',
        minItems: 0
      });

      disclosed.files = filesResult.items;
      budget.consume(filesResult.tokensUsed);
    }

    // 统计
    disclosed.tokensUsed = budget.used;
    disclosed.truncated = budget.usageRatio > 0.9;
    disclosed.disclosureSummary = this.generateSummary(
      context,
      disclosed,
      budget
    );

    return disclosed;
  }

  /**
   * 流式披露
   * 
   * 逐步披露上下文，适用于实时场景
   */
  async *discloseContextStream(
    context: AgentContext,
    options: DisclosureOptions
  ): AsyncIterable<Partial<DisclosedContext>> {
    const fullContext = await this.discloseContext(context, options);

    // 先 yield 高优先级内容
    yield {
      messages: fullContext.messages.filter(m => m.role === 'system'),
      tools: fullContext.tools,
      tokensUsed: 0
    };

    // 再 yield 对话历史
    yield {
      messages: fullContext.messages,
      tokensUsed: fullContext.tokensUsed * 0.5
    };

    // 最后 yield 完整内容
    yield fullContext;
  }

  /**
   * 快速估算上下文 Token 数
   */
  estimateContextTokens(context: AgentContext): number {
    let total = 0;

    // 消息
    for (const msg of context.messages) {
      total += TokenEstimator.estimateText(msg.content);
    }

    // 工具
    for (const tool of context.tools) {
      total += TokenEstimator.estimateObject(tool);
    }

    // 记忆
    for (const mem of context.memories) {
      total += TokenEstimator.estimateText(mem.content);
    }

    // 文件
    if (context.files) {
      for (const file of context.files) {
        total += TokenEstimator.estimateText(file.content);
      }
    }

    return total;
  }

  /**
   * 检查是否需要披露
   */
  needsDisclosure(context: AgentContext, budget: number): boolean {
    const estimated = this.estimateContextTokens(context);
    return estimated > budget;
  }

  private generateSummary(
    original: AgentContext,
    disclosed: DisclosedContext,
    budget: TokenBudget
  ): string {
    const parts: string[] = [];

    parts.push(`Token 使用: ${disclosed.tokensUsed}/${budget.total} (${(budget.usageRatio * 100).toFixed(1)}%)`);

    if (disclosed.truncated) {
      parts.push('内容已截断以适应预算');
    }

    parts.push(`消息: ${disclosed.messages.length}/${original.messages.length}`);
    parts.push(`工具: ${disclosed.tools.length}/${original.tools.length}`);
    parts.push(`记忆: ${disclosed.memories.length}/${original.memories.length}`);
    parts.push(`文件: ${disclosed.files.length}/${original.files.length}`);

    return parts.join('; ');
  }
}

// 默认实例
export const progressiveDisclosure = new ProgressiveDisclosure();
