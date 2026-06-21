'use client';

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from "react";
import type { ChatMessage, ChatMode, SlotState, SourceItem } from "./types";
import { uid } from "./types";

export type { ChatMessage, ChatMode, SlotState, SourceItem };

interface SendOptions {
  mode: ChatMode;
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  slots: SlotState;
  isStreaming: boolean;
  error: string | null;
  currentPhase: string;
  sendMessage: (text: string, options: SendOptions) => Promise<void>;
  updateSlot: (key: keyof SlotState, value: string) => void;
  replaceMessages: (nextMessages: ChatMessage[]) => void;
  reset: () => void;
  stop: () => void;
}

const EMPTY_SLOTS: SlotState = {
  province: "",
  score: "",
  rank: "",
  subjects: "",
  familyBackground: "",
  careerGoal: "",
  exclusions: "",
};

const PHASE_LABELS: Record<string, string> = {
  slot: "补齐考生信息",
  classify: "判断问题类型",
  research: "检索公开数据",
  checkpoint: "交叉核验结论",
  answer: "生成诊断报告",
};

function buildProfile(slots: SlotState) {
  const profile: Record<string, unknown> = {};

  if (slots.province.trim()) profile.province = slots.province.trim();
  if (slots.score.trim()) {
    const score = Number.parseInt(slots.score, 10);
    if (Number.isFinite(score)) profile.score = score;
  }
  if (slots.rank.trim()) {
    const rank = Number.parseInt(slots.rank, 10);
    if (Number.isFinite(rank)) profile.rank = rank;
  }
  if (slots.subjects.trim()) profile.subjects = slots.subjects.trim();
  if (slots.familyBackground.trim()) {
    profile.familyBackground = slots.familyBackground.trim();
  }
  if (slots.careerGoal.trim()) profile.careerGoal = slots.careerGoal.trim();
  if (slots.exclusions.trim()) {
    profile.exclusions = slots.exclusions
      .split(/[,，;；、\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return profile;
}

function extractPhase(data: unknown): string {
  if (typeof data === "string") return PHASE_LABELS[data] ?? data;
  if (data && typeof data === "object" && "phase" in data) {
    const phase = String((data as { phase: string }).phase);
    return PHASE_LABELS[phase] ?? phase;
  }
  return "正在处理";
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "请求中断，请稍后再试。";
}

function parseSseEvents(chunk: string, onEvent: (event: string, data: unknown) => void) {
  const blocks = chunk.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? "";

  for (const block of blocks) {
    let event = "message";
    const dataLines: string[] = [];

    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }

    if (!dataLines.length) continue;

    try {
      onEvent(event, JSON.parse(dataLines.join("\n")));
    } catch {
      onEvent(event, dataLines.join("\n"));
    }
  }

  return rest;
}

export function useChatStream(): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [slots, setSlots] = useState<SlotState>(EMPTY_SLOTS);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const updateAssistant = useCallback(
    (messageId: string, updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId ? updater(message) : message
        )
      );
    },
    []
  );

  const handleEvent = useCallback(
    (type: string, data: unknown, assistantId: string) => {
      if (type === "phase") {
        const phase = extractPhase(data);
        setCurrentPhase(phase);
        updateAssistant(assistantId, (message) => ({ ...message, phase }));
        return;
      }

      if (type === "slot_check") {
        const payload = data as { complete?: boolean; followUp?: string };
        if (payload.followUp && payload.complete === false) {
          updateAssistant(assistantId, (message) => ({
            ...message,
            phase: "等待补充信息",
          }));
        }
        return;
      }

      if (type === "answer_delta") {
        const delta = String((data as { delta?: string }).delta ?? "");
        updateAssistant(assistantId, (message) => ({
          ...message,
          content: message.content + delta,
        }));
        return;
      }

      if (type === "answer_done") {
        const full = (data as { full?: string }).full;
        updateAssistant(assistantId, (message) => ({
          ...message,
          content: typeof full === "string" && full ? full : message.content,
          streaming: false,
          phase: "完成",
        }));
        return;
      }

      if (type === "sources") {
        const sources = (data as { sources?: SourceItem[] }).sources ?? [];
        updateAssistant(assistantId, (message) => ({
          ...message,
          sources,
          streaming: false,
        }));
        return;
      }

      if (type === "warning") {
        const warning = String((data as { message?: string }).message ?? "表达需要复核");
        updateAssistant(assistantId, (message) => ({
          ...message,
          warnings: [...(message.warnings ?? []), warning],
        }));
        return;
      }

      if (type === "error") {
        const message = String((data as { message?: string }).message ?? "服务暂时不可用");
        setError(message);
        updateAssistant(assistantId, (assistant) => ({
          ...assistant,
          content: assistant.content
            ? `${assistant.content}\n\n错误：${message}`
            : `错误：${message}`,
          streaming: false,
          phase: "失败",
        }));
      }
    },
    [updateAssistant]
  );

  const sendMessage = useCallback(
    async (text: string, options: SendOptions) => {
      const cleanText = text.trim();
      if (!cleanText || isStreaming) return;

      const userMessage: ChatMessage = {
        id: uid("user"),
        role: "user",
        content: cleanText,
      };
      const assistantMessage: ChatMessage = {
        id: uid("assistant"),
        role: "assistant",
        content: "",
        phase: "排队处理",
        streaming: true,
      };

      setMessages((current) => [...current, userMessage, assistantMessage]);
      setIsStreaming(true);
      setError(null);
      setCurrentPhase("排队处理");

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: cleanText,
            mode: options.mode,
            profile: buildProfile(slots),
          }),
          signal: abort.signal,
        });

        if (!response.ok) {
          const payload = await response
            .json()
            .catch(() => ({ error: "请求失败，请稍后重试。" }));
          throw new Error(payload.error ?? "请求失败，请稍后重试。");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("服务没有返回可读取的响应流。");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          buffer = parseSseEvents(buffer, (event, data) => {
            handleEvent(event, data, assistantMessage.id);
          });
        }

        if (buffer.trim()) {
          parseSseEvents(`${buffer}\n\n`, (event, data) => {
            handleEvent(event, data, assistantMessage.id);
          });
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const message = extractErrorMessage(err);
          setError(message);
          updateAssistant(assistantMessage.id, (assistant) => ({
            ...assistant,
            content: assistant.content
              ? `${assistant.content}\n\n连接中断：${message}`
              : `连接中断：${message}`,
            streaming: false,
            phase: "失败",
          }));
        }
      } finally {
        setIsStreaming(false);
        setCurrentPhase("");
        abortRef.current = null;
      }
    },
    [handleEvent, isStreaming, slots, updateAssistant]
  );

  const updateSlot = useCallback((key: keyof SlotState, value: string) => {
    setSlots((current) => ({ ...current, [key]: value }));
  }, []);

  const replaceMessages = useCallback((nextMessages: ChatMessage[]) => {
    setMessages(nextMessages);
    setError(null);
    setCurrentPhase("");
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
    setCurrentPhase("");
    setMessages((current) =>
      current.map((message) =>
        message.streaming ? { ...message, streaming: false, phase: "已停止" } : message
      )
    );
  }, []);

  const reset = useCallback(() => {
    stop();
    setMessages([]);
    setSlots(EMPTY_SLOTS);
    setError(null);
  }, [stop]);

  return {
    messages,
    setMessages,
    slots,
    isStreaming,
    error,
    currentPhase,
    sendMessage,
    updateSlot,
    replaceMessages,
    reset,
    stop,
  };
}
