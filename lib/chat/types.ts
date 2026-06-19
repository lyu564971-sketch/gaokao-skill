/**
 * 对话相关共享类型（lib/chat/types.ts）
 *
 * 前端与 SSE API 之间的类型契约。
 */

/** 可信度等级（与后端对齐） */
export type CredibilityLevel = 'A' | 'B' | 'C' | 'NONE';

/** 单条数据来源 */
export interface SourceItem {
  content: string;
  url: string;
  source_name: string;
  timestamp: string;
  credibility_level: CredibilityLevel;
}

/** 单条聊天消息 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 来源数据（assistant 消息完成后填充） */
  sources?: SourceItem[];
  /** 当前阶段（assistant 消息进行中时更新） */
  phase?: string;
  /** 是否在流式中（未完成） */
  streaming?: boolean;
  /** P5a：禁用词警告列表（后端 filterTaboo 命中时填充） */
  warnings?: string[];
}

/** 槽位采集状态 */
export interface SlotState {
  province: string;
  score: string;
  rank: string;
  subjects: string;
  familyBackground: string;
  careerGoal: string;
  exclusions: string;
}

/** SSE 事件 payload 联合类型 */
export type SSEPayload =
  | { type: 'user_message'; message: string }
  | { type: 'phase'; phase: string }
  | { type: 'slot_check'; complete: boolean; missing: string[]; followUp?: string }
  | { type: 'classify_result'; category: string; reason: string }
  | { type: 'research_query'; query: string }
  | { type: 'research_result'; query: string; results: SourceItem[] }
  | { type: 'checkpoint'; passed: boolean; issues: string[] }
  | { type: 'answer_delta'; delta: string }
  | { type: 'answer_done'; full: string }
  | { type: 'warning'; message: string }
  | { type: 'sources'; sources: SourceItem[] }
  | { type: 'error'; message: string };

/** 生成唯一 ID */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
