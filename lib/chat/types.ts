export type CredibilityLevel = "A" | "B" | "C" | "NONE";

export interface SourceItem {
  content: string;
  url: string;
  source_name: string;
  timestamp: string;
  credibility_level: CredibilityLevel;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[];
  phase?: string;
  streaming?: boolean;
  warnings?: string[];
}

export interface SlotState {
  province: string;
  score: string;
  rank: string;
  subjects: string;
  familyBackground: string;
  careerGoal: string;
  exclusions: string;
}

export type ChatMode = "apply" | "roast";

export interface ChatConversation {
  id: string;
  title: string;
  mode: ChatMode;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export type SSEPayload =
  | { type: "user_message"; message: string }
  | { type: "phase"; phase: string }
  | { type: "slot_check"; complete: boolean; missing: string[]; followUp?: string }
  | { type: "classify_result"; category: string; reason: string }
  | { type: "research_query"; query: string }
  | { type: "research_result"; query: string; results: SourceItem[] }
  | { type: "checkpoint"; passed: boolean; issues: string[] }
  | { type: "answer_delta"; delta: string }
  | { type: "answer_done"; full: string }
  | { type: "warning"; message: string }
  | { type: "sources"; sources: SourceItem[] }
  | { type: "error"; message: string };

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}
