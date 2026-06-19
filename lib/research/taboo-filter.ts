/**
 * 禁用词过滤器（lib/research/taboo-filter.ts）
 *
 * 与 skill/references/expression-dna.md §六 同源对齐。
 * SKILL.md 提到"后端会有过滤器二次拦截这些词，模型也要自觉"——
 * 本模块就是那个"后端过滤器"。
 *
 * P5a：
 *   - 9 个禁用词常量（统一真相源）
 *   - filterTaboo：整词匹配扫描，命中时拼接警告前缀 + 保留原文
 */

/** 禁用词列表（与 expression-dna.md §六 表格逐字对齐） */
export const TABOO_WORDS: string[] = [
  '辩证地看',
  '都有好处',
  '看个人兴趣',
  '行行出状元',
  '因人而异',
  '综合来看',
  '值得考虑',
  '各有千秋',
  '这个问题很复杂',
  '没有绝对的好坏',
];

/** filterTaboo 返回值 */
export interface TabooResult {
  /** 处理后文本（未命中=原文，命中=警告前缀+原文） */
  filtered: string;
  /** 命中的禁用词列表（空=无命中） */
  hits: string[];
}

/**
 * 扫描文本是否含禁用词，命中时拼接警告前缀。
 *
 * 匹配策略：整词包含匹配（`text.includes(word)`）。
 * 禁用词本身是 3-7 字的固定短语（如"辩证地看""因人而异"），
 * 不存在子串误触发风险（不会出现"辨证"触发"辩证地看"的情况）。
 *
 * 命中处理：保留原文不删改（忠实呈现模型输出），
 * 在文本前拼接警告清单，让用户自行判断。
 */
export function filterTaboo(text: string): TabooResult {
  if (!text) return { filtered: text, hits: [] };

  const hits: string[] = [];
  for (const word of TABOO_WORDS) {
    if (text.includes(word)) {
      hits.push(word);
    }
  }

  if (hits.length === 0) return { filtered: text, hits: [] };

  const warning =
    `> ⚠️ **表达 DNA 警告**：以下表述违反角色禁用词规范，请读者注意甄别。\n` +
    `> 禁用词命中：${hits.map((w) => `「${w}」`).join('、')}\n\n---\n\n`;

  return { filtered: warning + text, hits };
}
