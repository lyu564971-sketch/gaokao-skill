/**
 * SSE 连接 hook（lib/chat/use-chat-stream.ts）
 *
 * 管理 /api/chat 的 SSE 连接：发送消息、解析事件、更新消息列表。
 * 不含 UI 逻辑，纯状态管理。
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, SlotState, SourceItem, uid } from './types';

export type { ChatMessage, SlotState, SourceItem };

/** hook 返回值 */
interface UseChatStreamReturn {
  messages: ChatMessage[];
  slots: SlotState;
  isStreaming: boolean;
  error: string | null;
  currentPhase: string;
  sendMessage: (text: string) => void;
  updateSlot: (key: keyof SlotState, value: string) => void;
  reset: () => void;
}

let _uidCounter = 0;
function nextId(): string {
  return `msg_${Date.now().toString(36)}_${(_uidCounter++).toString(36)}`;
}

/** 空槽位状态 */
const EMPTY_SLOTS: SlotState = {
  province: '',
  score: '',
  rank: '',
  subjects: '',
  familyBackground: '',
  careerGoal: '',
  exclusions: '',
};

export function useChatStream(): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [slots, setSlots] = useState<SlotState>(EMPTY_SLOTS);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  /** 发送消息到 SSE API */
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      // 添加用户消息
      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: text.trim(),
      };
      // 添加空的 assistant 占位
      const assistantMsg: ChatMessage = {
        id: nextId(),
        role: 'assistant',
        content: '',
        streaming: true,
        phase: '',
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setError(null);
      setCurrentPhase('');

      const abort = new AbortController();
      abortRef.current = abort;

      try {
        // 构建 profile（把 slots 里已填的传递给后端）
        const profile: Record<string, unknown> = {};
        if (slots.province) profile.province = slots.province;
        if (slots.score) profile.score = parseInt(slots.score, 10) || undefined;
        if (slots.rank) profile.rank = parseInt(slots.rank, 10) || undefined;
        if (slots.subjects) profile.subjects = slots.subjects;
        if (slots.familyBackground) profile.familyBackground = slots.familyBackground;
        if (slots.careerGoal) profile.careerGoal = slots.careerGoal;
        if (slots.exclusions)
          profile.exclusions = slots.exclusions.split(/[,，、]/).map((s) => s.trim());

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, profile }),
          signal: abort.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: '请求失败' }));
          setError(err.error ?? '请求失败');
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: `⚠ ${err.error ?? '请求失败'}`, streaming: false }
                : m
            )
          );
          setIsStreaming(false);
          return;
        }

        // 解析 SSE 流
        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // 解析 SSE 事件
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // 保留不完整的行

          let eventType = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              if (!eventType) continue;
              try {
                const data = JSON.parse(dataStr);
                handleEvent(eventType, data, assistantMsg.id);
              } catch {
                // 忽略解析失败的单条事件
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: `⚠ 连接中断: ${(err as Error).message}`, streaming: false }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        setCurrentPhase('');
        abortRef.current = null;
      }
    },
    [isStreaming, slots]
  );

  /** 处理单个 SSE 事件，更新消息状态 */
  const handleEvent = useCallback(
    (type: string, data: unknown, msgId: string) => {
      switch (type) {
        case 'phase':
          setCurrentPhase(data as string);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, phase: data as string } : m
            )
          );
          break;

        case 'slot_check': {
          const d = data as { complete: boolean; followUp?: string };
          // 如果槽位不全，后端已经返回了 followUp 文本
          // 更新 assistant 消息的 content（会通过 answer_delta 追加）
          break;
        }

        case 'answer_delta': {
          const d = data as { delta: string };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, content: m.content + d.delta }
                : m
            )
          );
          break;
        }

        case 'answer_done': {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, streaming: false } : m
            )
          );
          break;
        }

        case 'sources': {
          const d = data as { sources: SourceItem[] };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, sources: d.sources, streaming: false } : m
            )
          );
          break;
        }

        case 'warning': {
          // P5a：禁用词命中警告。将警告消息追加到 warnings 数组，
          // 前端 MessageItem 渲染时显示红色警告条。
          const d = data as { message: string };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? { ...m, warnings: [...(m.warnings ?? []), d.message] }
                : m
            )
          );
          break;
        }

        case 'error': {
          const d = data as { message: string };
          setError(d.message);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId
                ? {
                    ...m,
                    content: m.content + `\n\n⚠ 错误: ${d.message}`,
                    streaming: false,
                  }
                : m
            )
          );
          break;
        }
      }
    },
    []
  );

  /** 更新单个槽位值 */
  const updateSlot = useCallback((key: keyof SlotState, value: string) => {
    setSlots((prev) => ({ ...prev, [key]: value }));
  }, []);

  /** 重置对话 */
  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setSlots(EMPTY_SLOTS);
    setIsStreaming(false);
    setError(null);
    setCurrentPhase('');
  }, []);

  return { messages, slots, isStreaming, error, currentPhase, sendMessage, updateSlot, reset };
}
