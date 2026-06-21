import { NextRequest } from "next/server";
import { getDataProvider, getLLMProvider } from "../../../lib/providers/registry";
import { AgenticProtocol } from "../../../lib/research/protocol";
import { filterTaboo } from "../../../lib/research/taboo-filter";
import { loadSkillPrompt } from "../../../lib/skill/loader";
import type { StudentProfile } from "../../../lib/research/protocol";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatBody = {
  message?: string;
  mode?: "apply" | "roast";
  profile?: Partial<StudentProfile>;
};

export async function POST(req: NextRequest) {
  let body: ChatBody;

  try {
    body = await req.json();
  } catch {
    return jsonError("请求格式错误：无法解析 JSON。", 400);
  }

  const message = body.message?.trim() ?? "";
  if (!message) return jsonError("消息不能为空。", 400);

  let skillPrompt: string;
  try {
    getLLMProvider();
    skillPrompt = buildModePrompt(loadSkillPrompt(), body.mode ?? "apply");
  } catch (err) {
    return jsonError(`服务端模型配置不可用：${(err as Error).message}`, 503);
  }

  const profile = buildProfile(message, body.profile ?? {});
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const protocol = new AgenticProtocol(
          getLLMProvider(),
          getDataProvider(),
          skillPrompt
        );

        send("user_message", { message });

        const result = await protocol.diagnose(profile, (event) => {
          send(event.type, event);
        });

        const taboo = filterTaboo(result.report);
        if (taboo.hits.length) {
          send("warning", {
            message: `表达复核提醒：命中 ${taboo.hits
              .map((word) => `「${word}」`)
              .join("、")}，建议检查措辞是否过度。`,
          });
        }

        send("sources", {
          sources: result.sources.map((source) => ({
            content: source.content.slice(0, 220),
            url: source.url,
            source_name: source.source_name,
            timestamp: source.timestamp,
            credibility_level: source.credibility_level,
          })),
        });
      } catch (err) {
        send("error", { message: (err as Error).message || "诊断失败。" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function jsonError(error: string, status: number) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function buildProfile(
  message: string,
  incoming: Partial<StudentProfile>
): StudentProfile {
  return {
    province: normalizeText(incoming.province),
    score: normalizeNumber(incoming.score),
    rank: normalizeNumber(incoming.rank),
    subjects: normalizeText(incoming.subjects),
    familyBackground: normalizeText(incoming.familyBackground),
    candidates: Array.isArray(incoming.candidates) ? incoming.candidates : undefined,
    exclusions: Array.isArray(incoming.exclusions) ? incoming.exclusions : undefined,
    careerGoal: normalizeText(incoming.careerGoal),
    rawQuestion: message,
  };
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildModePrompt(basePrompt: string, mode: "apply" | "roast") {
  if (mode === "roast") {
    return `${basePrompt}\n\n当前前端模式：吐槽。回答可以更直接、更有压迫感，但必须基于事实和公开数据，不冒充真人，不造谣，不做人身攻击。`;
  }

  return `${basePrompt}\n\n当前前端模式：报考。回答要优先给清晰方案、风险排序和下一步验证动作。`;
}
