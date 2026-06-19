/**
 * 数据结果去重 + 来源过滤（dedupe.ts）
 *
 * P3a：把 protocol.research() 里散落的"黑名单过滤 + URL 去重"抽成独立、可测的纯函数。
 *
 * 三层去重（任一命中即视为重复）：
 *   1. URL 规范化键：去协议、去 www、去跟踪参数、去 fragment、去尾斜杠、小写 host
 *      —— 解决 mobile/desktop、带 utm_source、http/https 同文的漏网
 *   2. content 归一化哈希：去空白标点、取前 200 字符 hash
 *      —— 解决不同 URL 转载同一份新闻的雷同内容
 *   3. host + title 前缀：同一站点、标题前 40 字符完全相同
 *      —— 解决同源重复推送
 *
 * 来源黑名单：data-protocol.md §4 的不可信来源（知乎/公众号/百科等）。
 */

import type { DataResult } from '../providers/types.ts';

// ============ 来源黑名单（data-protocol.md §4）============
export const SOURCE_BLACKLIST = [
  'zhihu.com',        // 知乎：营销号泛滥
  'mp.weixin.qq.com', // 微信公众号：不可验证
  'baike.baidu.com',  // 百度百科：错误率高
  'zhidao.baidu.com', // 百度知道
  'douyin.com',       // 抖音短视频
  'kuaishou.com',     // 快手短视频
];

/** 跟踪参数：同一内容常带这些参数被多次抓取，规范化时清掉 */
const TRACKING_QUERY_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'from', 'share_source', 'share_token', 'ref', 'source', 'sp', 'nsukey',
  'isappinstalled', 'weixinbridge', 'wxshare_count',
]);

/**
 * URL 规范化：返回稳定的去重键（无法解析的 URL 退化为 trim+小写原文）。
 * 例：
 *   https://www.mycos.cn/news/x?a=1&b=2  与
 *   http://mycos.cn/news/x/?b=2&a=1&utm_source=wx  →  mycos.cn/news/x  (a=1&b=2)
 *   about:cli-fallback  →  about:cli-fallback  （保留占位符）
 */
export function normalizeUrl(raw: string): string {
  const trimmed = (raw ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  // 占位符/about:blank 这类不解析，原样返回（小写）
  if (/^(about|javascript|data):/.test(trimmed)) return trimmed;

  try {
    const u = new URL(trimmed);
    // 去 www. 前缀
    let host = u.hostname.replace(/^www\./, '');
    // 去尾斜杠
    let path = u.pathname.replace(/\/+$/, '') || '/';
    // 过滤跟踪参数，剩余按字典序排列
    const keep = Array.from(u.searchParams.entries())
      .filter(([k]) => !TRACKING_QUERY_PARAMS.has(k))
      .map(([k, v]) => `${k}=${v}`)
      .sort();
    const qs = keep.length > 0 ? `?${keep.join('&')}` : '';
    return `${host}${path}${qs}`;
  } catch {
    // 无法解析：退化为 trim+小写
    return trimmed;
  }
}

/** 简易稳定哈希（djb2），返回 36 进制短串 */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0; // |0 强制 int32
  }
  return (h >>> 0).toString(36);
}

/**
 * content 归一化：去所有空白/标点/全角符号，取前 200 字符做哈希。
 * 用于识别"不同 URL 但内容雷同"的转载。
 */
export function contentFingerprint(content: string): string {
  const norm = (content ?? '')
    .toLowerCase()
    // 中英文标点 + 空白 + 换行全去掉
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .slice(0, 200);
  return hash(norm);
}

/** host 提取（用于 host+title 去重） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** 标题/内容前缀键 */
function titlePrefix(content: string): string {
  const t = (content ?? '').trim().replace(/\s+/g, ' ').slice(0, 40).toLowerCase();
  return t;
}

/**
 * 去重 + 黑名单过滤主函数。
 *
 * @param results  原始结果数组（可能来自多个并行查询的汇总）
 * @param opts     可选：保留首次出现的（默认 true），即"先到先得"
 * @returns        过滤+去重后的结果数组（保持原相对顺序）
 */
export function dedupeResults(
  results: DataResult[],
  opts: { keepFirst?: boolean } = {}
): DataResult[] {
  const keepFirst = opts.keepFirst ?? true;

  const seenUrl = new Set<string>();
  const seenContent = new Set<string>();
  const seenHostTitle = new Set<string>();
  const out: DataResult[] = [];

  const iter = keepFirst ? results : [...results].reverse();
  for (const r of iter) {
    // 1. 黑名单（url 或 source_name 命中即丢弃）
    const blHit = SOURCE_BLACKLIST.some(
      (bl) => r.url.includes(bl) || r.source_name.includes(bl)
    );
    if (blHit) continue;

    // 2. URL 规范化键
    const urlKey = normalizeUrl(r.url);
    if (urlKey && seenUrl.has(urlKey)) continue;

    // 3. content 指纹键
    const contentKey = contentFingerprint(r.content);
    if (contentKey && seenContent.has(contentKey)) continue;

    // 4. host + title 前缀键（同站点同标题大概率重复）
    const host = hostOf(r.url);
    const titleKey = host ? `${host}::${titlePrefix(r.content)}` : '';
    if (titleKey && seenHostTitle.has(titleKey)) continue;

    // 均未命中：收录
    if (urlKey) seenUrl.add(urlKey);
    if (contentKey) seenContent.add(contentKey);
    if (titleKey) seenHostTitle.add(titleKey);
    out.push(r);
  }
  return keepFirst ? out : out.reverse();
}
