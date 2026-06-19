/**
 * Agentic Protocol 编排核心（protocol.ts）
 *
 * 实现 SKILL.md §1 的三步工作流：
 *   Step1 问题分类 → Step2 现实主义研究（WebSearch）→ CHECKPOINT → Step3 诊断
 *
 * 这是产品唯一不可妥协的差异化：先查后答，绝不凭训练语料编薪资。
 *
 * P3 升级：
 *   - 结果去重（同 URL/同 content hash 压缩）
 *   - 来源黑名单过滤（data-protocol.md §4）
 *   - buildQueries 优化（无候选时按 rawQuestion 关键词发散）
 *   - 冷启动底座注入（occupational-data 快速校验）
 */

import type {
  LLMProvider,
  DataProvider,
  DataResult,
  ChatMessage,
} from '../providers/types.ts';
import { dedupeResults } from './dedupe.ts';

// ============ 冷启动底座（occupational-data.md 结构化）============
/**
 * 快速校验用：专业关键词 → 基线信息。
 * P3c：与 occupational-data.md 同源对齐（原 24 专业 → 现 34 专业），
 * 补齐了定向师范、基础理科、艺术类、泛管理、数据科学、信息安全等 md 提到但代码缺的项。
 * 关键词尽量用"专业核心词"，避免过短误匹配（见 injectBaseline 的边界匹配）。
 */
const BASELINE_DATA: Record<string, {
  medianSalary: string;
  mainEmployers: string;
  riskSignals: string;
}> = {
  // ---- 理工科（普通家庭优先方向）----
  '计算机': { medianSalary: '8-15k/月', mainEmployers: '互联网/软件/金融科技', riskSignals: '35岁危机、大厂裁员、AI替代初级岗' },
  '软件工程': { medianSalary: '8-15k/月', mainEmployers: '互联网/软件', riskSignals: '35岁危机、大厂裁员' },
  '电子信息': { medianSalary: '7-12k/月', mainEmployers: '华为/中兴/研究所/芯片', riskSignals: '需深造进核心研发' },
  '通信': { medianSalary: '7-12k/月', mainEmployers: '华为/中兴/运营商', riskSignals: '需深造' },
  '通信工程': { medianSalary: '7-12k/月', mainEmployers: '华为/中兴/运营商', riskSignals: '需深造' },
  '电气工程': { medianSalary: '6-10k/月', mainEmployers: '国网/南网/电力设计院', riskSignals: '需考研进好网局' },
  '电气': { medianSalary: '6-10k/月', mainEmployers: '国网/南网/电力设计院', riskSignals: '需考研进好网局' },
  '机械': { medianSalary: '6-9k/月', mainEmployers: '制造业/汽车/机器人', riskSignals: '起薪偏低、需积累' },
  '自动化': { medianSalary: '6-9k/月', mainEmployers: '制造业/汽车/机器人', riskSignals: '起薪偏低' },
  '土木': { medianSalary: '5-8k/月', mainEmployers: '设计院/施工/地产', riskSignals: '⚠️ 房地产下行，行业周期低谷' },
  '建筑': { medianSalary: '5-8k/月', mainEmployers: '设计院/施工', riskSignals: '⚠️ 房地产下行' },
  '人工智能': { medianSalary: '9-16k/月', mainEmployers: 'AI公司/互联网/金融', riskSignals: '门槛高、需名校' },
  '数据科学': { medianSalary: '8-14k/月', mainEmployers: '互联网/金融/咨询', riskSignals: '需名校+数学功底，普通校对口率低' },
  '大数据': { medianSalary: '8-14k/月', mainEmployers: '互联网/金融', riskSignals: '泛化方向多，警惕"贴牌"专业' },
  '信息安全': { medianSalary: '7-13k/月', mainEmployers: '网安公司/金融/体制内', riskSignals: '考编对口率高(网信办/公安网安)，但需技术硬' },
  '网络空间安全': { medianSalary: '7-13k/月', mainEmployers: '网安公司/体制内', riskSignals: '考编对口率高，门槛高' },
  // ---- 医学类 ----
  '临床医学': { medianSalary: '长周期35岁后起势', mainEmployers: '医院/诊所', riskSignals: '5+3规培起步、三甲需硕博' },
  '口腔医学': { medianSalary: '投入大但回报好', mainEmployers: '医院/自开诊所', riskSignals: '前期投入大' },
  '护理': { medianSalary: '4-7k/月', mainEmployers: '医院/养老机构', riskSignals: '就业率高但辛苦' },
  // ---- 经管法学类（需家庭资源/名校）----
  '金融': { medianSalary: '普通一本5-8k(柜员)', mainEmployers: '银行/保险/证券', riskSignals: '头部需target school、普通一本多柜员' },
  '金融学': { medianSalary: '普通一本5-8k(柜员)', mainEmployers: '银行/保险/证券', riskSignals: '头部需target school、普通一本多柜员' },
  '金融工程': { medianSalary: '需名校否则转柜员', mainEmployers: '证券/基金(头部)', riskSignals: '⚠️ 需家庭资源+名校，普通家庭慎选' },
  '会计': { medianSalary: '5-8k/月(普通)', mainEmployers: '企业财务/事务所', riskSignals: '需CPA、普通岗饱和' },
  '法学': { medianSalary: '法考通过率10-15%', mainEmployers: '律所/公检法/企业法务', riskSignals: '实习低薪3-5年、红圈所门槛极高' },
  // ---- 师范/编制类（普通家庭稳定方向）----
  '师范': { medianSalary: '需考编', mainEmployers: '学校/教育机构', riskSignals: '人口下降影响长期需求' },
  '公费师范': { medianSalary: '带编上岗', mainEmployers: '定向学校(有服务期)', riskSignals: '限制流动，但阶层稳、免学费' },
  '定向师范': { medianSalary: '带编上岗', mainEmployers: '定向学校(有服务期)', riskSignals: '限制流动6年+，违约记档' },
  '军警': { medianSalary: '系统内稳定', mainEmployers: '军队/公安系统', riskSignals: '分数门槛+政审体能' },
  // ---- 基础理科（需深造）----
  '数学': { medianSalary: '本科对口率低', mainEmployers: '转行/考公/深造', riskSignals: '⚠️ 需读博，本科就业难' },
  '物理学': { medianSalary: '本科对口率低', mainEmployers: '转行/教师/深造', riskSignals: '⚠️ 需读博才好就业' },
  '化学': { medianSalary: '对口率低', mainEmployers: '转行率高', riskSignals: '⚠️ 天坑、需读博' },
  // ---- 天坑/慎选类 ----
  '生物': { medianSalary: '对口率低', mainEmployers: '转行率高', riskSignals: '⚠️ 天坑、需读博' },
  '环境': { medianSalary: '对口率低', mainEmployers: '转行率高', riskSignals: '⚠️ 天坑、需读博' },
  '材料': { medianSalary: '对口率低', mainEmployers: '转行率高', riskSignals: '⚠️ 天坑、需读博' },
  '新闻': { medianSalary: '行业转型中', mainEmployers: '媒体/新媒体/转行', riskSignals: '传统媒体萎缩' },
  '外语': { medianSalary: '对口率下降', mainEmployers: '翻译/教育/转行', riskSignals: '⚠️ AI冲击严重' },
  // ---- 艺术/泛管理（困难家庭禁推）----
  '艺术': { medianSalary: '就业极窄', mainEmployers: '不稳定/转行', riskSignals: '⚠️ 投入巨大、需天赋资源、困难家庭禁推' },
  '音乐': { medianSalary: '就业极窄', mainEmployers: '教育/演出/转行', riskSignals: '⚠️ 投入巨大、需天赋资源' },
  '表演': { medianSalary: '就业极窄', mainEmployers: '不稳定', riskSignals: '⚠️ 幸存者偏差严重' },
  '管理': { medianSalary: '起薪低4-6k', mainEmployers: '泛岗/销售', riskSignals: '⚠️ 空泛无硬技能、替代性强' },
  '市场营销': { medianSalary: '起薪低4-6k', mainEmployers: '销售/运营', riskSignals: '⚠️ 门槛低、替代性强' },
  '旅游管理': { medianSalary: '起薪低3-5k', mainEmployers: '酒店/景区/旅行社', riskSignals: '⚠️ 行业波动、起薪低' },
};

/** 学生客观数据（用户输入） */
export interface StudentProfile {
  province?: string; // 省份
  score?: number; // 高考分数
  rank?: number; // 位次
  subjects?: string; // 选科（如"物化生"）
  familyBackground?: '困难' | '一般' | '优越' | string; // 家庭条件
  candidates?: string[]; // 候选学校/专业列表
  exclusions?: string[]; // 排除约束（"不学计算机" → ['计算机']）
  careerGoal?: string; // 就业诉求（求稳/求高薪/体制内/可深造）
  rawQuestion?: string; // 原始问题
}

/** 问题分类结果（Step 1） */
export type QuestionCategory = 'pure_framework' | 'needs_facts' | 'mixed';

/** Agentic Protocol 各阶段事件（流式回调用） */
export type ProtocolEvent =
  | { type: 'phase'; phase: 'slot' | 'classify' | 'research' | 'checkpoint' | 'answer' }
  | { type: 'slot_check'; complete: boolean; missing: string[]; followUp?: string }
  | { type: 'classify_result'; category: QuestionCategory; reason: string }
  | { type: 'research_query'; query: string }
  | { type: 'research_result'; query: string; results: DataResult[] }
  | { type: 'checkpoint'; passed: boolean; issues: string[] }
  | { type: 'answer_delta'; delta: string }
  | { type: 'answer_done'; full: string }
  | { type: 'error'; message: string };

export type ProtocolCallback = (event: ProtocolEvent) => void;

/** Protocol 编排器 */
export class AgenticProtocol {
  private llm: LLMProvider;
  private data: DataProvider;
  private systemPrompt: string;
  constructor(llm: LLMProvider, data: DataProvider, systemPrompt: string) {
    this.llm = llm;
    this.data = data;
    this.systemPrompt = systemPrompt;
  }

  /** 执行完整诊断流程 */
  async diagnose(
    profile: StudentProfile,
    onEvent?: ProtocolCallback
  ): Promise<{ report: string; sources: DataResult[] }> {
    const emit = onEvent ?? (() => {});
    const allSources: DataResult[] = [];

    // ---------- Step 0: 槽位采集 ----------
    emit({ type: 'phase', phase: 'slot' });
    const slotCheck = this.checkSlots(profile);
    emit({
      type: 'slot_check',
      complete: slotCheck.complete,
      missing: slotCheck.missing,
      followUp: slotCheck.followUp,
    });
    if (!slotCheck.complete) {
      const followUpReport = slotCheck.followUp ?? '请补充必要信息后再诊断。';
      emit({ type: 'answer_delta', delta: followUpReport });
      emit({ type: 'answer_done', full: followUpReport });
      return { report: followUpReport, sources: [] };
    }

    // ---------- Step 1: 问题分类 ----------
    emit({ type: 'phase', phase: 'classify' });
    const category = await this.classify(profile, emit);
    emit({
      type: 'classify_result',
      category: category.category,
      reason: category.reason,
    });

    // ---------- Step 2: 现实主义研究（需事实/混合才查） ----------
    let researchContext = '';
    if (category.category !== 'pure_framework') {
      emit({ type: 'phase', phase: 'research' });
      researchContext = await this.research(profile, emit, allSources);
    }

    // ---------- CHECKPOINT ----------
    emit({ type: 'phase', phase: 'checkpoint' });
    const checkpoint = this.checkpoint(profile, category.category, allSources);
    emit({ type: 'checkpoint', passed: checkpoint.passed, issues: checkpoint.issues });

    // ---------- Step 3: 现实主义诊断（流式） ----------
    emit({ type: 'phase', phase: 'answer' });
    const report = await this.generateReport(
      profile,
      category,
      researchContext,
      checkpoint,
      emit
    );

    return { report, sources: allSources };
  }

  /** Step 1：用 LLM 分类问题 */
  private async classify(
    profile: StudentProfile,
    emit: ProtocolCallback
  ): Promise<{ category: QuestionCategory; reason: string }> {
    const messages: ChatMessage[] = [
      { role: 'system', content: '你是一个问题分类器。只输出 JSON，不要其他文字。' },
      {
        role: 'user',
        content: `判断用户问题是哪一类：
- pure_framework：纯框架/策略问题（如"该不该复读""普通家庭选专业原则"），不依赖具体数据
- needs_facts：涉及具体院校/专业/薪资/录取线，必须查数据
- mixed：既有具体专业又有策略

用户输入：${JSON.stringify(profile)}

只返回 JSON：{"category":"...","reason":"一句话原因"}`,
      },
    ];
    try {
      const r = await this.llm.chat(messages, { temperature: 0 });
      const match = r.content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          category: parsed.category,
          reason: parsed.reason ?? '',
        };
      }
    } catch (e) {
      emit({ type: 'error', message: `分类失败: ${(e as Error).message}` });
    }
    return { category: 'needs_facts', reason: '分类失败，按需事实保守处理' };
  }

  /** Step 2：并行 WebSearch 多维度查数据 */
  private async research(
    profile: StudentProfile,
    emit: ProtocolCallback,
    sink: DataResult[]
  ): Promise<string> {
    const queries = this.buildQueries(profile);

    // 并行查询
    const settled = await Promise.allSettled(
      queries.map(async (q) => {
        emit({ type: 'research_query', query: q });
        const results = await this.data.search(q, { maxResults: 4 });
        emit({ type: 'research_result', query: q, results });
        return { query: q, results };
      })
    );

    // 收集成功结果（每个 query 的原始结果都先保留，下方统一去重）
    const allResults: { query: string; results: DataResult[] }[] = [];
    const pooled: DataResult[] = [];
    for (const s of settled) {
      if (s.status !== 'fulfilled') continue;
      allResults.push({ query: s.value.query, results: s.value.results });
      pooled.push(...s.value.results);
    }

    // 跨查询统一去重 + 黑名单过滤（见 dedupe.ts）
    const deduped = dedupeResults(pooled);
    const dedupedUrls = new Set(deduped.map((r) => r.url));

    // 把去重后的结果重新分桶回各 query（保留首次出现的 query 归属）
    const grouped: { query: string; results: DataResult[] }[] = [];
    for (const bucket of allResults) {
      const kept = bucket.results.filter((r) => dedupedUrls.has(r.url));
      if (kept.length > 0) {
        grouped.push({ query: bucket.query, results: kept });
      }
    }
    // 同一条结果可能被多个 query 命中；按 url 去重保证 sink 不重复
    const sinkSeen = new Set<string>();
    for (const r of deduped) {
      if (sinkSeen.has(r.url)) continue;
      sinkSeen.add(r.url);
      sink.push(r);
    }

    // 注入冷启动底座（对已识别的关键词补充基线数据）
    const baselineCtx = this.injectBaseline(profile);

    // 整理成上下文文本
    if (grouped.length === 0 && !baselineCtx) {
      return '⚠️ 实时数据获取失败或缺失，以下报告基于框架推断（诚实降级）。';
    }
    const parts: string[] = [];
    if (grouped.length > 0) {
      parts.push(
        grouped
          .map(
            ({ query, results }) =>
              `## 查询：${query}\n` +
              results
                .map(
                  (r) =>
                    `- [${r.credibility_level}] ${r.content} (来源: ${r.source_name}, ${r.timestamp})`
                )
                .join('\n')
          )
          .join('\n\n')
      );
    }
    if (baselineCtx) {
      parts.push(`## 冷启动底座校验（occupational-data.md，框架级基线）\n${baselineCtx}`);
    }
    return parts.join('\n\n');
  }

  /**
   * P3c：关键词边界匹配。
   * 避免 raw.includes(kw) 时"计算机"误匹配"计算机化"、"化学"误匹配"化学工程之外"等。
   * 用 Unicode 词边界 \b（中文按字符边界），对长关键词（≥2字符）做精确匹配。
   */
  private matchKeyword(text: string, keyword: string): boolean {
    if (!text || !keyword) return false;
    // 短关键词（1字）直接 includes，避免过度限制（如"金融"在"金融学"里）
    if (keyword.length <= 1) return text.includes(keyword);
    // 长关键词：确保不在更长的词内部被误匹配。
    // 策略：检查 keyword 出现位置的左右字符不是 CJK 汉字（即 keyword 是一个独立词）。
    const lower = text.toLowerCase();
    const kw = keyword.toLowerCase();
    let pos = lower.indexOf(kw);
    while (pos !== -1) {
      const left = pos > 0 ? lower[pos - 1] : '';
      const right = pos + kw.length < lower.length ? lower[pos + kw.length] : '';
      // 如果左右都不是 CJK 汉字，则是独立词
      const leftOk = !left || !/[\u4e00-\u9fff]/.test(left);
      const rightOk = !right || !/[\u4e00-\u9fff]/.test(right);
      if (leftOk && rightOk) return true;
      pos = lower.indexOf(kw, pos + 1);
    }
    return false;
  }

  /** 注入冷启动底座数据（P3c：用 matchKeyword 替代 includes，防误匹配） */
  private injectBaseline(profile: StudentProfile): string {
    const keywords = [
      ...(profile.candidates ?? []),
      profile.rawQuestion ?? '',
    ].join(' ');

    const lines: string[] = [];
    const matched = new Set<string>();

    for (const [kw, data] of Object.entries(BASELINE_DATA)) {
      if (this.matchKeyword(keywords, kw) && !matched.has(kw)) {
        matched.add(kw);
        lines.push(
          `- [BASELINE] ${kw}：中位数起薪 ${data.medianSalary}，主要去向 ${data.mainEmployers}，风险信号 ${data.riskSignals}`
        );
      }
    }
    return lines.length > 0 ? lines.join('\n') : '';
  }

  /**
   * 根据候选名单 + rawQuestion 构造查询语句。
   * P3c 升级：
   *   - 权威源引导词（麦可思/阳光高考），提高 A/B 级命中率
   *   - exclusions 过滤（用户排除的专业不再查询）
   *   - 无候选时用 matchKeyword 边界匹配（防误匹配）
   */
  private buildQueries(profile: StudentProfile): string[] {
    const base: string[] = [];
    const year = new Date().getFullYear();
    const candidates = (profile.candidates ?? []).filter((c) => {
      // P3c：exclusions 过滤 —— 用户说"不学XX"就从候选里去掉
      const exc = profile.exclusions ?? [];
      return !exc.some((e) => c.includes(e) || e.includes(c));
    });
    const raw = profile.rawQuestion ?? '';

    // 有明确候选：按候选逐个查三维（就业/录取/考公），带权威源引导词
    for (const c of candidates.slice(0, 5)) {
      base.push(`${c} 专业 就业中位数 月薪 麦可思 ${year}`);
      base.push(`${c} 录取分数线 位次 ${profile.province ?? ''} 阳光高考`);
      base.push(`${c} 考公 考编 对口率 就业去向`);
    }

    // 从 rawQuestion 提取专业关键词（匹配 BASELINE_DATA，用边界匹配）
    if (candidates.length === 0 && raw.length > 2) {
      const majorKeywords = Object.keys(BASELINE_DATA);
      const found: string[] = [];
      for (const kw of majorKeywords) {
        if (this.matchKeyword(raw, kw)) found.push(kw);
      }
      // 去重，最多取 3 个专业
      const unique = [...new Set(found)].slice(0, 3);
      for (const kw of unique) {
        base.push(`${kw} 专业 就业中位数 月薪 麦可思 ${year}`);
        base.push(`${kw} 录取分数线 位次 ${profile.province ?? ''} 阳光高考`);
        base.push(`${kw} 考公 考编 对口率 就业去向`);
      }

      // 如果没匹配到具体专业，按省份+分数段做宏观查询
      if (unique.length === 0) {
        const scoreRange = profile.score
          ? profile.score >= 600 ? '600分以上'
            : profile.score >= 500 ? '500-600分'
            : profile.score >= 400 ? '400-500分'
            : '400分以下'
          : '高分段';
        base.push(`${profile.province ?? ''} ${scoreRange} 能上什么大学 专业推荐 麦可思 ${year}`);
        base.push(`${profile.province ?? ''} 高考志愿填报 热门专业 就业率 ${year}`);
      }
    }

    return base.slice(0, 12);
  }

  /** CHECKPOINT：质量门控 */
  private checkpoint(
    profile: StudentProfile,
    category: QuestionCategory,
    sources: DataResult[]
  ): { passed: boolean; issues: string[] } {
    const issues: string[] = [];
    if (category !== 'pure_framework') {
      const realSources = sources.filter((r) => r.credibility_level !== 'NONE' && !r.url.startsWith('about:'));
      if (realSources.length < 3) {
        issues.push(`独立来源不足（仅 ${realSources.length} 条，需≥3）`);
      }
    }
    if (!profile.familyBackground) {
      issues.push('家庭条件未提供，决策树无法精确分流');
    }
    return { passed: issues.length === 0, issues };
  }

  /** Step 0：槽位完整性检查 + 反问话术生成 */
  private checkSlots(profile: StudentProfile): {
    complete: boolean;
    missing: string[];
    followUp?: string;
  } {
    const missing: string[] = [];
    if (!profile.province) missing.push('省份');
    if (profile.score == null && profile.rank == null) {
      missing.push('分数或位次');
    }
    if (!profile.familyBackground) missing.push('家庭背景');

    if (missing.length === 0) {
      return { complete: true, missing: [] };
    }

    const focus = missing.slice(0, 2);
    let followUp = '停。先别急着选专业——';
    const parts: string[] = [];
    if (focus.includes('家庭背景')) {
      parts.push('你家什么条件？普通工薪、有点积蓄、还是不愁钱？这直接决定我能推荐什么方向，不能省略');
    }
    if (focus.includes('分数或位次')) {
      parts.push('分数或省排名是多少？有位次给位次，比分数准');
    }
    if (focus.includes('省份') && !focus.includes('家庭背景')) {
      parts.push('哪个省？各省政策不一样，志愿数量和专业组规则都不同');
    }
    followUp += parts.join('；') + '。';

    return { complete: false, missing, followUp };
  }

  /** Step 3：流式生成三段式报告 */
  private async generateReport(
    profile: StudentProfile,
    category: { category: QuestionCategory; reason: string },
    researchContext: string,
    checkpoint: { passed: boolean; issues: string[] },
    emit: ProtocolCallback
  ): Promise<string> {
    const checkpointNote = checkpoint.passed
      ? 'CHECKPOINT 通过。'
      : `CHECKPOINT 警告：${checkpoint.issues.join('；')}。在报告中如实标注。`;

    const messages: ChatMessage[] = [
      { role: 'system', content: this.systemPrompt },
      {
        role: 'user',
        content: `## 学生客观数据
${JSON.stringify(profile, null, 2)}

## 问题分类
${category.category}（${category.reason}）

## 现实主义研究数据（来自 WebSearch + 冷启动底座）
${researchContext}

## 质量门控
${checkpointNote}

## 任务
按你的三段式输出规范给出诊断报告：
1. 🎯 核心诊断与风险警告（第一句必须是 headline 判断）
2. 🏆 现实主义推荐方案（3 项，每项带数据来源和可信度等级标记）
3. 🛑 绝对避坑指南（带数据来源）

严格遵守表达 DNA：短句、结论先行、不用禁忌词、对数据实事求是。

## 数据引用格式（强制遵守）
每个带数据的句子末尾，必须内嵌可信度 emoji + 来源引用：
- 可信度：🟢=A级官方/🟡=B级权威媒体/🟠=C级第三方/⚪=无数据（框架推断）
- 来源引用：[来源名]，如 [麦可思]、[教育部]、[智联招聘]、[框架推断]

示例格式：
"计算机专业毕业中位数月薪 8-15k 🟢 [麦可思 2024 报告]"
"金融普通一本多去银行柜员 🟡 [智联招聘]"
"数据缺失，基于框架推断 ⚪ [框架推断]"

注意：每个推荐方案至少带一个数据引用，不能用空话回避。`,
      },
    ];

    let full = '';
    try {
      full = await this.llm.chatStream(messages, (delta) =>
        emit({ type: 'answer_delta', delta })
      );
    } catch (e) {
      emit({ type: 'error', message: `流式失败，转非流式: ${(e as Error).message}` });
      const r = await this.llm.chat(messages);
      full = r.content;
      emit({ type: 'answer_delta', delta: full });
    }
    emit({ type: 'answer_done', full });
    return full;
  }
}
