'use client';

import { useEffect, useRef, useState } from "react";
import { useChatStream } from "./use-chat-stream";
import type { ChatConversation, ChatMessage, ChatMode, SourceItem } from "./types";
import { uid } from "./types";

const STORAGE_KEY = "gaokao-skill.conversations.v2";
const ACTIVE_KEY = "gaokao-skill.activeConversation.v2";
const THEME_KEY = "gaokao-skill.theme.v2";

const MODE_COPY: Record<
  ChatMode,
  {
    label: string;
    eyebrow: string;
    title: string;
    promise: string;
    placeholder: string;
    persona: string;
  }
> = {
  apply: {
    label: "报考",
    eyebrow: "先查数据，再给判断",
    title: "现实主义志愿诊断",
    promise: "把省份、分数、位次、选科、家庭条件说清楚，我会先补槽位，再查就业和录取线。",
    placeholder: "输入你的省份、分数、位次、选科和想法...",
    persona: "稳准狠",
  },
  roast: {
    label: "吐槽",
    eyebrow: "犀利一点，但不胡说",
    title: "志愿填报冷水机",
    promise: "适合快速拆幻想：我会保留事实边界，只把风险说得更直白。",
    placeholder: "把你的方案丢过来，我帮你挑风险...",
    persona: "别上头",
  },
};

const QUICK_PROMPTS = [
  "河南物化生，580分，位次大概6万，普通家庭，想稳就业，怎么报？",
  "我想学计算机，但分数只够普通二本，有没有更现实的替代方案？",
  "女生，想进体制内，师范、法学、护理哪个更稳？",
  "家里条件一般，不想读研，哪些专业最好直接避开？",
];

const SLOT_FIELDS = [
  { key: "province", label: "省份", placeholder: "河南" },
  { key: "score", label: "分数", placeholder: "580" },
  { key: "rank", label: "位次", placeholder: "60000" },
  { key: "subjects", label: "选科", placeholder: "物化生" },
  { key: "familyBackground", label: "家庭", placeholder: "一般 / 困难 / 优越" },
  { key: "careerGoal", label: "目标", placeholder: "求稳 / 高薪 / 体制内" },
  { key: "exclusions", label: "排除", placeholder: "不学医学、土木" },
] as const;

function createConversation(mode: ChatMode): ChatConversation {
  const now = Date.now();
  return {
    id: uid("chat"),
    title: "新对话",
    mode,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

function deriveTitle(messages: ChatMessage[]) {
  const firstUser = messages.find((message) => message.role === "user");
  if (!firstUser) return "新对话";
  return firstUser.content.replace(/\s+/g, " ").slice(0, 24);
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function safeReadConversations(): ChatConversation[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatConversation[];
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item) => item && typeof item.id === "string");
  } catch {
    return null;
  }
}

function credibilityLabel(source: SourceItem) {
  const labels: Record<SourceItem["credibility_level"], string> = {
    A: "官方/一手",
    B: "权威媒体",
    C: "第三方",
    NONE: "待核验",
  };
  return labels[source.credibility_level] ?? "待核验";
}

export default function TerminalChat() {
  const {
    messages,
    slots,
    isStreaming,
    error,
    currentPhase,
    sendMessage,
    updateSlot,
    replaceMessages,
    reset,
    stop,
  } = useChatStream();

  const [hydrated, setHydrated] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [mode, setMode] = useState<ChatMode>("apply");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [input, setInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const copy = MODE_COPY[mode];

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_KEY);
    const nextTheme = storedTheme === "dark" ? "dark" : "light";
    const stored = safeReadConversations();
    const initial = stored?.length ? stored : [createConversation("apply")];
    const storedActive = window.localStorage.getItem(ACTIVE_KEY);
    const active = initial.find((item) => item.id === storedActive) ?? initial[0];

    setTheme(nextTheme);
    setConversations(initial);
    setActiveId(active.id);
    setMode(active.mode);
    replaceMessages(active.messages ?? []);
    setHydrated(true);
  }, [replaceMessages]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (hydrated) window.localStorage.setItem(THEME_KEY, theme);
  }, [hydrated, theme]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, currentPhase]);

  useEffect(() => {
    if (!hydrated || !activeId) return;
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeId
          ? {
              ...conversation,
              mode,
              messages,
              title: deriveTitle(messages),
              updatedAt: Date.now(),
            }
          : conversation
      )
    );
  }, [activeId, hydrated, messages, mode]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    window.localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId, conversations, hydrated]);

  function startConversation(nextMode = mode) {
    const next = createConversation(nextMode);
    setConversations((current) => [next, ...current]);
    setActiveId(next.id);
    setMode(nextMode);
    reset();
  }

  function openConversation(conversation: ChatConversation) {
    if (conversation.id === activeId) return;
    stop();
    setActiveId(conversation.id);
    setMode(conversation.mode);
    replaceMessages(conversation.messages ?? []);
  }

  function deleteConversation(id: string) {
    const next = conversations.filter((conversation) => conversation.id !== id);
    if (!next.length) {
      const fresh = createConversation(mode);
      setConversations([fresh]);
      setActiveId(fresh.id);
      replaceMessages([]);
      return;
    }

    setConversations(next);
    if (id === activeId) {
      setActiveId(next[0].id);
      setMode(next[0].mode);
      replaceMessages(next[0].messages ?? []);
    }
  }

  function changeMode(nextMode: ChatMode) {
    setMode(nextMode);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeId ? { ...conversation, mode: nextMode } : conversation
      )
    );
  }

  async function submitMessage(text = input) {
    const clean = text.trim();
    if (!clean || isStreaming) return;
    setInput("");
    await sendMessage(clean, { mode });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="对话列表和考生档案">
        <div className="brand-block">
          <div className="brand-mark">高</div>
          <div>
            <div className="brand-title">现实主义志愿诊断</div>
            <div className="brand-subtitle">Gaokao Skill</div>
          </div>
        </div>

        <button className="new-chat-button" type="button" onClick={() => startConversation()}>
          新建对话
        </button>

        <div className="conversation-list">
          {conversations.map((conversation) => (
            <button
              className={`conversation-item ${conversation.id === activeId ? "active" : ""}`}
              key={conversation.id}
              type="button"
              onClick={() => openConversation(conversation)}
            >
              <span className="conversation-main">
                <span className="conversation-title">{conversation.title}</span>
                <span className="conversation-meta">
                  {MODE_COPY[conversation.mode].label} / {formatTime(conversation.updatedAt)}
                </span>
              </span>
              <span
                className="delete-chat"
                role="button"
                tabIndex={0}
                onClick={(event) => {
                  event.stopPropagation();
                  deleteConversation(conversation.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    deleteConversation(conversation.id);
                  }
                }}
                aria-label="删除对话"
              >
                x
              </span>
            </button>
          ))}
        </div>

        <section className="profile-card" aria-label="考生档案">
          <div className="section-kicker">考生档案</div>
          <div className="slot-grid">
            {SLOT_FIELDS.map((field) => (
              <label className="slot-field" key={field.key}>
                <span>{field.label}</span>
                <input
                  value={slots[field.key]}
                  onChange={(event) => updateSlot(field.key, event.target.value)}
                  placeholder={field.placeholder}
                />
              </label>
            ))}
          </div>
        </section>
      </aside>

      <section className="chat-stage">
        <header className="topbar">
          <div>
            <div className="mode-eyebrow">{copy.eyebrow}</div>
            <h1>{copy.title}</h1>
          </div>

          <div className="topbar-actions">
            <div className="mode-switch" role="tablist" aria-label="模式切换">
              {(["apply", "roast"] as ChatMode[]).map((item) => (
                <button
                  className={item === mode ? "selected" : ""}
                  key={item}
                  type="button"
                  onClick={() => changeMode(item)}
                >
                  {MODE_COPY[item].label}
                </button>
              ))}
            </div>
            <button className="ghost-button" type="button" onClick={() => setSettingsOpen(true)}>
              设置
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? "浅色" : "深色"}
            </button>
          </div>
        </header>

        <div className={`persona-strip ${mode}`}>
          <div className="persona-portrait" aria-hidden="true">
            <div className="portrait-glare" />
            <span>{copy.persona}</span>
          </div>
          <div>
            <div className="persona-name">现实派报考参谋</div>
            <p>{copy.promise}</p>
          </div>
          <div className="status-pill">
            {isStreaming ? currentPhase || "正在处理" : "服务端代理"}
          </div>
        </div>

        <div className="message-panel">
          {!messages.length ? (
            <section className="welcome-card">
              <div className="welcome-kicker">从一句真问题开始</div>
              <h2>别先问“我喜欢什么”，先问“这个选择毕业后怎么落地”。</h2>
              <p>
                输入省份、分数、位次、选科、家庭条件和目标。信息不够时，系统会先追问；信息够了才进入数据检索和诊断。
              </p>
              <div className="quick-prompts">
                {QUICK_PROMPTS.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => submitMessage(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            messages.map((message) => <MessageBubble key={message.id} message={message} />)
          )}
          <div ref={bottomRef} />
        </div>

        {error ? <div className="error-banner">{error}</div> : null}

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void submitMessage();
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitMessage();
              }
            }}
            placeholder={copy.placeholder}
            rows={2}
          />
          <div className="composer-actions">
            {isStreaming ? (
              <button className="secondary-action" type="button" onClick={stop}>
                停止
              </button>
            ) : null}
            <button className="send-button" type="submit" disabled={!input.trim() || isStreaming}>
              {isStreaming ? "分析中" : "发送"}
            </button>
          </div>
        </form>
      </section>

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSettingsOpen(false)}>
          <section className="settings-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" onClick={() => setSettingsOpen(false)}>
              x
            </button>
            <div className="section-kicker">API 设置</div>
            <h2>当前使用服务端代理</h2>
            <p>
              浏览器不会保存模型密钥。部署时只需要在 Render 环境变量里配置 LLM_PROVIDER、LLM_BASE_URL、LLM_API_KEY 和 LLM_MODEL。
            </p>
            <div className="settings-grid">
              <div>
                <span>调用入口</span>
                <strong>/api/chat</strong>
              </div>
              <div>
                <span>数据检索</span>
                <strong>服务端统一处理</strong>
              </div>
              <div>
                <span>本地记录</span>
                <strong>只保存对话文本</strong>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <article className={`message-bubble ${message.role}`}>
      <div className="message-label">
        <span>{message.role === "user" ? "你" : "诊断"}</span>
        {message.streaming && message.phase ? <em>{message.phase}</em> : null}
      </div>
      <div className="message-content">
        {message.content ? (
          message.content.split("\n").map((line, index) => (
            <p key={`${message.id}_${index}`}>{line || "\u00a0"}</p>
          ))
        ) : (
          <p className="typing-line">正在组织判断...</p>
        )}
      </div>
      {message.warnings?.length ? (
        <div className="warning-list">
          {message.warnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      ) : null}
      {message.sources?.length ? <SourceList sources={message.sources} /> : null}
    </article>
  );
}

function SourceList({ sources }: { sources: SourceItem[] }) {
  return (
    <div className="source-list">
      <div className="source-title">数据来源</div>
      {sources.slice(0, 6).map((source) => (
        <a
          href={source.url}
          key={`${source.url}_${source.content}`}
          rel="noreferrer"
          target="_blank"
          className="source-item"
        >
          <span>{credibilityLabel(source)}</span>
          <strong>{source.source_name || "未命名来源"}</strong>
          <small>{source.content}</small>
        </a>
      ))}
    </div>
  );
}
