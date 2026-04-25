/**
 * 会议事件订阅器
 * 
 * 功能：
 * 1. 订阅 agent-studio 发布的会议事件
 * 2. 解析事件并驱动编排器
 * 3. 支持事件重试
 * 
 * 事件驱动架构：
 * - studio 发布事件到 Redis channel: events:meeting
 * - runtime 订阅并处理
 * - 无直接依赖，通过 Redis 解耦
 */

import { EventEmitter } from '../core/events';

/**
 * Redis 订阅客户端接口（最小化依赖）
 */
export interface RedisSubscriberClient {
  subscribe(channel: string): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  on(event: 'message', callback: (channel: string, message: string) => void): this;
  quit(): Promise<void>;
}

/**
 * Redis 客户端接口
 */
export interface RedisClient extends RedisSubscriberClient {
  duplicate(): RedisSubscriberClient;
}

/**
 * 会议事件类型
 */
export type MeetingEventType = 
  | 'meeting.created'
  | 'meeting.started'
  | 'meeting.message'
  | 'meeting.decision'
  | 'meeting.ended'
  | 'meeting.summary';

/**
 * 会议事件
 */
export interface MeetingEvent {
  event_id: string;
  event_type: MeetingEventType;
  timestamp: string;
  data: {
    meetingId: string;
    projectId?: string;
    taskId?: string;
    title?: string;
    // AS-036: 约束级别（L1-L4）
    constraintLevel?: 'L1' | 'L2' | 'L3' | 'L4';
    participants?: string[] | Array<{ roleId: string; roleName: string }>;
    message?: {
      roleId: string;
      roleName: string;
      content: string;
      stance?: string;
    };
    decision?: {
      content: string;
      agreed: boolean;
      roles: string[];
    };
    // 方案 D：混合存储，大纪要通过 Redis 传递
    summary?: string;              // 兼容旧事件
    summaryKey?: string;           // Redis key（新）
    summaryPreview?: string;       // 纪要预览（新）
    decisions?: Array<{            // 兼容旧事件
      id?: string;
      content: string;
      agreed: boolean;
      roles: string[];
    }>;
    decisionsKey?: string;         // Redis key（新）
    decisionCount?: number;        // 决策数量（新）
    messageCount?: number;
  };
}

/**
 * 订阅器配置
 */
export interface MeetingSubscriberConfig {
  redis: RedisClient | RedisSubscriberClient;
  eventEmitter?: EventEmitter;
  onEvent?: (event: MeetingEvent) => void | Promise<void>;
  onError?: (error: Error, event?: MeetingEvent) => void;
}

/**
 * 会议事件订阅器
 */
export class MeetingSubscriber {
  private redis: RedisClient | RedisSubscriberClient;
  private subscriber?: RedisSubscriberClient;
  private eventEmitter?: EventEmitter;
  private onEvent?: (event: MeetingEvent) => void | Promise<void>;
  private onError?: (error: Error, event?: MeetingEvent) => void;
  private isRunning: boolean = false;
  private channel = 'events:meeting';
  
  constructor(config: MeetingSubscriberConfig) {
    this.redis = config.redis;
    this.eventEmitter = config.eventEmitter;
    this.onEvent = config.onEvent;
    this.onError = config.onError;
  }
  
  /**
   * 启动订阅
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[MeetingSubscriber] Already running');
      return;
    }
    
    // 创建专用订阅连接（如果支持 duplicate）
    if ('duplicate' in this.redis) {
      this.subscriber = this.redis.duplicate();
    } else {
      this.subscriber = this.redis;
    }
    
    // 订阅频道
    await this.subscriber.subscribe(this.channel);
    
    // 监听消息
    this.subscriber.on('message', async (channel: string, message: string) => {
      if (channel !== this.channel) return;
      
      try {
        const event = this.parseEvent(message);
        
        if (event) {
          await this.handleEvent(event);
        }
      } catch (error) {
        console.error('[MeetingSubscriber] Error handling message:', error);
        this.onError?.(error instanceof Error ? error : new Error(String(error)));
      }
    });
    
    this.isRunning = true;
    console.log(`[MeetingSubscriber] Started, listening on channel: ${this.channel}`);
  }
  
  /**
   * 停止订阅
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.subscriber) {
      return;
    }
    
    await this.subscriber.unsubscribe(this.channel);
    await this.subscriber.quit();
    
    this.isRunning = false;
    console.log('[MeetingSubscriber] Stopped');
  }
  
  /**
   * 解析事件
   */
  private parseEvent(message: string): MeetingEvent | null {
    try {
      const event = JSON.parse(message) as MeetingEvent;
      
      // 验证必需字段
      if (!event.event_type || !event.data?.meetingId) {
        console.warn('[MeetingSubscriber] Invalid event structure:', event);
        return null;
      }
      
      return event;
    } catch (error) {
      console.error('[MeetingSubscriber] Failed to parse event:', error);
      return null;
    }
  }
  
  /**
   * 处理事件
   */
  private async handleEvent(event: MeetingEvent): Promise<void> {
    console.log(`[MeetingSubscriber] Received: ${event.event_type} - ${event.data.meetingId}`);
    
    // 发布内部事件
    this.eventEmitter?.emit(`meeting.${event.event_type}`, event);
    
    // 调用回调
    if (this.onEvent) {
      try {
        await this.onEvent(event);
      } catch (error) {
        console.error('[MeetingSubscriber] Error in event handler:', error);
        this.onError?.(error instanceof Error ? error : new Error(String(error)), event);
      }
    }
  }
  
  /**
   * 检查是否运行中
   */
  get running(): boolean {
    return this.isRunning;
  }
}

/**
 * 创建会议订阅器（便捷函数）
 */
export function createMeetingSubscriber(config: MeetingSubscriberConfig): MeetingSubscriber {
  return new MeetingSubscriber(config);
}
