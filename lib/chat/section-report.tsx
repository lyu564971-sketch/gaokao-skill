/**
 * 三段式报告组件 + 导出（lib/chat/section-report.tsx）
 *
 * P4：把 assistant 完成的报告从"扁平 markdown 一坨"升级为三张色条卡片，
 * 并提供 .md 下载 + 浏览器打印（另存为 PDF）。
 *
 * 设计原则：
 *   - 纯前端渲染层，不改后端协议（generateReport 已输出三段式 markdown）
 *   - 解析失败/流式中途自动 fallback 到单块 formatMarkdown，绝不崩
 *   - 零新依赖（Blob + window.print 纯浏览器 API）
 */

'use client';

import { useMemo } from 'react';
import type { ChatMessage, SourceItem } from './types';
import { formatMarkdown } from './format';

// ============ 三段定义 ============
export type SectionKey = 'diagnose' | 'recommend' | 'avoid';

interface Section {
  key: SectionKey;
  icon: string;
  /** 标准标题文案（用于卡片头显示，取实际匹配到的标题行） */
  title: string;
  /** 该段正文（markdown，去掉标题行后的内容） */
  body: string;
}

/**
 * 三段的锚点定义。每段给出若干可匹配的 emoji + 关键词。
 * 容错策略：匹配"任意位置出现该 emoji 且同行包含关键词"的行，
 * 兼容 `### 🎯 核心诊断与风险警告`、`🎯 核心诊断`、`### 核心诊断` 等变体。
 */
const SECTION_ANCHORS: { key: SectionKey; emoji: string; keywords: string[] }[] = [
  { key: 'diagnose', emoji: '🎯', keywords: ['核心诊断', '风险警告', '风险', '诊断'] },
  { key: 'recommend', emoji: '🏆', keywords: ['推荐方案', '推荐', '现实主义推荐'] },
  { key: 'avoid', emoji: '🛑', keywords: ['避坑', '避雷', '不能报'] },
];

/** 把三段式 markdown 切成结构化段落。解析不到三段返回 null（触发 fallback）。 */
export function parseSections(content: string): Section[] | null {
  if (!content || content.trim().length === 0) return null;

  const lines = content.split('\n');

  // 找每个 anchor 第一次出现的行号
  const hits: { section: SectionKey; emoji: string; lineIdx: number; title: string }[] = [];
  for (const anchor of SECTION_ANCHORS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 行内同时含 emoji 和任一关键词（关键词容错：标题文案可能有变体）
      const hasEmoji = line.includes(anchor.emoji);
      const hasKeyword = anchor.keywords.some((k) => line.includes(k));
      if (hasEmoji || hasKeyword) {
        // 标题行判定：要么以 # 开头，要么短（标题通常 ≤ 30 字符且不含句号）
        const isTitleish = line.trim().startsWith('#') || line.trim().length <= 30;
        if (isTitleish) {
          hits.push({
            section: anchor.key,
            emoji: anchor.emoji,
            lineIdx: i,
            title: line.replace(/^#+\s*/, '').trim() || anchor.keywords[0],
          });
          break; // 每个 anchor 只取第一次命中
        }
      }
    }
  }

  // 必须至少命中两段才算结构化（容错：模型偶尔漏一段，仍按已命中段渲染，避免退化）
  if (hits.length < 2) return null;

  // 按行号排序，确定每段的正文区间
  hits.sort((a, b) => a.lineIdx - b.lineIdx);

  const sections: Section[] = [];
  for (let h = 0; h < hits.length; h++) {
    const start = hits[h].lineIdx + 1; // 跳过标题行
    const end = h + 1 < hits.length ? hits[h + 1].lineIdx : lines.length;
    const body = lines.slice(start, end).join('\n').trim();
    sections.push({
      key: hits[h].section,
      icon: hits[h].emoji,
      title: hits[h].title,
      body,
    });
  }
  return sections;
}

// ============ 段落配色 ============
const SECTION_STYLES: Record<
  SectionKey,
  { bar: string; label: string; hint: string }
> = {
  diagnose: {
    bar: 'bg-[var(--color-accent)]',
    label: 'text-[var(--color-accent)]',
    hint: '核心诊断',
  },
  recommend: {
    bar: 'bg-[var(--color-cred-a)]',
    label: 'text-[var(--color-cred-a)]',
    hint: '推荐方案',
  },
  avoid: {
    bar: 'bg-[var(--color-danger)]',
    label: 'text-[var(--color-danger)]',
    hint: '避坑指南',
  },
};

// ============ 三段式卡片渲染 ============
/**
 * 渲染完成的报告。能解析成三段 → 三张色条卡片；否则 → 单块 fallback。
 */
export function SectionReport({ msg }: { msg: ChatMessage }) {
  const sections = useMemo(() => parseSections(msg.content), [msg.content]);

  // fallback：解析失败/流式中途，退回单块渲染（与旧行为一致）
  if (!sections) {
    return (
      <div
        className="whitespace-pre-wrap break-words"
        dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((s) => {
        const style = SECTION_STYLES[s.key];
        return (
          <div
            key={s.key}
            className="section-card flex overflow-hidden rounded-sm border border-[var(--color-border)] bg-[var(--color-bg)]"
          >
            {/* 左侧色条 */}
            <div className={`w-1 shrink-0 ${style.bar}`} aria-hidden />
            <div className="min-w-0 flex-1 px-4 py-3">
              {/* 段标题 */}
              <div className="mb-2 flex items-center gap-2">
                <span className="text-base leading-none">{s.icon}</span>
                <span className={`font-mono text-xs font-semibold uppercase tracking-widest ${style.label}`}>
                  {s.title}
                </span>
              </div>
              {/* 段正文 */}
              <div
                className="text-sm leading-relaxed text-[var(--color-fg)]"
                dangerouslySetInnerHTML={{
                  __html: formatMarkdown(s.body) || '<span class="text-[var(--color-fg-faint)]">（本段无内容）</span>',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============ 导出栏 ============
/**
 * 报告完成态的导出操作。仅 !streaming 时显示。
 * - 下载 .md：报告原文 + 来源清单拼接，Blob 下载
 * - 打印 / PDF：window.print() 触发浏览器对话框，依赖 globals.css @media print
 */
export function ExportBar({ msg }: { msg: ChatMessage }) {
  const handleDownloadMd = () => {
    const md = buildExportMarkdown(msg);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gaokao-report-${stamp()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="no-print mt-3 flex items-center gap-2 border-t border-[var(--color-border)] pt-3">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-fg-faint)]">
        导出
      </span>
      <button
        onClick={handleDownloadMd}
        className="border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] text-[var(--color-fg-dim)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        title="下载 Markdown 文件"
      >
        [ .md 下载 ]
      </button>
      <button
        onClick={handlePrint}
        className="border border-[var(--color-border)] px-2 py-1 font-mono text-[10px] text-[var(--color-fg-dim)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        title="打印或另存为 PDF"
      >
        [ 🖨 打印 / PDF ]
      </button>
    </div>
  );
}

// ============ 导出 markdown 构造 ============
/** 把报告消息 + 来源拼成完整可下载的 markdown 文档。 */
function buildExportMarkdown(msg: ChatMessage): string {
  const lines: string[] = [];
  lines.push(`# 高考志愿诊断报告`);
  lines.push('');
  lines.push(`> 生成时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push('> 来源：gaokao-realist · 现实主义志愿诊断终端');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(msg.content.trim());
  lines.push('');

  // 来源清单
  const sources = msg.sources ?? [];
  if (sources.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push(`## 数据来源（${sources.length} 条）`);
    lines.push('');
    for (const s of sources) {
      const cred = credEmoji(s.credibility_level);
      lines.push(`### ${cred} ${s.source_name}`);
      lines.push('');
      lines.push(`- 可信度：${cred} ${s.credibility_level} 级`);
      if (s.timestamp) lines.push(`- 时间：${s.timestamp}`);
      if (s.url) lines.push(`- 链接：${s.url}`);
      lines.push('');
      lines.push(`> ${s.content}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('_本报告数据已联网核查并标注可信度。⚪ 标记为框架推断，请谨慎参考。_');

  return lines.join('\n');
}

/** 可信度等级 → emoji（与 formatMarkdown 渲染一致） */
function credEmoji(level: string): string {
  switch (level) {
    case 'A':
      return '🟢';
    case 'B':
      return '🟡';
    case 'C':
      return '🟠';
    default:
      return '⚪';
  }
}

/** 本地时间戳，文件名用：YYYYMMDD-HHmm */
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
