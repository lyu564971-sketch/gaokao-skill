/**
 * TerminalChat 组件（lib/chat/terminal-chat.tsx）
 *
 * 深色终端美学对话 UI：
 * - 消息列表（用户/assistant 分区，assistant 支持流式渲染）
 * - 输入框 + 发送按钮
 * - 槽位采集面板（左侧或顶部，显示已收集/缺失状态）
 * - 阶段进度指示器
 * - 来源折叠面板
 */

'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { useChatStream } from './use-chat-stream';
import type { SlotState, ChatMessage, SourceItem } from './types';
import { formatMarkdown } from './format';
import { SectionReport, ExportBar } from './section-report';

// ============ 阶段标签映射 ============
const PHASE_LABELS: Record<string, { label: string; icon: string }> = {
  slot: { label: '槽位采集', icon: '📡' },
  classify: { label: '问题分类', icon: '🔍' },
  research: { label: '联网核查', icon: '🌐' },
  checkpoint: { label: '质量门控', icon: '🔒' },
  answer: { label: '生成报告', icon: '📝' },
};

// ============ 可信度徽章 ============
function CredBadge({ level }: { level: string }) {
  const colorMap: Record<string, string> = {
    A: 'bg-[var(--color-cred-a)]',
    B: 'bg-[var(--color-cred-b)]',
    C: 'bg-[var(--color-cred-c)]',
    NONE: 'border border-dashed border-[var(--color-cred-none)]',
  };
  const cls =
    colorMap[level] ?? 'border border-dashed border-[var(--color-cred-none)]';
  return (
    <span
      className={`inline-flex h-2.5 w-2.5 items-center justify-center rounded-full text-[8px] ${cls}`}
      title={level === 'NONE' ? '无数据' : level}
    >
      {level === 'A' ? '🟢' : level === 'B' ? '🟡' : level === 'C' ? '🟠' : '⚪'}
    </span>
  );
}

// ============ 来源折叠面板 ============
function SourcesPanel({ sources }: { sources: SourceItem[] }) {
  // 打印时强制展开（窗口无法点击，screen 态仍可折叠）
  const [open, setOpen] = useState(false);
  if (!sources || sources.length === 0) return null;

  return (
    <div className="print-visible mt-3 border-l-2 border-[var(--color-border)] pl-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 font-mono text-xs text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-fg)]"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>
          ▸
        </span>
        <span>数据来源 ({sources.length})</span>
      </button>
      {/*
        来源清单：始终渲染到 DOM，screen 折叠时用 hidden 隐藏，
        打印时由 .print-force-show 强制显示（window.print 无法触发点击展开）。
      */}
      <ul className={`print-force-show mt-2 space-y-2 ${open ? '' : 'hidden'}`}>
          {sources.map((s, i) => (
            <li key={i} className="text-xs leading-relaxed text-[var(--color-fg-dim)]">
              <div className="flex items-center gap-1.5">
                <CredBadge level={s.credibility_level} />
                <span className="font-medium text-[var(--color-fg)]">
                  {s.source_name}
                </span>
                <span className="text-[var(--color-fg-faint)]">{s.timestamp}</span>
              </div>
              <p className="mt-0.5 line-clamp-2">{s.content}</p>
              {s.url && (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block font-mono text-[10px] text-[var(--color-accent)] hover:underline"
                >
                  {s.url.slice(0, 60)}
                </a>
              )}
            </li>
          ))}
        </ul>
    </div>
  );
}

// ============ 单条消息渲染 ============
function MessageItem({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';

  return (
    <div className={`mb-4 ${isUser ? 'flex justify-end' : ''}`}>
      <div
        className={`rounded-sm border px-3 py-2.5 text-sm leading-relaxed sm:max-w-[85%] sm:px-4 sm:py-3 ${
          isUser
            ? 'border-[var(--color-accent-dim)] bg-[var(--color-bg-card)] text-[var(--color-fg)]'
            : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]'
        }`}
      >
        {/* 消息头 */}
        <div className="mb-1.5 flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-fg-faint)]">
            {isUser ? 'you' : 'diagnostic'}
          </span>
          {msg.phase && (
            <span className="rounded-sm bg-[var(--color-accent)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--color-bg)]">
              {(PHASE_LABELS[msg.phase]?.icon ?? '')}{' '}
              {PHASE_LABELS[msg.phase]?.label ?? msg.phase}
            </span>
          )}
          {msg.streaming && (
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
          )}
        </div>

        {/* 消息体 */}
        {/* assistant 完成态用三段式卡片；流式中途/解析失败用单块 fallback */}
        {!isUser && !msg.streaming ? (
          <SectionReport msg={msg} />
        ) : (
          <div
            className="whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{
              __html: formatMarkdown(msg.content),
            }}
          />
        )}

        {/* P5a：禁用词警告条 */}
        {msg.warnings && msg.warnings.length > 0 && (
          <div className="mt-2 rounded-sm border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 font-mono text-xs text-[var(--color-danger)]">
            {msg.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        {/* 来源面板 */}
        {!msg.streaming && msg.sources && <SourcesPanel sources={msg.sources} />}

        {/* 导出栏：仅 assistant 完成态显示 */}
        {!isUser && !msg.streaming && msg.content.trim().length > 0 && (
          <ExportBar msg={msg} />
        )}
      </div>
    </div>
  );
}

/**
 * 极简 markdown 渲染（粗体 + 行内 code + 可信度徽章 + 来源引用）
 *
 * P4：实现已提取到 lib/chat/format.ts，供 terminal-chat 与 section-report 共享，
 * 消除两份格式漂移风险（EXECUTION_RULES §6 文档同源）。此处仅 re-export 保持向后兼容。
 *
 * 历史 P3d 增强说明（逻辑现归 format.ts）：
 *   - 🟢🟡🟠⚪ → 内联可信度徽章（带 tooltip 和 CSS 变量着色）
 *   - [来源名] → 内联来源引用标记（带边框和悬停提示）
 *   - 保留原有粗体/代码渲染
 */

// ============ 槽位采集面板 ============
function SlotPanel({
  slots,
  onUpdate,
  disabled,
}: {
  slots: SlotState;
  onUpdate: (key: keyof SlotState, value: string) => void;
  disabled: boolean;
}) {
  const fields: { key: keyof SlotState; label: string; placeholder: string; required: boolean }[] = [
    { key: 'province', label: '省份', placeholder: '如：河南', required: true },
    { key: 'score', label: '分数', placeholder: '如：620', required: false },
    { key: 'rank', label: '位次', placeholder: '如：15000', required: false },
    { key: 'subjects', label: '选科', placeholder: '如：物化生', required: false },
    { key: 'familyBackground', label: '家庭条件', placeholder: '困难/一般/优越', required: true },
    { key: 'careerGoal', label: '就业诉求', placeholder: '求稳/求高薪/体制内/可深造', required: false },
    { key: 'exclusions', label: '排除专业', placeholder: '如：计算机,医学', required: false },
  ];

  return (
    <div className="space-y-2">
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
          <label className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-fg-faint)] sm:w-20 sm:shrink-0 sm:text-right">
            {f.label}
            {f.required && <span className="ml-0.5 text-[var(--color-danger)]">*</span>}
          </label>
          <input
            type="text"
            value={slots[f.key]}
            onChange={(e) => onUpdate(f.key, e.target.value)}
            placeholder={f.placeholder}
            disabled={disabled}
            className="flex-1 border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-mono text-xs text-[var(--color-fg)] placeholder-[var(--color-fg-faint)] transition-colors focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50"
          />
          {f.required && slots[f.key] && (
            <span className="text-[var(--color-cred-a)] text-xs">✓</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ============ 主组件：TerminalChat ============
export default function TerminalChat() {
  const {
    messages,
    slots,
    isStreaming,
    error,
    currentPhase,
    sendMessage,
    updateSlot,
    reset,
  } = useChatStream();

  const [input, setInput] = useState('');
  const [showSlots, setShowSlots] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // 快捷键：Enter 发送，Shift+Enter 换行
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input);
    setInput('');
    // 收起槽位面板（首次发送后）
    if (messages.length === 0) setShowSlots(false);
  };

  return (
    <div className="flex h-screen flex-col bg-[var(--color-bg)]">
      {/* 顶栏 */}
      <header className="no-print flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href="/"
            className="font-mono text-xs text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-accent)]"
          >
            ←
          </a>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
            <span className="hidden font-mono text-xs uppercase tracking-widest text-[var(--color-fg-dim)] sm:inline">
              gaokao-realist · diagnostic
            </span>
            {/* P5b: 移动端只显示 logo 圆点，隐藏长文本 */}
            <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-fg-dim)] sm:hidden">
              diagnostic
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* 当前阶段 */}
          {currentPhase && (
            <span className="rounded-sm bg-[var(--color-accent)] px-2 py-0.5 font-mono text-[10px] font-semibold text-[var(--color-bg)]">
              {PHASE_LABELS[currentPhase]?.icon ?? ''}{' '}
              {PHASE_LABELS[currentPhase]?.label ?? currentPhase}
            </span>
          )}
          <button
            onClick={reset}
            className="font-mono text-xs text-[var(--color-fg-faint)] transition-colors hover:text-[var(--color-danger)]"
            title="重置对话"
          >
            [ RESET ]
          </button>
        </div>
      </header>

      {/* 主体：消息列表 */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-4 sm:px-4 sm:py-6">
        {messages.length === 0 ? (
          /* 空状态：欢迎 + 槽位面板 */
          <div className="mx-auto max-w-2xl">
            <div className="mb-6 text-center sm:mb-8">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--color-accent)] sm:text-xs">
                // 现实主义志愿诊断终端
              </div>
              <p className="text-base font-semibold sm:text-lg">
                别跟我谈理想。先看就业中位数。
              </p>
              <p className="mt-2 text-sm text-[var(--color-fg-dim)]">
                输入你的高考分数、位次、家庭条件，终端先联网核查数据，再给出诊断报告。
              </p>
            </div>

            {/* 槽位采集面板 */}
            <div className="no-print mb-6 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-accent)]">
                  // Step 0: 槽位采集
                </span>
                <button
                  onClick={() => setShowSlots(!showSlots)}
                  className="font-mono text-[10px] text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]"
                >
                  [{showSlots ? '收起' : '展开'}]
                </button>
              </div>
              {showSlots && (
                <SlotPanel
                  slots={slots}
                  onUpdate={updateSlot}
                  disabled={isStreaming}
                />
              )}
            </div>

            {/* 提示 */}
            <div className="font-mono text-center text-xs text-[var(--color-fg-faint)]">
              填写信息后直接在下方输入你的问题，或按 Enter 发送
            </div>
          </div>
        ) : (
          /* 消息列表 */
          <div className="mx-auto max-w-3xl">
            {/* 槽位快捷栏（折叠） */}
            {showSlots && (
              <div className="no-print mb-4 rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-card)] p-2.5 sm:p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase text-[var(--color-fg-faint)]">
                    槽位状态
                  </span>
                  <button
                    onClick={() => setShowSlots(false)}
                    className="font-mono text-[10px] text-[var(--color-fg-faint)] hover:text-[var(--color-fg)]"
                  >
                    [ 收起 ]
                  </button>
                </div>
                <SlotPanel
                  slots={slots}
                  onUpdate={updateSlot}
                  disabled={isStreaming}
                />
              </div>
            )}
            {messages.map((msg) => (
              <MessageItem key={msg.id} msg={msg} />
            ))}
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mx-auto mt-4 max-w-3xl rounded-sm border border-[var(--color-danger)] bg-[var(--color-danger)]/10 px-3 py-2 font-mono text-xs text-[var(--color-danger)] sm:px-4">
            ⚠ {error}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="no-print border-t border-[var(--color-border)] px-2 py-2 sm:px-4 sm:py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          {/* 槽位快捷切换 */}
          <button
            onClick={() => setShowSlots(!showSlots)}
            className={`mb-1.5 shrink-0 border px-2 py-1 font-mono text-[10px] transition-colors ${
              showSlots
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-[var(--color-border)] text-[var(--color-fg-faint)] hover:text-[var(--color-fg-dim)]'
            }`}
            title="切换槽位面板"
          >
            槽位
          </button>

          {/* 输入框 */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isStreaming
                ? '正在诊断中...'
                : '输入你的问题（Enter 发送，Shift+Enter 换行）'
            }
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 font-mono text-sm text-[var(--color-fg)] placeholder-[var(--color-fg-faint)] transition-colors focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50"
          />

          {/* 发送按钮 */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            className="mb-1.5 shrink-0 border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 py-1.5 font-mono text-xs font-semibold text-[var(--color-bg)] transition-all hover:bg-transparent hover:text-[var(--color-accent)] disabled:border-[var(--color-border)] disabled:bg-transparent disabled:text-[var(--color-fg-faint)]"
          >
            &gt;_ 发送
          </button>
        </div>
      </div>
    </div>
  );
}
