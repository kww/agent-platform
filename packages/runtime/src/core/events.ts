/**
 * 事件系统
 */

import { EventEmitter as EE } from 'eventemitter3';

export type EventHandler = (event: Event) => void;

export interface Event {
  type: string;
  data?: any;
  timestamp: Date;
}

export class EventEmitter {
  private emitter = new EE();
  
  /**
   * 注册事件监听
   */
  on(event: string, handler: EventHandler): this {
    this.emitter.on(event, handler);
    return this;
  }
  
  /**
   * 注册一次性事件监听
   */
  once(event: string, handler: EventHandler): this {
    this.emitter.once(event, handler);
    return this;
  }
  
  /**
   * 移除事件监听
   */
  off(event: string, handler?: EventHandler): this {
    this.emitter.off(event, handler);
    return this;
  }
  
  /**
   * 触发事件
   */
  emit(type: string, data?: any): void {
    const event: Event = {
      type,
      data,
      timestamp: new Date()
    };
    this.emitter.emit(type, event);
    
    // 同时触发通配符事件
    this.emitter.emit('*', event);
  }
  
  /**
   * 移除所有监听器
   */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

// 事件类型常量
export const Events = {
  WORKFLOW_STARTED: 'workflow.started',
  WORKFLOW_COMPLETED: 'workflow.completed',
  WORKFLOW_FAILED: 'workflow.failed',
  WORKFLOW_CANCELLED: 'workflow.cancelled',
  
  STEP_STARTED: 'step.started',
  STEP_PROGRESS: 'step.progress',
  STEP_COMPLETED: 'step.completed',
  STEP_FAILED: 'step.failed',
  STEP_SKIPPED: 'step.skipped',
  
  TOOL_STARTED: 'tool.started',
  TOOL_COMPLETED: 'tool.completed',
  TOOL_FAILED: 'tool.failed',
  
  AGENT_STARTED: 'agent.started',
  AGENT_PROGRESS: 'agent.progress',
  AGENT_COMPLETED: 'agent.completed',
  AGENT_FAILED: 'agent.failed',
} as const;
