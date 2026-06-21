import Link from "next/link";
import { promises as fs } from "node:fs";
import path from "node:path";

async function readSkillSummary() {
  try {
    const skillPath = path.join(process.cwd(), "skill", "SKILL.md");
    const raw = await fs.readFile(skillPath, "utf-8");
    return raw.replace(/^---\n[\s\S]*?\n---\n/, "");
  } catch {
    return "SKILL.md 暂时无法读取。";
  }
}

export default async function SkillPage() {
  const skill = await readSkillSummary();

  return (
    <main className="skill-page">
      <Link href="/" className="skill-back">
        返回对话
      </Link>
      <div className="welcome-kicker">角色定义</div>
      <h1>SKILL.md</h1>
      <p>
        这里展示当前诊断助手的行为说明。产品首页已经重写为对话式入口，这页保留给需要查看角色边界时使用。
      </p>
      <pre>{skill}</pre>
    </main>
  );
}
