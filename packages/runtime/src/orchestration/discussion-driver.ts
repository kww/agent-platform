/**
 * 讨论驱动器
 * 
 * 功能：
 * 1. 轮次调度（自动安排角色发言）
 * 2. 共识检查（判断是否达成一致）
 * 3. 用户干预机制（关键决策点）
 * 4. 讨论终止条件（超时/共识/分歧）
 * 
 * 使用示例：
 * ```typescript
 * const driver = new DiscussionDriver({
 *   contextSharer,
 *   llmClient,
 *   messageSender,
 *   maxRounds: 10,
 * });
 * 
 * const result = await driver.runDiscussion('meeting-123', '选择数据库方案');
 * ```
 */

import type { ContextSharer } from './context-sharer';

/**
 * 讨论驱动器配置
 */
export interface DiscussionDriverConfig {
  contextSharer: ContextSharer;
  llmClient: LLMClient;
  messageSender: MessageSender;
  maxRounds?: number;
  consensusThreshold?: number;
  timeout?: number;
  eventEmitter?: {
    emit(event: string, data: any): void;
  };
}

/**
 * LLM 客户端接口
 */
export interface LLMClient {
  chat(prompt: string, options?: LLMOptions): Promise<string>;
}

/**
 * LLM 选项
 */
export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/**
 * 消息发送器接口
 */
export interface MessageSender {
  send(meetingId: string, roleId: string, content: string): Promise<MessageSendResult>;
}

/**
 * 消息发送结果
 */
export interface MessageSendResult {
  messageId: string;
  timestamp: string;
}

/**
 * 角色信息
 */
export interface Role {
  roleId: string;
  name: string;
  stance: string;
  expertise?: string[];
  lastSpeakRound?: number;
  speakCount?: number;
}

/**
 * 角色发言消息
 */
export interface DiscussionMessage {
  messageId: string;
  roleId: string;
  content: string;
  stance: string;
  round: number;
  timestamp: string;
}

/**
 * 讨论结果
 */
export interface DiscussionResult {
  status: 'consensus' | 'pending_user' | 'max_rounds' | 'divergence' | 'timeout';
  round: number;
  decisions?: Decision[];
  pendingQuestions?: string[];
  summary?: string;
  duration?: number;
}

/**
 * 决策
 */
export interface Decision {
  id: string;
  content: string;
  agreed: boolean;
  signatures: string[];
  priority?: 'high' | 'medium' | 'low';
}

/**
 * 共识检查结果
 */
export interface ConsensusResult {
  reached: boolean;
  decisions: Decision[];
  disagreements: string[];
  confidence: number; // 0-1
}

/**
 * 发言角色选择结果
 */
export interface SpeakerSelection {
  role: Role;
  reason: 'round_robin' | 'stance_conflict' | 'topic_relevance' | 'pending_question';
  priority: number;
}

/**
 * 用户干预事件
 */
export interface UserInterventionEvent {
  meetingId: string;
  type: 'confirm_decision' | 'resolve_conflict' | 'choose_option' | 'extend_discussion';
  context: string;
  options: string[];
  urgent: boolean;
}

/**
 * 讨论驱动器
 */
export class DiscussionDriver {
  private contextSharer: ContextSharer;
  private llmClient: LLMClient;
  private messageSender: MessageSender;
  private maxRounds: number;
  private consensusThreshold: number;
  private timeout: number;
  private eventEmitter?: { emit(event: string, data: any): void };

  constructor(config: DiscussionDriverConfig) {
    this.contextSharer = config.contextSharer;
    this.llmClient = config.llmClient;
    this.messageSender = config.messageSender;
    this.maxRounds = config.maxRounds ?? 10;
    this.consensusThreshold = config.consensusThreshold ?? 0.8;
    this.timeout = config.timeout ?? 300000; // 5分钟
    this.eventEmitter = config.eventEmitter;
  }

  /**
   * 运行讨论
   */
  async runDiscussion(meetingId: string, topic: string): Promise<DiscussionResult> {
    const startTime = Date.now();

    this.emit('discussion.started', { meetingId, topic });

    let round = 0;

    while (round < this.maxRounds) {
      // 检查超时
      if (Date.now() - startTime > this.timeout) {
        return this.createResult('timeout', round, startTime);
      }

      // 获取下一个发言角色
      const selection = await this.selectNextSpeaker(meetingId);
      const { role } = selection;

      this.emit('discussion.speaker_selected', {
        meetingId,
        round,
        roleId: role.roleId,
        reason: selection.reason,
      });

      // 构建发言 prompt
      const prompt = await this.buildSpeakerPrompt(role, meetingId, topic, round);

      // 调用 LLM 生成发言
      const message = await this.llmClient.chat(prompt, {
        temperature: 0.7,
      });

      // 发送消息
      await this.messageSender.send(meetingId, role.roleId, message);

      this.emit('discussion.message_sent', {
        meetingId,
        round,
        roleId: role.roleId,
        messageLength: message.length,
      });

      // 检查是否达成共识
      const consensus = await this.checkConsensus(meetingId);
      
      if (consensus.reached && consensus.confidence >= this.consensusThreshold) {
        this.emit('discussion.consensus_reached', {
          meetingId,
          round,
          decisions: consensus.decisions.length,
        });

        return this.createResult('consensus', round, startTime, consensus);
      }

      // 检查是否需要用户干预
      if (await this.needsUserIntervention(meetingId, consensus)) {
        const pendingQuestions = consensus.disagreements;
        
        this.emit('discussion.user_intervention_needed', {
          meetingId,
          round,
          pendingQuestions,
        });

        return this.createResult('pending_user', round, startTime, consensus, pendingQuestions);
      }

      round++;
    }

    // 达到最大轮数
    this.emit('discussion.max_rounds_reached', { meetingId, round });
    return this.createResult('max_rounds', round, startTime);
  }

  /**
   * 选择下一个发言角色
   * 
   * 策略优先级：
   * 1. 质疑者优先（stance_conflict）
   * 2. 话题相关性（topic_relevance）
   * 3. 未发言者优先
   * 4. 轮流发言（round_robin）
   */
  private async selectNextSpeaker(meetingId: string): Promise<SpeakerSelection> {
    const participants = await this.getParticipants(meetingId);
    const messages = await this.getMessages(meetingId);

    if (participants.length === 0) {
      throw new Error('No participants in meeting');
    }

    // 策略 1：质疑者优先
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      const questioner = this.findQuestioner(participants, lastMessage);
      if (questioner) {
        return {
          role: questioner,
          reason: 'stance_conflict',
          priority: 100,
        };
      }
    }

    // 策略 2：话题相关性（有相关 expertise 的角色）
    const topicRelevantRole = await this.findTopicRelevantRole(participants, messages);
    if (topicRelevantRole) {
      return {
        role: topicRelevantRole,
        reason: 'topic_relevance',
        priority: 80,
      };
    }

    // 策略 3：未发言者优先
    const unspeakingRoles = participants.filter(p => !p.speakCount || p.speakCount === 0);
    if (unspeakingRoles.length > 0) {
      return {
        role: unspeakingRoles[0],
        reason: 'round_robin',
        priority: 50,
      };
    }

    // 策略 4：轮流发言（发言最少的）
    const leastSpeaking = participants.reduce((min, p) => 
      (p.speakCount ?? 0) < (min.speakCount ?? 0) ? p : min
    );
    
    return {
      role: leastSpeaking,
      reason: 'round_robin',
      priority: 30,
    };
  }

  /**
   * 构建发言 prompt
   */
  private async buildSpeakerPrompt(
    role: Role,
    meetingId: string,
    topic: string,
    round: number
  ): Promise<string> {
    const messages = await this.getMessages(meetingId);
    const recentMessages = messages.slice(-10); // 最近 10 条消息

    const stancePrompt = this.getStancePrompt(role.stance);

    return `你现在是会议室中的"${role.name}"角色，你的立场是"${role.stance}"。

## 你的立场要求
${stancePrompt}

## 会议主题
${topic}

## 讨论历史（最近10条）
${recentMessages.map(m => `[${m.roleId}]: ${m.content}`).join('\n')}

## 当前轮次
第 ${round + 1} 轮

## 你的任务
根据你的立场，发表你的观点。注意：
1. 保持立场一致性
2. 如果有不同意见，礼貌地提出质疑
3. 如果同意某个观点，可以补充证据
4. 发言要简洁有力，不要重复别人说的话
5. 如果认为讨论已经成熟，可以提议"总结决策"

请直接输出你的发言内容（不要包含角色名和标记）：`;
  }

  /**
   * 获取立场对应的 prompt
   */
  private getStancePrompt(stance: string): string {
    const stancePrompts: Record<string, string> = {
      advocate: '你是方案的倡导者，你需要论证方案的可行性，提供证据和例子。',
      skeptic: '你是方案的质疑者，你需要找出潜在问题，提出替代方案或改进建议。',
      neutral: '你是中立的观察者，你需要客观分析各方观点，指出关键假设和风险。',
      pragmatist: '你是实用主义者，你关注实施成本、时间线和可行性，提出具体的执行建议。',
      visionary: '你是远见者，你关注长期影响、战略价值和未来可能性。',
      executor: '你是执行者，你关注具体任务、责任分配和验收标准。',
      reviewer: '你是审查者，你需要确保质量和合规性，提出审查要点。',
      architect: '你是架构师，你需要评估技术方案的架构影响和系统设计。',
    };

    return stancePrompts[stance] || stancePrompts.neutral;
  }

  /**
   * 检查共识
   */
  private async checkConsensus(meetingId: string): Promise<ConsensusResult> {
    const messages = await this.getMessages(meetingId);
    
    if (messages.length < 3) {
      return {
        reached: false,
        decisions: [],
        disagreements: [],
        confidence: 0,
      };
    }

    const prompt = `分析以下讨论，判断是否达成共识：

## 讨论记录
${messages.map(m => `[${m.roleId}（${m.stance}）]: ${m.content}`).join('\n')}

## 输出格式（JSON）
{
  "reached": boolean,  // 是否达成共识
  "decisions": [       // 已达成的决策
    {
      "content": "决策内容",
      "agreed": true,
      "priority": "high|medium|low"
    }
  ],
  "disagreements": [   // 未解决的问题
    "问题描述"
  ],
  "confidence": number // 共识置信度 0-1
}

请输出 JSON（不要包含 markdown 标记）：`;

    const result = await this.llmClient.chat(prompt, { temperature: 0.3 });
    
    try {
      return this.parseConsensusResult(result);
    } catch (error) {
      // 解析失败，返回未达成共识
      return {
        reached: false,
        decisions: [],
        disagreements: ['Failed to analyze consensus'],
        confidence: 0,
      };
    }
  }

  /**
   * 解析共识结果
   */
  private parseConsensusResult(jsonStr: string): ConsensusResult {
    // 尝试提取 JSON
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        reached: false,
        decisions: [],
        disagreements: [],
        confidence: 0,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    return {
      reached: parsed.reached ?? false,
      decisions: (parsed.decisions ?? []).map((d: any, i: number) => ({
        id: `decision-${Date.now()}-${i}`,
        content: d.content,
        agreed: d.agreed ?? true,
        signatures: [],
        priority: d.priority ?? 'medium',
      })),
      disagreements: parsed.disagreements ?? [],
      confidence: parsed.confidence ?? 0,
    };
  }

  /**
   * 判断是否需要用户干预
   */
  private async needsUserIntervention(
    meetingId: string,
    consensus: ConsensusResult
  ): Promise<boolean> {
    // 1. 分歧超过 3 个未解决问题，需要用户调解
    if (consensus.disagreements.length >= 3) {
      return true;
    }

    // 2. 置信度太低（< 0.5），需要用户介入
    if (consensus.confidence < 0.5 && consensus.disagreements.length > 0) {
      return true;
    }

    // 3. 检查是否有"总结决策"提议但未达成共识
    const messages = await this.getMessages(meetingId);
    const hasSummaryProposal = messages.some(m => 
      m.content.includes('总结决策') || m.content.includes('总结一下')
    );
    
    if (hasSummaryProposal && !consensus.reached) {
      return true;
    }

    return false;
  }

  /**
   * 查找质疑者
   */
  private findQuestioner(participants: Role[], lastMessage: DiscussionMessage): Role | null {
    // 如果最后一条消息是方案提议，质疑态势的角色应优先发言
    const skepticStances = ['skeptic', 'reviewer', 'architect'];
    
    if (lastMessage.stance === 'advocate' || lastMessage.stance === 'executor') {
      // 找第一个质疑态势的角色
      for (const role of participants) {
        if (skepticStances.includes(role.stance)) {
          return role;
        }
      }
    }

    return null;
  }

  /**
   * 查找话题相关角色
   */
  private async findTopicRelevantRole(
    participants: Role[],
    messages: DiscussionMessage[]
  ): Promise<Role | null> {
    // 简化实现：返回第一个有 expertise 的角色
    const expertRoles = participants.filter(p => p.expertise && p.expertise.length > 0);
    
    if (expertRoles.length === 0) {
      return null;
    }

    // 如果有讨论历史，选择最相关的
    if (messages.length > 0) {
      // 随机返回一个专家角色（实际应该根据话题匹配）
      return expertRoles[Math.floor(Math.random() * expertRoles.length)];
    }

    return expertRoles[0];
  }

  /**
   * 获取参与者列表
   */
  private async getParticipants(meetingId: string): Promise<Role[]> {
    const data = await this.contextSharer.getValue<Role[]>(`meeting:${meetingId}:participants`);
    
    if (!data) {
      return [];
    }

    return data;
  }

  /**
   * 获取讨论消息
   */
  private async getMessages(meetingId: string): Promise<DiscussionMessage[]> {
    const data = await this.contextSharer.getValue<DiscussionMessage[]>(`meeting:${meetingId}:messages`);
    
    if (!data) {
      return [];
    }

    return data;
  }

  /**
   * 创建结果对象
   */
  private createResult(
    status: DiscussionResult['status'],
    round: number,
    startTime: number,
    consensus?: ConsensusResult,
    pendingQuestions?: string[]
  ): DiscussionResult {
    const result: DiscussionResult = {
      status,
      round,
      duration: Date.now() - startTime,
    };

    if (consensus) {
      result.decisions = consensus.decisions;
      result.summary = this.summarizeConsensus(consensus);
    }

    if (pendingQuestions) {
      result.pendingQuestions = pendingQuestions;
    }

    return result;
  }

  /**
   * 总结共识
   */
  private summarizeConsensus(consensus: ConsensusResult): string {
    const parts: string[] = [];

    if (consensus.decisions.length > 0) {
      parts.push(`达成 ${consensus.decisions.length} 个决策`);
    }

    if (consensus.disagreements.length > 0) {
      parts.push(`${consensus.disagreements.length} 个分歧待解决`);
    }

    parts.push(`置信度 ${(consensus.confidence * 100).toFixed(0)}%`);

    return parts.join('，');
  }

  /**
   * 发送事件
   */
  private emit(event: string, data: any): void {
    this.eventEmitter?.emit(event, data);
  }
}

/**
 * 创建讨论驱动器
 */
export function createDiscussionDriver(config: DiscussionDriverConfig): DiscussionDriver {
  return new DiscussionDriver(config);
}
