/**
 * 核心编排器
 * 
 * 功能：
 * 1. 多角色协作编排
 * 2. 会议事件驱动
 * 3. 上下文共享
 * 4. 角色调度
 * 
 * 复用：
 * - ContextSharer: 上下文共享
 * - RoleScheduler: 角色调度
 * - MeetingSubscriber: 会议事件订阅
 * - ParallelExecutor: 并行执行
 * 
 * 使用示例：
 * ```typescript
 * import { createOrchestrator } from './orchestrator';
 * import { createRoleExecutor } from '../core/executor';
 * 
 * const orchestrator = createOrchestrator({ redis });
 * 
 * // 设置角色执行器
 * orchestrator.setRoleExecutor(createRoleExecutor({
 *   executionId: 'exec-123',
 *   workdir: '/path/to/project',
 * }));
 * 
 * // 启动编排器
 * await orchestrator.start();
 * ```
 */

import { EventEmitter } from '../core/events';
import type { RedisClient } from './context-sharer';
import { ContextSharer, createContextSharer } from './context-sharer';
import { RoleScheduler, RoleTask, RolePriority, createRoleScheduler } from './role-scheduler';
import { MeetingSubscriber, MeetingEvent, createMeetingSubscriber } from './meeting-subscriber';
import type { RedisSubscriberClient } from './meeting-subscriber';
import type {
  OrchestrationConfig,
  OrchestrationResult,
  OrchestrationStatus,
  OrchestrationEvent,
  RoleResult,
  ConstraintLevel,
  SpecMode,
  ConstraintContext,
  CONSTRAINT_TO_SPEC_MODE,
} from './types';

// 导入约束映射
import { CONSTRAINT_TO_SPEC_MODE as constraintMap } from './types';

/**
 * Redis 客户端组合接口
 */
export interface RedisCombinedClient extends RedisClient, RedisSubscriberClient {
  duplicate(): RedisCombinedClient;
}

/**
 * 编排器配置
 */
export interface OrchestratorConfig {
  redis: RedisCombinedClient;
  eventEmitter?: EventEmitter;
  maxConcurrentRoles?: number;
  contextTTL?: number;
}

/**
 * 角色执行函数类型
 */
export type RoleExecutorFn = (task: RoleTask, context: ContextSharer) => Promise<any>;

/**
 * 核心编排器
 */
export class Orchestrator {
  private redis: RedisCombinedClient;
  private eventEmitter: EventEmitter;
  private config: Required<Omit<OrchestratorConfig, 'redis' | 'eventEmitter'>>;
  private meetingSubscriber?: MeetingSubscriber;
  private activeExecutions: Map<string, OrchestrationResult>;
  private roleExecutor?: RoleExecutorFn;
  private meetingContextSharer: ContextSharer;
  
  constructor(config: OrchestratorConfig) {
    this.redis = config.redis;
    this.eventEmitter = config.eventEmitter ?? new EventEmitter();
    this.config = {
      maxConcurrentRoles: config.maxConcurrentRoles ?? 5,
      contextTTL: config.contextTTL ?? 3600,
    };
    this.activeExecutions = new Map();
    
    // 初始化会议上下文共享器（用于存储会议记录）
    this.meetingContextSharer = createContextSharer({
      redis: this.redis,
      executionId: 'meetings', // 会议记录使用统一的命名空间
      ttl: this.config.contextTTL,
    });
  }
  
  /**
   * 设置角色执行器
   */
  setRoleExecutor(executor: RoleExecutorFn): void {
    this.roleExecutor = executor;
  }
  
  /**
   * 启动编排器（开始监听会议事件）
   */
  async start(): Promise<void> {
    this.meetingSubscriber = createMeetingSubscriber({
      redis: this.redis,
      eventEmitter: this.eventEmitter,
      onEvent: (event) => this.handleMeetingEvent(event),
      onError: (error) => console.error('[Orchestrator] Meeting event error:', error),
    });
    
    await this.meetingSubscriber.start();
    console.log('[Orchestrator] Started');
  }
  
  /**
   * 停止编排器
   */
  async stop(): Promise<void> {
    if (this.meetingSubscriber) {
      await this.meetingSubscriber.stop();
    }
    
    // 取消所有活跃执行
    for (const [executionId] of this.activeExecutions) {
      await this.cancelExecution(executionId);
    }
    
    console.log('[Orchestrator] Stopped');
  }
  
  /**
   * 执行编排
   */
  async execute(config: OrchestrationConfig): Promise<OrchestrationResult> {
    if (!this.roleExecutor) {
      throw new Error('Role executor not set. Call setRoleExecutor() first.');
    }
    
    const result: OrchestrationResult = {
      executionId: config.executionId,
      status: 'running',
      roles: [],
      roleResults: new Map(),
      startedAt: new Date().toISOString(),
    };
    
    this.activeExecutions.set(config.executionId, result);
    
    try {
      // 创建上下文共享器
      const context = createContextSharer({
        redis: this.redis,
        executionId: config.executionId,
        ttl: this.config.contextTTL,
        eventEmitter: this.eventEmitter,
      });
      
      // 构建角色任务列表
      const tasks = await this.buildRoleTasks(config);
      result.roles = tasks.map(t => t.name);
      
      // 创建角色调度器
      const scheduler = createRoleScheduler({
        maxConcurrent: config.maxConcurrentRoles ?? this.config.maxConcurrentRoles,
        eventEmitter: this.eventEmitter,
        onTaskStart: (task) => this.emitEvent(config.executionId, 'role.started', task.id),
        onTaskComplete: (task, taskResult) => {
          const roleResult: RoleResult = {
            roleId: task.id,
            roleName: task.name,
            status: taskResult.status === 'success' ? 'succeeded' : 'failed',
            output: taskResult.output,
            error: taskResult.error,
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            duration: taskResult.duration,
          };
          result.roleResults.set(task.id, roleResult);
          this.emitEvent(config.executionId, 'role.completed', task.id, taskResult);
        },
        onTaskFail: (task, error) => {
          this.emitEvent(config.executionId, 'role.failed', task.id, { error: error.message });
        },
      });
      
      // 执行调度
      const taskResults = await scheduler.schedule(tasks, async (task) => {
        return this.roleExecutor!(task, context);
      });
      
      // 更新结果
      result.status = this.determineFinalStatus(taskResults);
      result.completedAt = new Date().toISOString();
      
      // 获取上下文摘要
      const summary = await context.getSummary();
      result.contextSummary = {
        entryCount: summary.entryCount,
        totalSize: summary.totalSize,
        keys: summary.keys,
        lastUpdatedAt: new Date().toISOString(),
      };
      
    } catch (error) {
      result.status = 'failed';
      result.error = error instanceof Error ? error.message : String(error);
      result.completedAt = new Date().toISOString();
    } finally {
      this.activeExecutions.delete(config.executionId);
    }
    
    return result;
  }
  
  /**
   * 取消执行
   */
  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    
    if (!execution) {
      return false;
    }
    
    execution.status = 'cancelled';
    execution.completedAt = new Date().toISOString();
    this.activeExecutions.delete(executionId);
    
    this.emitEvent(executionId, 'orchestration.cancelled', undefined);
    
    return true;
  }
  
  /**
   * 获取执行状态
   */
  getExecutionStatus(executionId: string): OrchestrationResult | null {
    return this.activeExecutions.get(executionId) ?? null;
  }
  
  /**
   * 处理会议事件
   */
  private async handleMeetingEvent(event: MeetingEvent): Promise<void> {
    console.log(`[Orchestrator] Meeting event: ${event.event_type}`);
    
    switch (event.event_type) {
      case 'meeting.started':
        // 会议开始，准备编排
        await this.handleMeetingStarted(event);
        break;
      
      case 'meeting.decision':
        // 会议决策，更新上下文
        await this.handleMeetingDecision(event);
        break;
      
      case 'meeting.ended':
        // 会议结束，触发执行
        await this.handleMeetingEnded(event);
        break;
    }
  }
  
  /**
   * 处理会议开始
   */
  private async handleMeetingStarted(event: MeetingEvent): Promise<void> {
    const { meetingId, taskId, title } = event.data;
    
    console.log(`[Orchestrator] Meeting started: ${meetingId} - ${title}`);
    
    // 存储会议元数据（阶段 1）
    await this.meetingContextSharer.setMeetingMeta(meetingId, {
      meetingId,
      taskId: taskId || undefined,
      title: title || 'Untitled Meeting',
      startedAt: event.timestamp,
    });
    
    this.emitEvent(meetingId, 'orchestration.preparing', undefined, { taskId });
  }
  
  /**
   * 处理会议决策
   */
  private async handleMeetingDecision(event: MeetingEvent): Promise<void> {
    if (!event.data.decision) return;
    
    const { meetingId, decision } = event.data;
    
    console.log(`[Orchestrator] Decision made: ${decision.content}`);
    
    // 追加决策（阶段 2）
    const decisionId = `decision-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await this.meetingContextSharer.appendMeetingDecision(meetingId, {
      id: decisionId,
      content: decision.content,
      agreed: decision.agreed ?? true,
      roles: decision.roles || [],
      timestamp: event.timestamp,
    });
  }
  
  /**
   * 处理会议结束
   */
  private async handleMeetingEnded(event: MeetingEvent): Promise<void> {
    const { 
      meetingId, 
      taskId, 
      title,
      constraintLevel,
      summaryKey,
      summaryPreview,
      decisionsKey,
      decisionCount,
      participants,
      messageCount 
    } = event.data;
    
    console.log(`[Orchestrator] Meeting ended: ${meetingId} - ${title}`);
    console.log(`[Orchestrator] Summary preview: ${summaryPreview || 'N/A'}...`);
    console.log(`[Orchestrator] Decisions: ${decisionCount}, Participants: ${Array.isArray(participants) ? participants.length : 0}`);
    
    // AS-036: 处理约束级别
    const level: ConstraintLevel = constraintLevel || 'L2'; // 默认 L2
    const specMode: SpecMode = constraintMap[level];
    
    console.log(`[Orchestrator] Constraint level: ${level} → Spec mode: ${specMode}`);
    
    // 从 Redis 读取完整纪要（混合存储方案）
    let summary: string | undefined;
    let decisions: any[] = [];
    
    if (summaryKey && this.redis.get) {
      const summaryData = await this.redis.get(summaryKey);
      summary = summaryData ?? undefined;
      if (summary) {
        console.log(`[Orchestrator] Loaded summary from Redis: ${summary.length} chars`);
      }
    }
    
    if (decisionsKey && this.redis.get) {
      const decisionsJson = await this.redis.get(decisionsKey);
      if (decisionsJson) {
        try {
          decisions = JSON.parse(decisionsJson);
          console.log(`[Orchestrator] Loaded ${decisions.length} decisions from Redis`);
        } catch (e) {
          console.error(`[Orchestrator] Failed to parse decisions:`, e);
        }
      }
    }
    
    // 🆕 分层存储（AS-054 渐进式披露）
    
    // 1. 更新元数据（阶段 1）
    const existingMeta = await this.meetingContextSharer.getMeetingMeta(meetingId);
    await this.meetingContextSharer.setMeetingMeta(meetingId, {
      ...existingMeta,
      meetingId,
      taskId: taskId || existingMeta?.taskId,
      title: title || existingMeta?.title || 'Untitled Meeting',
      endedAt: event.timestamp,
      summaryPreview: summary?.substring(0, 200) || summaryPreview,
      decisionCount: decisions.length || decisionCount,
      messageCount: messageCount || 0,
      participants: Array.isArray(participants) 
        ? participants.map(p => typeof p === 'string' ? p : p.roleId)
        : [],
    });
    
    // 2. 存储决策（阶段 2）- 如果有新的决策
    if (decisions.length > 0) {
      await this.meetingContextSharer.setMeetingDecisions(meetingId, decisions);
    }
    
    // 3. 存储摘要（阶段 3）
    if (summary) {
      await this.meetingContextSharer.setMeetingSummary(meetingId, summary);
    }
    
    // AS-036: 存储约束上下文
    const constraintContext: ConstraintContext = {
      constraintLevel: level,
      specMode,
      source: {
        type: 'meeting',
        id: meetingId,
      },
      createdAt: event.timestamp,
    };
    await this.meetingContextSharer.set(`constraint:${meetingId}`, constraintContext);
    console.log(`[Orchestrator] Constraint context stored for meeting: ${meetingId}`);
    
    // 发送就绪事件，通知可以开始编排
    this.emitEvent(meetingId, 'orchestration.ready', undefined, {
      taskId,
      meetingId,
      summaryPreview: summary?.substring(0, 200) || summaryPreview,
      decisionCount: decisions.length || decisionCount,
      constraintLevel: level,
      specMode,
    });
  }
  
  /**
   * 构建角色任务列表
   */
  private async buildRoleTasks(config: OrchestrationConfig): Promise<RoleTask[]> {
    // TODO: 从工作流配置或会议结果中构建角色任务
    // 这里是示例实现
    
    const tasks: RoleTask[] = [
      {
        id: 'architect',
        name: '架构师',
        priority: RolePriority.HIGH,
        waitFor: [],
      },
      {
        id: 'frontend-dev',
        name: '前端开发',
        priority: RolePriority.NORMAL,
        waitFor: ['architect'],
      },
      {
        id: 'backend-dev',
        name: '后端开发',
        priority: RolePriority.NORMAL,
        waitFor: ['architect'],
      },
      {
        id: 'qa',
        name: '测试工程师',
        priority: RolePriority.NORMAL,
        waitFor: ['frontend-dev', 'backend-dev'],
      },
    ];
    
    return tasks;
  }
  
  /**
   * 确定最终状态
   */
  private determineFinalStatus(results: Map<string, any>): OrchestrationStatus {
    const statuses = Array.from(results.values()).map(r => r.status);
    
    if (statuses.every(s => s === 'success')) {
      return 'completed';
    }
    
    if (statuses.some(s => s === 'success')) {
      return 'completed'; // 部分成功也算完成
    }
    
    return 'failed';
  }
  
  /**
   * 发送事件
   */
  private emitEvent(
    executionId: string,
    type: string,
    roleId?: string,
    data?: any
  ): void {
    const event: OrchestrationEvent = {
      type,
      executionId,
      roleId,
      data,
      timestamp: new Date().toISOString(),
    };
    
    this.eventEmitter.emit(type, event);
  }
}

/**
 * 创建编排器（便捷函数）
 */
export function createOrchestrator(config: OrchestratorConfig): Orchestrator {
  return new Orchestrator(config);
}
