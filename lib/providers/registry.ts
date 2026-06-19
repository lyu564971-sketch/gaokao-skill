/**
 * Provider 注册中心（registry.ts）
 *
 * 配置驱动：业务代码通过 getLLMProvider() / getDataProvider() 拿实例，
 * 换引擎只改环境变量，不改业务代码（EXECUTION_RULES.md §5）。
 */

import type { DataProvider, LLMProvider, ProviderConfig } from './types.ts';
import { ZaiWebSearchProvider } from './data/zai-websearch.ts';
import { GlmProvider } from './llm/glm.ts';

// 缓存单例（同进程内复用）
let _llm: LLMProvider | null = null;
let _data: DataProvider | null = null;

/** 从环境变量读取配置 */
export function loadConfig(): ProviderConfig {
  return {
    llmBaseUrl: process.env.LLM_BASE_URL ?? '',
    llmApiKey: process.env.LLM_API_KEY ?? '',
    llmModel: process.env.LLM_MODEL ?? 'glm-4.6',
    dataProvider: process.env.DATA_PROVIDER ?? 'zai-websearch',
    llmProvider: process.env.LLM_PROVIDER ?? 'glm',
  };
}

/** 获取 LLM Provider 实例 */
export function getLLMProvider(): LLMProvider {
  if (_llm) return _llm;
  const cfg = loadConfig();
  if (!cfg.llmBaseUrl || !cfg.llmApiKey) {
    throw new Error(
      'LLM 未配置：请在 .env 设置 LLM_BASE_URL 和 LLM_API_KEY（见 .env.example）'
    );
  }
  // 按 llmProvider 名分发（当前只有 glm，未来可扩展）
  switch (cfg.llmProvider) {
    case 'glm':
      _llm = new GlmProvider({
        baseUrl: cfg.llmBaseUrl,
        apiKey: cfg.llmApiKey,
        model: cfg.llmModel,
      });
      break;
    default:
      throw new Error(`未知 LLM provider: ${cfg.llmProvider}`);
  }
  return _llm;
}

/** 获取 Data Provider 实例 */
export function getDataProvider(): DataProvider {
  if (_data) return _data;
  const cfg = loadConfig();
  switch (cfg.dataProvider) {
    case 'zai-websearch':
      _data = new ZaiWebSearchProvider({
        // P3b：后端类型可显式指定（tavily/http/fallback），auto 时按已配置项自动判定。
        // 这样切 Tavily 不用改代码，只改 DATA_SEARCH_BACKEND + DATA_SEARCH_API_KEY。
        backend: (process.env.DATA_SEARCH_BACKEND as 'auto' | 'http' | 'tavily' | 'fallback' | undefined) ?? 'auto',
        endpoint: process.env.DATA_SEARCH_ENDPOINT,
        apiKey: process.env.DATA_SEARCH_API_KEY,
        timeoutMs: 8000,
      });
      break;
    default:
      throw new Error(`未知 data provider: ${cfg.dataProvider}`);
  }
  return _data;
}

/** 测试用：注入 mock provider（绕过环境变量） */
export function __setProvidersForTest(
  llm?: LLMProvider,
  data?: DataProvider
): void {
  if (llm) _llm = llm;
  if (data) _data = data;
}
