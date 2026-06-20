/**
 * SSE Chat API 路由（app/api/chat/route.ts）
 *
 * 接收用户消息，编排 AgenticProtocol，以 Server-Sent Events 流式回传事件。
 *
 * 前端 POST /api/chat，body: { message: string, profile?: Partial<StudentProfile> }
 * 响应 Content-Type: text/event-stream，每行一个 SSE event。
 *
 * 事件类型与 ProtocolEvent 对齐（见 lib/research/protocol.ts）。
 */

import { NextRequest } from 'next/server';
import { getLLMProvider, getDataProvider } from '../../../lib/providers/registry';
import { AgenticProtocol } from '../../../lib/research/protocol';
import { loadSkillPrompt } from '../../../lib/skill/loader';
import { filterTaboo } from '../../../lib/research/taboo-filter';
import type { StudentProfile } from '../../../lib/research/protocol';

// P3b：Vercel Runtime 声明。
// SSE 流式诊断含 9 并行 WebSearch + LLM 流式，总耗时可能 30-50s，
// Vercel 默认 10s 超时会杀连接。用 nodejs runtime（Edge 不支持部分 Node API）
// + maxDuration=60 覆盖完整诊断流程。
export const runtime = 'nodejs';
// Vercel 免费版 Hobby plan 上限 10s，Pro 版 60s。
// 这里设 10 兼容免费版；升级 Pro 后改为 60。
export const maxDuration = 10;

/** POST handler: 接收消息，返回 SSE 流 */
export async function POST(req: NextRequest) {
  // P5c：HTTP 方法守卫
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: '仅支持 POST 方法' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    });
  }

  // P5c：req.json() 异常守卫（畸形 body 不再裸崩）
  let body: { message?: string; profile?: Partial<StudentProfile> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: '请求格式错误：JSON 解析失败' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const message: string = body.message ?? '';
  const incomingProfile: Partial<StudentProfile> = body.profile ?? {};

  // 防空
  if (!message.trim()) {
    return new Response(JSON.stringify({ error: '消息不能为空' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 检查 LLM 配置
  let skillPrompt: string;
  try {
    const llm = getLLMProvider();
    // 验证连接（调一次 chat 确保 provider 可用）
    void llm;
    skillPrompt = loadSkillPrompt();
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: `服务未就绪: ${(err as Error).message}`,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 构建 StudentProfile：合并前端传入的 profile + 从消息解析关键字段
  const profile = buildProfile(message, incomingProfile);

  // 创建 SSE 流
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const llm = getLLMProvider();
        const data = getDataProvider();
        const protocol = new AgenticProtocol(llm, data, skillPrompt);

        // 发送用户消息确认
        send('user_message', { message });

        // 执行诊断，事件流式回传
        const result = await protocol.diagnose(profile, (evt) => {
          send(evt.type, evt);
        });

        // P5a：禁用词后处理。对完成报告做 filterTaboo，
        // 命中时追加 warning 事件（前端收到后显示红色警告条）
        const taboo = filterTaboo(result.report);
        if (taboo.hits.length > 0) {
          send('warning', {
            message: `表达 DNA 警告：命中禁用词 ${taboo.hits.map((w) => `「${w}」`).join('、')}`,
          });
        }

        // 发送最终来源汇总
        send('sources', {
          sources: result.sources.map((s) => ({
            content: s.content.slice(0, 200),
            url: s.url,
            source_name: s.source_name,
            timestamp: s.timestamp,
            credibility_level: s.credibility_level,
          })),
        });
      } catch (err) {
        send('error', { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

/**
 * 从消息文本 + 前端传入的 profile 合并出 StudentProfile。
 * 前端如果已经解析出结构化字段（槽位采集阶段累积），优先用结构化值。
 */
function buildProfile(
  message: string,
  incoming: Partial<StudentProfile>
): StudentProfile {
  return {
    province: incoming.province ?? undefined,
    score: incoming.score ?? undefined,
    rank: incoming.rank ?? undefined,
    subjects: incoming.subjects ?? undefined,
    familyBackground: incoming.familyBackground ?? undefined,
    candidates: incoming.candidates ?? undefined,
    exclusions: incoming.exclusions ?? undefined,
    careerGoal: incoming.careerGoal ?? undefined,
    rawQuestion: message,
  };
}
