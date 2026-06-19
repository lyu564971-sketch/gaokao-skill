/**
 * 共享的极简 markdown 渲染（lib/chat/format.ts）
 *
 * terminal-chat.tsx 的消息块渲染 与 section-report.tsx 的三段卡片内容渲染
 * 都用同一份实现，避免两份格式漂移（EXECUTION_RULES §6 文档同源）。
 *
 * P3d 增强（原在 terminal-chat.tsx，P4 提取到此处）：
 *   - 🟢🟡🟠⚪ → 内联可信度徽章（带 tooltip 和 CSS 变量着色）
 *   - [来源名] → 内联来源引用标记（带边框和悬停提示）
 *   - 保留粗体/行内 code 渲染
 */

/** 可信度 emoji → 内联徽章的 HTML（与 terminal-chat 原实现逐字一致） */
export function formatMarkdown(text: string): string {
  // HTML 实体转义（必须在正则替换之前）
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // P3d：可信度 emoji → 内联徽章
  // 🟢 A级（官方） / 🟡 B级（权威媒体） / 🟠 C级（第三方） / ⚪ 无数据（框架推断）
  html = html.replace(
    /🟢/g,
    '<span class="inline-flex items-center rounded-sm px-1 py-0.5 text-[10px] font-bold" style="background:var(--color-cred-a);color:#000" title="A级：官方数据（最高可信度）">🟢</span>'
  );
  html = html.replace(
    /🟡/g,
    '<span class="inline-flex items-center rounded-sm px-1 py-0.5 text-[10px] font-bold" style="background:var(--color-cred-b);color:#000" title="B级：权威媒体/报告">🟡</span>'
  );
  html = html.replace(
    /🟠/g,
    '<span class="inline-flex items-center rounded-sm px-1 py-0.5 text-[10px] font-bold" style="background:var(--color-cred-c);color:#000" title="C级：第三方平台（需交叉验证）">🟠</span>'
  );
  html = html.replace(
    /⚪/g,
    '<span class="inline-flex items-center rounded-sm border border-dashed px-1 py-0.5 text-[10px]" style="border-color:var(--color-cred-none);color:var(--color-fg-faint)" title="无数据：框架推断（保守估计）">⚪</span>'
  );

  // P3d：来源引用 [来源名] → 内联引用标记
  // 匹配方括号内非空文本（排除已是 HTML 标签的 [...]
  html = html.replace(
    /\[([^\]]{1,30})\]/g,
    '<span class="inline-flex items-center rounded-sm border px-1 py-0.5 font-mono text-[10px]" style="border-color:var(--color-border);color:var(--color-accent)" title="数据来源">$1</span>'
  );

  // 粗体和行内 code
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(
    /`(.*?)`/g,
    '<code class="font-mono bg-[var(--color-bg)] px-1 py-0.5 text-[var(--color-accent)]">$1</code>'
  );

  return html;
}
