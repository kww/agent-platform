/**
 * 通知服务 (P0)
 * 
 * 功能：
 * - 多渠道通知
 * - 进度定期推送
 * - 错误通知 + 用户操作选项
 * - 工作流完成/失败通知
 */

import {
  NotificationConfig,
  NotificationPayload,
  NotificationChannel,
  NotificationEvent,
  ProgressState,
} from './types';
import { ProgressTracker, getProgressTracker } from './progress-tracker';
import { getDiscordNotifier } from '../utils/discord';

export interface NotificationServiceOptions {
  config: NotificationConfig;
  executionId: string;
  workflowId: string;
  workflowName?: string;
}

/**
 * 通知服务
 */
export class NotificationService {
  private config: NotificationConfig;
  private executionId: string;
  private workflowId: string;
  private workflowName?: string;
  private lastNotificationTime: Date | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private lastStepId: string | null = null;  // 跟踪上一个步骤
  private stepProgressSent: boolean = false;  // 当前步骤是否已发送进度通知

  constructor(options: NotificationServiceOptions) {
    this.config = options.config;
    this.executionId = options.executionId;
    this.workflowId = options.workflowId;
    this.workflowName = options.workflowName;
  }

  /**
   * 启动定期通知
   */
  startPeriodicNotifications(): void {
    if (!this.config.enabled || this.config.interval <= 0) return;

    this.intervalId = setInterval(() => {
      this.sendProgressNotification();
    }, this.config.interval * 1000);
  }

  /**
   * 停止定期通知
   */
  stopPeriodicNotifications(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  
  /**
   * 重置步骤进度状态（在新步骤开始时调用）
   */
  resetStepProgress(): void {
    this.stepProgressSent = false;
  }

  /**
   * 发送通知
   */
  async notify(event: NotificationEvent, data: Partial<NotificationPayload>): Promise<void> {
    if (!this.config.enabled) return;
    if (!this.config.events.includes(event)) return;

    const tracker = getProgressTracker(this.executionId);
    const state = tracker?.getState();

    const payload: NotificationPayload = {
      executionId: this.executionId,
      workflowId: this.workflowId,
      workflowName: this.workflowName,
      event,
      status: state?.status || 'running',
      progress: tracker?.getProgress() || 0,
      currentStep: state?.currentStep?.stepName,
      completedSteps: state?.completedSteps || 0,
      totalSteps: state?.totalSteps || 0,
      duration: state ? Math.round((Date.now() - state.startedAt.getTime()) / 1000) : 0,
      estimatedRemaining: state?.estimatedRemaining,
      error: data.error,
      warnings: state?.warnings.length || 0,
      timestamp: new Date(),
      ...data,
    };

    await this.sendToChannels(payload);
  }

  /**
   * 发送进度通知
   */
  private async sendProgressNotification(): Promise<void> {
    const tracker = getProgressTracker(this.executionId);
    if (!tracker) return;

    const state = tracker.getState();
    if (state.status !== 'running') {
      this.stopPeriodicNotifications();
      return;
    }

    // 检查步骤执行时间，超过阈值发送进度通知
    await this.checkStepProgress(state);

    // 🆕 检查超时预警
    await this.checkTimeoutWarning(state);
  }

  /**
   * 检查步骤执行进度
   */
  private async checkStepProgress(state: ProgressState): Promise<void> {
    const currentStep = state.currentStep;
    if (!currentStep || !currentStep.startedAt) return;

    // 检测步骤变化，重置状态
    if (currentStep.stepId !== this.lastStepId) {
      this.lastStepId = currentStep.stepId || null;
      this.stepProgressSent = false;
    }

    // 如果已经发送过进度通知，跳过
    if (this.stepProgressSent) return;

    // 计算步骤执行时间
    const stepDuration = Date.now() - currentStep.startedAt.getTime();
    const stepDurationSeconds = Math.round(stepDuration / 1000);

    // 获取阈值（默认 5 分钟 = 300 秒）
    const thresholdSeconds = parseInt(process.env.STEP_PROGRESS_THRESHOLD || '300', 10);

    // 超过阈值，发送进度通知
    if (stepDurationSeconds >= thresholdSeconds) {
      this.stepProgressSent = true;
      
      const notifier = getDiscordNotifier();
      const stepName = currentStep.stepName || currentStep.stepId || '当前步骤';
      const durationStr = this.formatDuration(stepDurationSeconds);
      
      // 使用 ⏱️ 表示正在运行，格式更明确
      await notifier.sendDirect(`⏱️ ${stepName} 运行中 (${durationStr})`);
    }
  }

  /**
   * 🆕 检查超时预警
   */
  private async checkTimeoutWarning(state: ProgressState): Promise<void> {
    // 从环境变量获取预警阈值（默认 50%）
    const threshold = parseInt(process.env.TIMEOUT_WARNING_THRESHOLD || '50', 10);
    
    // 计算已运行时间占比
    const duration = Date.now() - state.startedAt.getTime();
    const estimatedTotal = state.estimatedRemaining 
      ? duration + state.estimatedRemaining * 1000 
      : null;
    
    if (!estimatedTotal) return;
    
    const progressPercent = (duration / estimatedTotal) * 100;
    
    // 检查是否超过阈值且未发送过预警
    if (progressPercent >= threshold && !this.timeoutWarningSent) {
      this.timeoutWarningSent = true;
      
      await this.notify('warning.occurred', {
        error: `执行时间已超过 ${threshold}%，预计还需 ${this.formatDuration(state.estimatedRemaining || 0)}`,
      });
    }
  }

  private timeoutWarningSent = false;

  /**
   * 发送到所有配置的渠道
   */
  private async sendToChannels(payload: NotificationPayload): Promise<void> {
    const promises = this.config.channels.map(channel => 
      this.sendToChannel(channel, payload)
    );
    
    await Promise.allSettled(promises);
  }

  /**
   * 发送到单个渠道
   */
  private async sendToChannel(channel: NotificationChannel, payload: NotificationPayload): Promise<void> {
    try {
      switch (channel) {
        case 'discord':
          await this.sendToDiscord(payload);
          break;
        case 'webhook':
          await this.sendToWebhook(payload);
          break;
        case 'wechat':
          await this.sendToWechat(payload);
          break;
        case 'telegram':
          await this.sendToTelegram(payload);
          break;
      }
    } catch (error) {
      console.error(`Notification failed for channel ${channel}:`, error);
    }
  }

  /**
   * 发送到 Discord
   */
  private async sendToDiscord(payload: NotificationPayload): Promise<void> {
    const notifier = getDiscordNotifier();
    
    // 根据事件类型决定是否发送
    // workflow.started 和 workflow.completed 已经通过 notificationService.notify 发送
    // 这里只处理特定事件
    if (payload.event === 'workflow.started') {
      // 开始通知：简洁
      await notifier.sendDirect(`🚀 **${payload.workflowName || payload.workflowId}**`);
    } else if (payload.event === 'workflow.completed') {
      // 完成通知：带时长和 Token
      const duration = this.formatDuration(payload.duration || 0);
      let msg = `✅ **${payload.workflowName || payload.workflowId}** · ${duration}`;
      
      // Token 使用率（只在高使用率时显示）
      const tokenUsage = (payload as any).tokenUsage;
      if (tokenUsage && tokenUsage.percentage > 60) {
        const emoji = tokenUsage.percentage > 80 ? '🔴' : '🟡';
        msg += ` · Token ${tokenUsage.percentage}%${emoji}`;
      }
      
      await notifier.sendDirect(msg);
    } else if (payload.event === 'workflow.failed') {
      // 失败通知
      let msg = `❌ **${payload.workflowName || payload.workflowId}** 失败`;
      if (payload.error) {
        msg += `\n> ${payload.error.substring(0, 80)}`;
      }
      await notifier.sendDirect(msg);
    } else if (payload.event === 'step.completed') {
      // 步骤完成通知：显示进度
      const progress = `[${payload.completedSteps}/${payload.totalSteps}]`;
      const stepName = payload.currentStep || '步骤';
      const duration = payload.duration ? ` (${this.formatDuration(payload.duration)})` : '';
      // 用 ✓ 明确表示完成
      await notifier.sendDirect(`✓ ${progress} ${stepName} 完成${duration}`);
    }
  }

  /**
   * 发送到 Webhook
   */
  private async sendToWebhook(payload: NotificationPayload): Promise<void> {
    const webhookUrl = this.config.webhookUrl || process.env.NOTIFICATION_WEBHOOK_URL;
    if (!webhookUrl) return;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /**
   * 发送到企业微信
   */
  private async sendToWechat(payload: NotificationPayload): Promise<void> {
    const webhookUrl = process.env.WECHAT_WEBHOOK_URL;
    if (!webhookUrl) return;

    const content = this.formatSimpleMessage(payload);
    
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { content },
      }),
    });
  }

  /**
   * 发送到 Telegram
   */
  private async sendToTelegram(payload: NotificationPayload): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) return;

    const content = this.formatSimpleMessage(payload);
    
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: content,
        parse_mode: 'Markdown',
      }),
    });
  }

  /**
   * 格式化 Discord 消息
   */
  private formatDiscordMessage(payload: NotificationPayload): string {
    const emoji = this.getEventEmoji(payload.event);
    const progressBar = this.buildProgressBar(payload.progress);
    
    let content = `${emoji} **${payload.workflowName || payload.workflowId}**`;
    content += `\n${progressBar} ${payload.progress}%`;
    content += `\n📍 ${payload.completedSteps}/${payload.totalSteps} 步骤`;
    
    if (payload.currentStep) {
      content += `\n🔄 当前: ${payload.currentStep}`;
    }
    
    content += `\n⏱️ 已运行: ${this.formatDuration(payload.duration)}`;
    
    if (payload.estimatedRemaining) {
      content += ` | 预计: ${this.formatDuration(payload.estimatedRemaining)}`;
    }
    
    if (payload.error) {
      content += `\n❌ 错误: ${payload.error.substring(0, 100)}`;
    }
    
    return content;
  }

  /**
   * 格式化简单消息（企业微信/Telegram）
   */
  private formatSimpleMessage(payload: NotificationPayload): string {
    const emoji = this.getEventEmoji(payload.event);
    const lines = [
      `${emoji} **${payload.workflowName || payload.workflowId}**`,
      `进度: ${payload.progress}% (${payload.completedSteps}/${payload.totalSteps})`,
      `已运行: ${this.formatDuration(payload.duration)}`,
    ];
    
    if (payload.currentStep) {
      lines.push(`当前: ${payload.currentStep}`);
    }
    
    if (payload.error) {
      lines.push(`错误: ${payload.error.substring(0, 100)}`);
    }
    
    return lines.join('\n');
  }

  /**
   * 获取事件对应的 emoji
   */
  private getEventEmoji(event: NotificationEvent): string {
    switch (event) {
      case 'workflow.started': return '🚀';
      case 'workflow.completed': return '✅';
      case 'workflow.failed': return '❌';
      case 'phase.started': return '📦';
      case 'phase.completed': return '✓';
      case 'step.progress': return '⏳';
      case 'error.occurred': return '💥';
      case 'warning.occurred': return '⚠️';
      default: return '📌';
    }
  }

  /**
   * 构建进度条
   */
  private buildProgressBar(progress: number): string {
    // 确保进度值在有效范围内
    const clampedProgress = Math.max(0, Math.min(100, progress));
    const filled = Math.round(clampedProgress / 10);
    const empty = 10 - filled;
    return `${'▓'.repeat(filled)}${'░'.repeat(empty)}`;
  }

  /**
   * 映射状态
   */
  private mapStatus(status: ProgressState['status']): 'started' | 'running' | 'completed' | 'failed' {
    switch (status) {
      case 'pending': return 'started';
      case 'running': return 'running';
      case 'completed': return 'completed';
      case 'failed': return 'failed';
      case 'cancelled': return 'failed';
      default: return 'running';
    }
  }

  /**
   * 格式化时长
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${minutes}分`;
  }
}

// ===== 通知服务管理 =====

const services = new Map<string, NotificationService>();

export function createNotificationService(options: NotificationServiceOptions): NotificationService {
  const service = new NotificationService(options);
  services.set(options.executionId, service);
  return service;
}

export function getNotificationService(executionId: string): NotificationService | undefined {
  return services.get(executionId);
}

export function removeNotificationService(executionId: string): void {
  const service = services.get(executionId);
  if (service) {
    service.stopPeriodicNotifications();
    services.delete(executionId);
  }
}

// ===== 默认通知配置 =====

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: true,
  channels: ['discord'],
  events: [
    'workflow.started',
    'step.completed',      // 每个步骤完成时通知
    'workflow.completed',
    'workflow.failed',
    'error.occurred',
  ],
  interval: 60,  // 每 1 分钟检查一次（用于步骤进度通知）
};
