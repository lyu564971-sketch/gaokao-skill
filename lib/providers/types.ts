/**
 * Provider 接口定义（types.ts）
 *
 * 业务代码只依赖这里的接口，禁止直接 import 具体实现（见 EXECUTION_RULES.md §5）。
 * 这是"方便后续接入新 API"的可插拔契约。
 */

// ============ 数据查询 ============

/** 可信度等级，与 data-protocol.md 对齐 */
export type CredibilityLevel = 'A' | 'B' | 'C' | 'NONE';

/** 单条数据查询结果，强制五字段（见 data-protocol.md §6） */
export interface DataResult {
  /** 数据内容（含数值） */
  content: string;
  /** 来源 URL */
  url: string;
  /** 来源名称（如"麦可思"） */
  source_name: string;
  /** 数据时间（ISO 字符串，或"未知"） */
  timestamp: string;
  /** 可信度等级 */
  credibility_level: CredibilityLevel;
}

/** 数据查询 Provider 接口 */
export interface DataProvider {
  /** Provider 名称（用于日志/调试） */
  readonly name: string;

  /**
   * 执行一次搜索查询
   * @param query 查询语句（自然语言或关键词）
   * @param opts 可选：超时、最大结果数
   * @returns 去重后的结果数组，按可信度降序
   */
  search(
    query: string,
    opts?: { timeoutMs?: number; maxResults?: number }
  ): Promise<DataResult[]>;
}

// ============ LLM ============

/** LLM 消息角色 */
export type ChatRole = 'system' | 'user' | 'assistant';

/** 单条对话消息 */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** 非流式 chat 结果 */
export interface ChatResult {
  content: string;
  /** token 用量等元信息（可选） */
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** 流式回调：每收到一个 token 片段触发一次 */
export type StreamCallback = (delta: string) => void;

/** LLM Provider 接口 */
export interface LLMProvider {
  /** Provider 名称 */
  readonly name: string;

  /** 非流式对话 */
  chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<ChatResult>;

  /** 流式对话，逐 token 回调 */
  chatStream(
    messages: ChatMessage[],
    onDelta: StreamCallback,
    opts?: { temperature?: number }
  ): Promise<string>;
}

// ============ 配置 ============

/** Provider 工厂配置：从环境变量读取 */
export interface ProviderConfig {
  /** LLM 接口地址（OpenAI 兼容） */
  llmBaseUrl: string;
  /** LLM API Key */
  llmApiKey: string;
  /** LLM 模型名 */
  llmModel: string;
  /** 选用的 DataProvider 名称 */
  dataProvider: string;
  /** 选用的 LLMProvider 名称 */
  llmProvider: string;
}
