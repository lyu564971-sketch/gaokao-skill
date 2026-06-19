/**
 * CLI 原型主入口（run.ts）
 *
 * 跑通 Agentic Protocol 全链路：输入分数 → 分类 → WebSearch → 报告。
 * 纯 Node 内置模块，零第三方依赖（规避当前 npm 损坏问题，见 BUG-002）。
 *
 * 用法：
 *   node --experimental-strip-types D:\gaokao-skill\cli\run.ts
 *
 * 环境变量（见 .env.example）：
 *   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
 *   DATA_PROVIDER / DATA_SEARCH_ENDPOINT
 *
 * 演示模式（无 LLM key）：加 --demo 走 mock，验证编排逻辑本身。
 */

import { loadSkillPrompt, loadSkillName } from '../lib/skill/loader.ts';
import { AgenticProtocol, type StudentProfile, type ProtocolEvent } from '../lib/research/protocol.ts';
import { GlmProvider } from '../lib/providers/llm/glm.ts';
import { ZaiWebSearchProvider } from '../lib/providers/data/zai-websearch.ts';
import type { LLMProvider, DataProvider } from '../lib/providers/types.ts';

// ============ 颜色输出（无依赖，用 ANSI 码） ============
const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  amber: '\x1b[38;5;208m',
};
const tag = (color: string, label: string, msg: string) =>
  console.log(`${color}[${label}]${C.reset} ${msg}`);

// ============ Mock Provider（demo 模式） ============
const mockLLM: LLMProvider = {
  name: 'mock-llm',
  async chat(messages) {
    const last = messages[messages.length - 1]?.content ?? '';
    if (last.includes('判断用户问题是哪一类')) {
      return {
        content: '{"category":"needs_facts","reason":"涉及具体专业金融，需查就业数据"}',
      };
    }
    return {
      content:
        '🎯 **停。普通家庭别碰金融前端。**\n\n' +
        '你的位次够不上 211 财经类，金融前端 target school 是清北复交人。\n\n' +
        '🏆 推荐方向：\n- 电气工程（进国网系统）\n- 计算机应用型校\n- 定向师范带编\n\n' +
        '🛑 避坑：金融工程（需家庭资源）、纯金融（无 target school）',
    };
  },
  async chatStream(messages, onDelta) {
    const r = await this.chat(messages);
    // 逐字吐
    for (const ch of r.content) {
      onDelta(ch);
      await new Promise((r) => setTimeout(r, 5));
    }
    return r.content;
  },
};

const mockData: DataProvider = {
  name: 'mock-data',
  async search(query) {
    return [
      {
        content: `${query}：普通一本金融毕业生中位数月薪 5-8k，多去银行柜员/保险销售`,
        url: 'https://example.com/mycos-report',
        source_name: '麦可思',
        timestamp: new Date().toISOString(),
        credibility_level: 'B' as const,
      },
      {
        content: `${query}：金融前端头部机构 target school 为清北复交人 + 头部财经211`,
        url: 'https://example.com/finance-target',
        source_name: '36氪',
        timestamp: new Date().toISOString(),
        credibility_level: 'B' as const,
      },
    ];
  },
};

// ============ 主流程 ============
async function main() {
  const demoMode = process.argv.includes('--demo');

  console.log(`${C.cyan}╔══════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.cyan}║  现实主义高考志愿分析师 · CLI 原型       ║${C.reset}`);
  console.log(`${C.cyan}╚══════════════════════════════════════════╝${C.reset}`);
  const skillName = loadSkillName();
  tag(C.dim, 'skill', `${skillName} | 模式: ${demoMode ? 'DEMO(mock)' : 'LIVE'}`);

  // 加载角色定义
  const systemPrompt = loadSkillPrompt();
  tag(C.green, '✓', `SKILL.md 已加载 (${systemPrompt.length} 字符)`);

  // 构建 provider
  let llm: LLMProvider;
  let data: DataProvider;
  if (demoMode) {
    llm = mockLLM;
    data = mockData;
    tag(C.yellow, '!', 'DEMO 模式：使用 mock provider，验证编排逻辑');
  } else {
    if (!process.env.LLM_API_KEY) {
      tag(C.red, '✗', '未设置 LLM_API_KEY，加 --demo 走演示，或配置 .env');
      process.exit(1);
    }
    llm = new GlmProvider({
      baseUrl: process.env.LLM_BASE_URL!,
      apiKey: process.env.LLM_API_KEY!,
      model: process.env.LLM_MODEL ?? 'glm-4.6',
    });
    data = new ZaiWebSearchProvider({
      endpoint: process.env.DATA_SEARCH_ENDPOINT,
      apiKey: process.env.DATA_SEARCH_API_KEY,
    });
  }

  // 执行 Agentic Protocol
  const protocol = new AgenticProtocol(llm, data, systemPrompt);
  const onEvent = (e: ProtocolEvent) => {
    switch (e.type) {
      case 'phase':
        tag(C.magenta, '▶', `阶段: ${e.phase}`);
        break;
      case 'slot_check':
        if (e.complete) tag(C.green, '✓', '槽位采集通过');
        else tag(C.yellow, '!? ', `槽位不全，缺：${e.missing.join('、')}`);
        break;
      case 'classify_result':
        tag(C.blue, '分类', `${e.category} — ${e.reason}`);
        break;
      case 'research_query':
        tag(C.dim, '  查', e.query);
        break;
      case 'research_result':
        tag(C.dim, '  得', `${e.results.length} 条结果（最高 ${e.results[0]?.credibility_level ?? '-'} 级）`);
        break;
      case 'checkpoint':
        if (e.passed) tag(C.green, '✓', 'CHECKPOINT 通过');
        else tag(C.yellow, '⚠', `CHECKPOINT: ${e.issues.join('; ')}`);
        break;
      case 'answer_delta':
        process.stdout.write(e.delta);
        break;
      case 'answer_done':
        console.log(''); // 换行
        break;
      case 'error':
        tag(C.red, '✗', e.message);
        break;
    }
  };

  // ===== 演示 1：槽位不全 → 触发反问 =====
  console.log(`\n${C.amber}━━━ 演示 1：信息不全，触发反问 ━━━${C.reset}`);
  const incomplete: StudentProfile = {
    province: '河南',
    candidates: ['金融学'],
    rawQuestion: '我想学金融，能报什么？',
  };
  tag(C.cyan, '?', `用户输入：${incomplete.rawQuestion}`);
  await protocol.diagnose(incomplete, onEvent);

  // ===== 演示 2：槽位齐全 → 完整诊断 =====
  console.log(`\n${C.amber}━━━ 演示 2：信息齐全，完整诊断 ━━━${C.reset}\n`);
  const profile: StudentProfile = {
    province: '河南',
    score: 560,
    rank: 50000,
    subjects: '理科（物化生）',
    familyBackground: '一般',
    candidates: ['金融学', '电气工程', '计算机科学'],
    rawQuestion: '我这个分数普通家庭，想学金融，能报什么？',
  };
  const { report, sources } = await protocol.diagnose(profile, onEvent);

  console.log(`\n${C.amber}━━━ 诊断完成 ━━━${C.reset}`);
  console.log(`${C.dim}报告 ${report.length} 字符 | 引用来源 ${sources.length} 条${C.reset}`);

  // 来源汇总
  if (sources.length > 0) {
    console.log(`\n${C.dim}── 引用来源 ──${C.reset}`);
    for (const s of sources) {
      console.log(`${C.dim}  [${s.credibility_level}] ${s.source_name}: ${s.url}${C.reset}`);
    }
  }
}

main().catch((e) => {
  tag(C.red, 'FATAL', (e as Error).message);
  process.exit(1);
});
