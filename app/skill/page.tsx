import Link from "next/link";
import { promises as fs } from "node:fs";
import path from "node:path";

async function readSkillSummary() {
  try {
    const skillPath = path.join(process.cwd(), "skill", "SKILL.md");
    const raw = await fs.readFile(skillPath, "utf-8");
    // 剥 frontmatter
    const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
    return body;
  } catch {
    return "// SKILL.md 暂时无法读取";
  }
}

export default async function SkillPage() {
  const skill = await readSkillSummary();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/"
        className="mb-8 inline-block font-mono text-xs text-[var(--color-fg-dim)] hover:text-[var(--color-accent)]"
      >
        ← 返回首页
      </Link>
      <div className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">
        // 角色定义 · 唯一真相源
      </div>
      <h1 className="mb-8 text-3xl font-bold">SKILL.md（透明说明）</h1>
      <p className="mb-8 text-sm leading-relaxed text-[var(--color-fg-dim)]">
        本终端的行为完全由这份 SKILL.md 定义，前后端共用，无隐藏逻辑。
        下方是当前生效的完整定义。
      </p>
      <pre className="overflow-x-auto border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 font-mono text-xs leading-relaxed text-[var(--color-fg-dim)] whitespace-pre-wrap">
{skill}
      </pre>
    </main>
  );
}
