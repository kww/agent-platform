/**
 * Discord 通知服务
 */

import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { Agent } from 'http';

/**
 * Discord 通知配置
 */
export interface DiscordNotificationConfig {
  webhookUrl?: string;
  botToken?: string;
  channelId?: string;
}

export interface ProgressNotification {
  executionId: string;
  workflow: string;
  currentStep: string;
  stepIndex: number;
  totalSteps: number;
  status: 'started' | 'running' | 'completed' | 'failed';
  duration?: number;
  error?: string;
  tokenUsage?: {
    used: number;
    percentage: number;
  };
}

/**
 * Discord 通知器
 */
export class DiscordNotifier {
  private webhookUrl?: string;
  private botToken?: string;
  private channelId?: string;
  private enabled: boolean;
  private agent?: Agent;

  constructor(config?: DiscordNotificationConfig) {
    this.webhookUrl = config?.webhookUrl || process.env.DISCORD_WEBHOOK_URL;
    this.botToken = config?.botToken || process.env.DISCORD_BOT_TOKEN;
    this.channelId = config?.channelId || process.env.DISCORD_CHANNEL_ID;
    this.enabled = !!(this.webhookUrl || (this.botToken && this.channelId));
    
    // 初始化代理 agent
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (proxyUrl) {
      this.agent = new HttpsProxyAgent(proxyUrl);
    }
  }

  /**
   * 发送进度通知
   */
  async notifyProgress(data: ProgressNotification): Promise<void> {
    if (!this.enabled) {
      return;
    }

    // 只在关键节点发送通知：开始、完成、失败
    // 中间的运行状态不发，避免刷屏
    if (data.status === 'running') {
      return;
    }

    let content = '';
    
    if (data.status === 'started') {
      content = `🚀 **${data.workflow}**`;
    } else if (data.status === 'completed') {
      content = `✅ **${data.workflow}** 完成`;
      if (data.duration) {
        content += ` · ${this.formatDuration(Math.round(data.duration / 1000))}`;
      }
    } else if (data.status === 'failed') {
      content = `❌ **${data.workflow}** 失败`;
      if (data.error) {
        content += `\n> ${data.error.substring(0, 80)}`;
      }
    }

    await this.send(content);
  }

  /**
   * 发送工作流完成通知
   */
  async notifyComplete(data: {
    executionId: string;
    workflow: string;
    totalDuration: number;
    status: 'completed' | 'failed';
    outputs?: Record<string, any>;
    tokenUsage?: {
      used: number;
      remaining: number;
      percentage: number;
      stepCount: number;
      avgPerStep: number;
    };
    contextUsage?: number;
  }): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const emoji = data.status === 'completed' ? '✅' : '❌';
    const durationStr = this.formatDuration(Math.round(data.totalDuration / 1000));
    
    // 简洁格式：一行搞定
    let content = `${emoji} **${data.workflow}** · ${durationStr}`;
    
    // Token 使用率（只显示百分比，带警告）
    if (data.tokenUsage) {
      const pct = data.tokenUsage.percentage;
      if (pct > 60) {
        const warnEmoji = pct > 80 ? '🔴' : '🟡';
        content += ` · Token ${pct}%${warnEmoji}`;
      }
    }

    await this.send(content);
  }

  /**
   * 格式化数字（添加千位分隔符）
   */
  private formatNumber(num: number): string {
    return num.toLocaleString('zh-CN');
  }

  /**
   * 格式化时长
   */
  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}秒`;
    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return secs > 0 ? `${minutes}分${secs}秒` : `${minutes}分钟`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}小时${minutes}分`;
  }

  /**
   * 获取状态对应的 emoji
   */
  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'started':
        return '🚀';
      case 'running':
        return '⏳';
      case 'completed':
        return '✅';
      case 'failed':
        return '❌';
      default:
        return '📌';
    }
  }

  /**
   * 构建进度条
   */
  private buildProgressBar(current: number, total: number): string {
    // 确保参数有效
    if (total <= 0) return '[░░░░░░░░░░]';
    const ratio = Math.max(0, Math.min(1, current / total));
    const filled = Math.round(ratio * 10);
    const empty = 10 - filled;
    return `[${'▓'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  /**
   * 发送 Discord 消息
   */
  private async send(content: string): Promise<void> {
    try {
      if (this.webhookUrl) {
        // 使用 Webhook
        const res = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
          agent: this.agent,
        });
        
        if (!res.ok) {
          console.error('Discord webhook failed:', res.status, await res.text());
        }
      } else if (this.botToken && this.channelId) {
        // 使用 Bot Token
        const res = await fetch(`https://discord.com/api/v10/channels/${this.channelId}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bot ${this.botToken}`,
          },
          body: JSON.stringify({ content }),
          agent: this.agent,
        });
        
        if (!res.ok) {
          console.error('Discord API failed:', res.status, await res.text());
        }
      }
    } catch (error) {
      console.error('Discord notification failed:', error);
      // 不抛出错误，通知失败不应影响工作流执行
    }
  }

  /**
   * 直接发送消息（公共方法）
   */
  async sendDirect(content: string): Promise<void> {
    await this.send(content);
  }
}

// 单例
let notifier: DiscordNotifier | null = null;

export function getDiscordNotifier(): DiscordNotifier {
  if (!notifier) {
    notifier = new DiscordNotifier();
  }
  return notifier;
}
