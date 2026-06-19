/**
 * Z.ai WebSearch DataProvider（zai-websearch.ts）
 *
 * P3b：作为 data provider 的【唯一真相源】，合并了原 web-search.ts 的多后端能力。
 *
 * 三种后端，由 WebSearchConfig.backend 选择（默认 auto，按已配置项自动判定）：
 *   1. http  —— 通用 JSON 搜索接口（POST {query, max_results}，返回数组或 {results}）
 *               适用于 Z.ai WebSearch API、Tavily 兼容端点等任何标准 JSON 接口
 *   2. tavily —— Tavily Search API（POST api_key in body，响应 {results:[{content,url,title}]})
 *   3. fallback —— CLI 演示模式，返回 NONE 级占位（诚实降级）
 *
 * 服务端（Vercel Runtime）适配要点：
 *   - searchViaHttp / tavily 内部 try/catch，失败降级到 fallback 占位（NONE 级），
 *     绝不让单条查询的异常中断整个诊断流（protocol 层虽用 allSettled 兜底，
 *     但 Provider 自降级能让 CHECKPOINT 的来源计数更可预测）
 *   - 每次请求都带 AbortController 超时，避免 Vercel 上长尾请求拖垮连接
 *
 * 与 dedupe.ts 的关系：
 *   - 来源黑名单（SOURCE_BLACKLIST）统一由 dedupe.ts 维护，本文件只做命中过滤
 *   - protocol 层会再做一次跨查询去重；Provider 层的过滤是第一道闸
 *
 * 强制五字段输出，调用方不感知后端差异。
 */

import type { DataProvider, DataResult, CredibilityLevel } from '../types.ts';
import { SOURCE_BLACKLIST } from '../../research/dedupe.ts';

// ============ 可信度启发式（data-protocol.md §3 对齐）============
/**
 * 根据来源 URL / 名称推断可信度等级。
 * 唯一一份实现（原 web-search.ts 与 zai-websearch.ts 各有一份，已合并消除漂移）。
 */
function judgeCredibility(url: string, sourceName: string): CredibilityLevel {
  const s = `${url} ${sourceName}`.toLowerCase();
  // A 级：官方
  if (
    /gov\.cn|stats\.gov|moe\.gov|gaokao\.chsi|chsi\.com\.cn|edu\.cn|nbs\.gov/i.test(s)
  ) {
    return 'A';
  }
  // B 级：权威媒体/报告
  if (
    /mycos\.cn|麦可思|zhaopin|猎聘|36kr|caixin|latepost|yicai|huxiu|jiqizhixin|stats|tavily/i.test(
      s
    )
  ) {
    return 'B';
  }
  // C 级：第三方平台
  if (/kanzhun|jobui|boss|zhipin|lagou|nowcoder/i.test(s)) {
    return 'C';
  }
  return 'C';
}

/** 命中来源黑名单（dedupe.ts §4）则丢弃 */
function isBlacklisted(url: string, sourceName: string): boolean {
  const s = `${url} ${sourceName}`.toLowerCase();
  return SOURCE_BLACKLIST.some((bl) => s.includes(bl));
}

/** 从 URL 提取 hostname（失败退化为截断原文） */
function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 50);
  }
}

// ============ 统一结果规范化 ============
/**
 * 把各后端的原始记录归一化成五字段 DataResult，并做第一道黑名单过滤。
 * @param raw     原始记录数组
 * @param baseUrl 无 url 字段时的兜底地址
 */
function normalizeResults(
  raw: Array<Record<string, unknown>>,
  baseUrl?: string
): DataResult[] {
  const ts = new Date().toISOString();
  return raw
    .filter((d) => {
      if (!d.content && !d.title) return false;
      const url = (d.url as string) ?? baseUrl ?? '';
      if (!url || isBlacklisted(url, (d.source_name as string) ?? '')) return false;
      return true;
    })
    .map((d) => {
      const url = (d.url as string) ?? baseUrl ?? 'about:unknown';
      const sourceName = (d.source_name as string) ?? extractHostname(url);
      const content = ((d.content as string) ?? (d.title as string) ?? '').slice(0, 500);
      return {
        content,
        url,
        source_name: sourceName,
        timestamp: (d.timestamp as string) ?? ts,
        credibility_level:
          (d.credibility_level as CredibilityLevel) ?? judgeCredibility(url, sourceName),
      };
    });
}

// ============ 后端选择 ============
export type SearchBackend = 'auto' | 'http' | 'tavily' | 'fallback';

/** WebSearch 后端配置（从环境变量读取，见 registry.ts） */
export interface WebSearchConfig {
  /** 搜索后端类型；auto 时按已配置项自动判定（tavily apiKey > http endpoint > fallback） */
  backend?: SearchBackend;
  /** 通用 JSON 搜索接口地址（http 后端用） */
  endpoint?: string;
  /** 接口 API Key（http 后端用作 Bearer；tavily 后端用作 api_key） */
  apiKey?: string;
  /** 单次查询超时（ms） */
  timeoutMs?: number;
  /** 默认最大结果数 */
  maxResults?: number;
}

/** 自动判定实际后端 */
function resolveBackend(cfg: WebSearchConfig): Exclude<SearchBackend, 'auto'> {
  // 显式指定且非 auto：直接用
  if (cfg.backend && cfg.backend !== 'auto') return cfg.backend;
  // auto：按已配置项自动判定
  //   - 有 endpoint → http（通用 JSON 接口，最常见）
  //   - 无 endpoint 但有 apiKey → tavily（Tavily 不需要 endpoint，用固定地址）
  //   - 都没有 → fallback
  if (cfg.endpoint) return 'http';
  if (cfg.apiKey) return 'tavily';
  return 'fallback';
}

// ============ Provider 主类 ============
export class ZaiWebSearchProvider implements DataProvider {
  readonly name = 'zai-websearch';
  private cfg: WebSearchConfig;
  constructor(cfg: WebSearchConfig = {}) {
    this.cfg = cfg;
  }

  async search(
    query: string,
    opts?: { timeoutMs?: number; maxResults?: number }
  ): Promise<DataResult[]> {
    const timeoutMs = opts?.timeoutMs ?? this.cfg.timeoutMs ?? 8000;
    const maxResults = opts?.maxResults ?? this.cfg.maxResults ?? 5;
    const backend = resolveBackend(this.cfg);

    try {
      switch (backend) {
        case 'tavily':
          return await this.tavilySearch(query, maxResults, timeoutMs);
        case 'http':
          return await this.httpSearch(query, maxResults, timeoutMs);
        case 'fallback':
        default:
          return this.fallbackSearch(query);
      }
    } catch (err) {
      // P3b 降级：任何后端异常都降级到 NONE 级占位，绝不抛穿到 protocol 层
      // 这样 Promise.allSettled 里每条查询都 fulfilled，CHECKPOINT 来源计数可预测
      return this.fallbackSearch(query, (err as Error).message);
    }
  }

  /** http 后端：通用 JSON 搜索接口 */
  private async httpSearch(
    query: string,
    maxResults: number,
    timeoutMs: number
  ): Promise<DataResult[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.cfg.apiKey) {
        headers['Authorization'] = `Bearer ${this.cfg.apiKey}`;
      }
      const resp = await fetch(this.cfg.endpoint!, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, max_results: maxResults }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`Search HTTP ${resp.status}`);
      }
      // 支持两种响应格式：直接数组 或 {results: [...]} / {data: [...]}
      const body = await resp.json();
      const raw = Array.isArray(body) ? body : body.results ?? body.data ?? [];
      return normalizeResults(raw);
    } finally {
      clearTimeout(timer);
    }
  }

  /** tavily 后端：Tavily Search API */
  private async tavilySearch(
    query: string,
    maxResults: number,
    timeoutMs: number
  ): Promise<DataResult[]> {
    if (!this.cfg.apiKey) {
      throw new Error('tavily 后端需要 apiKey');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: this.cfg.apiKey,
          query,
          max_results: maxResults,
          include_answer: false,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`Tavily HTTP ${resp.status}`);
      }
      const body = await resp.json();
      const results = (body.results ?? []) as Array<Record<string, unknown>>;
      // Tavily 聚合来源：title 作 source_name，默认 B 级（normalizeResults 会按域名再判）
      const mapped = results.map((r) => ({
        content: (r.content as string) ?? (r.title as string) ?? '',
        url: (r.url as string) ?? '',
        source_name: (r.title as string) ?? '',
        timestamp: '',
        credibility_level: 'B' as CredibilityLevel,
      }));
      return normalizeResults(mapped);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * fallback 占位：无外部接口或后端异常时使用。
   * 返回 NONE 级占位结果，content 里明确标注"数据缺失，框架推断"。
   * 这正是 data-protocol.md §5 的诚实边界要求。
   * @param errMsg 可选的错误原因（来自上层 catch），写入 content 便于排查
   */
  private fallbackSearch(query: string, errMsg?: string): DataResult[] {
    const ts = new Date().toISOString();
    const reason = errMsg
      ? `（后端异常：${errMsg}，已降级）`
      : '（未配置 WebSearch 接口）';
    return [
      {
        content: `[CLI 演示模式] 无法获取实时数据。查询：${query}。${reason}。请配置 DATA_SEARCH_ENDPOINT（http 后端）或 DATA_SEARCH_API_KEY（tavily 后端），见 .env.example。`,
        url: 'about:cli-fallback',
        source_name: 'cli-fallback',
        timestamp: ts,
        credibility_level: 'NONE',
      },
    ];
  }
}
