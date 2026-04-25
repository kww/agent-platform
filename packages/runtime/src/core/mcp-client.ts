/**
 * MCP (Model Context Protocol) Client
 * 
 * 让 Step 层能够调用 MCP 工具
 * 
 * 支持的传输方式：
 * - stdio: 通过标准输入输出与 MCP Server 通信
 * - http: 通过 HTTP/SSE 与 MCP Server 通信
 */

import * as child_process from 'child_process';
import { EventEmitter } from 'events';

// MCP 类型定义
export interface MCPTool {
  name: string;
  title?: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'audio' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  // stdio 配置
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http 配置
  url?: string;
  headers?: Record<string, string>;
}

/**
 * MCP Client 管理器
 */
export class MCPClientManager extends EventEmitter {
  private servers: Map<string, MCPServerConfig> = new Map();
  private connections: Map<string, MCPConnection> = new Map();
  private toolCache: Map<string, MCPTool[]> = new Map();

  /**
   * 注册 MCP Server
   */
  registerServer(config: MCPServerConfig): void {
    this.servers.set(config.id, config);
    this.emit('server:registered', config);
  }

  /**
   * 注销 MCP Server
   */
  async unregisterServer(serverId: string): Promise<void> {
    const conn = this.connections.get(serverId);
    if (conn) {
      await conn.close();
      this.connections.delete(serverId);
    }
    this.servers.delete(serverId);
    this.toolCache.delete(serverId);
    this.emit('server:unregistered', serverId);
  }

  /**
   * 获取服务器配置
   */
  getServer(serverId: string): MCPServerConfig | undefined {
    return this.servers.get(serverId);
  }

  /**
   * 列出所有服务器
   */
  listServers(): MCPServerConfig[] {
    return Array.from(this.servers.values());
  }

  /**
   * 连接到服务器
   */
  async connect(serverId: string): Promise<MCPConnection> {
    const config = this.servers.get(serverId);
    if (!config) {
      throw new Error(`MCP Server not found: ${serverId}`);
    }

    let conn = this.connections.get(serverId);
    if (conn && conn.isConnected()) {
      return conn;
    }

    conn = new MCPConnection(config);
    await conn.connect();
    this.connections.set(serverId, conn);
    
    // 缓存工具列表
    const tools = await conn.listTools();
    this.toolCache.set(serverId, tools);
    
    this.emit('server:connected', serverId);
    return conn;
  }

  /**
   * 获取所有可用工具
   */
  async listAllTools(): Promise<Array<{ serverId: string; tool: MCPTool }>> {
    const result: Array<{ serverId: string; tool: MCPTool }> = [];

    for (const [serverId, config] of this.servers) {
      try {
        let tools = this.toolCache.get(serverId);
        
        if (!tools) {
          const conn = await this.connect(serverId);
          tools = await conn.listTools();
          this.toolCache.set(serverId, tools);
        }

        for (const tool of tools) {
          result.push({ serverId, tool });
        }
      } catch (error) {
        console.error(`[MCP] Failed to list tools from ${serverId}:`, error);
      }
    }

    return result;
  }

  /**
   * 调用工具
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, any>
  ): Promise<MCPToolResult> {
    const conn = await this.connect(serverId);
    return conn.callTool(toolName, args);
  }

  /**
   * 关闭所有连接
   */
  async closeAll(): Promise<void> {
    for (const [serverId, conn] of this.connections) {
      try {
        await conn.close();
      } catch (error) {
        console.error(`[MCP] Failed to close ${serverId}:`, error);
      }
    }
    this.connections.clear();
  }
}

/**
 * MCP 连接
 */
class MCPConnection {
  private config: MCPServerConfig;
  private process?: child_process.ChildProcess;
  private requestId = 0;
  private pendingRequests: Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private buffer = '';
  private connected = false;

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  /**
   * 连接到 MCP Server
   */
  async connect(): Promise<void> {
    if (this.config.transport === 'stdio') {
      await this.connectStdio();
    } else if (this.config.transport === 'http') {
      await this.connectHttp();
    }

    // 初始化连接
    await this.initialize();
    this.connected = true;
  }

  /**
   * stdio 连接
   */
  private async connectStdio(): Promise<void> {
    if (!this.config.command) {
      throw new Error('stdio transport requires command');
    }

    this.process = child_process.spawn(this.config.command, this.config.args || [], {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data) => {
      this.handleData(data.toString());
    });

    this.process.stderr?.on('data', (data) => {
      console.error(`[MCP ${this.config.id}] stderr:`, data.toString());
    });

    this.process.on('close', (code) => {
      console.log(`[MCP ${this.config.id}] process exited with code ${code}`);
      this.connected = false;
    });
  }

  /**
   * HTTP 连接（SSE）
   */
  private async connectHttp(): Promise<void> {
    // HTTP 连接不需要持久连接，每次请求时发送
    if (!this.config.url) {
      throw new Error('http transport requires url');
    }
  }

  /**
   * 初始化 MCP 协议
   */
  private async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'agent-runtime',
        version: '1.0.0'
      }
    });

    console.log(`[MCP ${this.config.id}] initialized:`, result.serverInfo);
  }

  /**
   * 列出工具
   */
  async listTools(): Promise<MCPTool[]> {
    const result = await this.sendRequest('tools/list', {});
    return result.tools || [];
  }

  /**
   * 调用工具
   */
  async callTool(name: string, args: Record<string, any>): Promise<MCPToolResult> {
    return this.sendRequest('tools/call', { name, arguments: args });
  }

  /**
   * 发送请求
   */
  private async sendRequest(method: string, params: any): Promise<any> {
    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      const request = JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params
      });

      if (this.config.transport === 'stdio') {
        this.process?.stdin?.write(request + '\n');
      } else if (this.config.transport === 'http') {
        this.sendHttpRequest(request).then(resolve).catch(reject);
        this.pendingRequests.delete(id);
      }

      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  /**
   * 发送 HTTP 请求
   */
  private async sendHttpRequest(body: string): Promise<any> {
    const response = await fetch(this.config.url!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers
      },
      body
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json() as {
      error?: { message?: string };
      result?: any;
    };
    if (data.error) {
      throw new Error(data.error.message || 'MCP error');
    }
    return data.result;
  }

  /**
   * 处理接收的数据
   */
  private handleData(data: string): void {
    this.buffer += data;

    // 尝试解析完整的 JSON 消息
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (error) {
        console.error(`[MCP ${this.config.id}] Failed to parse:`, line);
      }
    }
  }

  /**
   * 处理消息
   */
  private handleMessage(message: any): void {
    if (message.id !== undefined) {
      // 响应消息
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message || 'Unknown error'));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      // 通知消息
      console.log(`[MCP ${this.config.id}] notification:`, message.method);
    }
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
    this.connected = false;
  }
}

// 全局实例
export const mcpClientManager = new MCPClientManager();

/**
 * 从配置文件加载 MCP Servers
 */
export async function loadMCPServers(configPath: string): Promise<void> {
  const fs = await import('fs');
  
  if (!fs.existsSync(configPath)) {
    return;
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  const yaml = await import('yaml');
  const config = yaml.parse(content);

  if (config.mcpServers) {
    for (const [id, serverConfig] of Object.entries(config.mcpServers) as [string, any][]) {
      mcpClientManager.registerServer({
        id,
        name: serverConfig.name || id,
        transport: serverConfig.transport || 'stdio',
        command: serverConfig.command,
        args: serverConfig.args,
        env: serverConfig.env,
        url: serverConfig.url,
        headers: serverConfig.headers
      });
    }
  }
}
