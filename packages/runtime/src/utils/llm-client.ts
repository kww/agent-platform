/**
 * LLM 客户端 - OpenAI 兼容 API
 * 
 * 用法：
 * 1. 环境变量配置：LLM_API_KEY, LLM_BASE_URL, LLM_MODEL
 * 2. 直接传入配置：createLLMClient({ apiKey: '...', ... })
 */

export interface LLMClientConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeout?: number;
}

export interface LLMClient {
  chat(prompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string>;
  chatWithHistory(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, options?: { temperature?: number }): Promise<string>;
}

/**
 * 创建 LLM 客户端
 */
export function createLLMClient(config: LLMClientConfig = {}): LLMClient {
  const apiKey = config.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseUrl = config.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const model = config.model || process.env.LLM_MODEL || 'gpt-3.5-turbo';
  const timeout = config.timeout || 60000;

  if (!apiKey) {
    console.warn('[LLM Client] No API key configured. Set LLM_API_KEY environment variable or pass apiKey in config.');
  }

  return {
    async chat(prompt: string, options?: { temperature?: number; maxTokens?: number }): Promise<string> {
      return this.chatWithHistory([{ role: 'user', content: prompt }], options);
    },

    async chatWithHistory(
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
      options?: { temperature?: number }
    ): Promise<string> {
      if (!apiKey) {
        throw new Error('LLM API key not configured');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: options?.temperature ?? 0.7,
            max_tokens: 2000,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`LLM API error: ${response.status} ${error}`);
        }

        const data = await response.json() as any;
        
        // 兼容 OpenAI 和 DeepSeek 等格式
        return data.choices?.[0]?.message?.content || 
               data.choices?.[0]?.message?.reasoning_content || '';
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('LLM request timeout');
        }
        throw error;
      }
    },
  };
}

/**
 * 默认 LLM 客户端（懒加载）
 */
let defaultClient: LLMClient | null = null;

export function getDefaultLLMClient(): LLMClient {
  if (!defaultClient) {
    defaultClient = createLLMClient();
  }
  return defaultClient;
}
