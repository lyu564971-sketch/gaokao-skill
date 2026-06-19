/**
 * GLM LLMProvider（glm.ts）
 *
 * 走 OpenAI 兼容接口（GLM/通义/Kimi/DeepSeek 等均兼容）。
 * 用 Node 内置 fetch（Node 18+ 原生支持），不依赖 openai SDK，规避 npm 问题。
 */

import type { LLMProvider, ChatMessage, ChatResult, StreamCallback } from '../types.ts';

export interface LLMConfig {
  /** OpenAI 兼容的接口地址，如 https://open.bigmodel.cn/api/paas/v4 */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 单次请求超时（ms） */
  timeoutMs?: number;
}

export class GlmProvider implements LLMProvider {
  readonly name = 'glm';
  private cfg: LLMConfig;
  constructor(cfg: LLMConfig) {
    this.cfg = cfg;
  }

  async chat(
    messages: ChatMessage[],
    opts?: { temperature?: number }
  ): Promise<ChatResult> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.cfg.timeoutMs ?? 30000
    );
    try {
      const resp = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model,
          messages,
          temperature: opts?.temperature ?? 0.7,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`LLM HTTP ${resp.status}: ${await resp.text()}`);
      }
      const data = await resp.json();
      return {
        content: data.choices?.[0]?.message?.content ?? '',
        usage: data.usage,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async chatStream(
    messages: ChatMessage[],
    onDelta: StreamCallback,
    opts?: { temperature?: number }
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      (this.cfg.timeoutMs ?? 60000) * 2
    );
    let full = '';
    try {
      const resp = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: this.cfg.model,
          messages,
          temperature: opts?.temperature ?? 0.7,
          stream: true,
        }),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        throw new Error(`LLM HTTP ${resp.status}`);
      }
      // 解析 SSE 流
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              full += delta;
              onDelta(delta);
            }
          } catch {
            // 不完整的 JSON，跳过等下一个 chunk
          }
        }
      }
      return full;
    } finally {
      clearTimeout(timer);
    }
  }
}
