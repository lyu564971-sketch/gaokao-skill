/**
 * SKILL.md 加载器（loader.ts）
 *
 * SKILL.md 是角色定义的唯一真相源（EXECUTION_RULES.md §6）。
 * 业务层不硬编码角色逻辑，统一从这里加载 system prompt。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 解析 SKILL.md，剥掉 frontmatter，返回 body 作为 system prompt。
 * 支持多行 description（YAML | 块标量）。
 */
export function loadSkillPrompt(skillPath?: string): string {
  const candidates = [
    skillPath,
    join(__dirname, '..', '..', 'skill', 'SKILL.md'),
    join(process.cwd(), 'skill', 'SKILL.md'),
  ].filter(Boolean) as string[];

  const path = candidates.find((p) => existsSync(p));
  if (!path) {
    throw new Error('SKILL.md 未找到：' + candidates.join(' | '));
  }

  const raw = readFileSync(path, 'utf-8');

  // 剥 YAML frontmatter（--- ... ---）
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return raw.trim(); // 无 frontmatter，整篇当 prompt
  }
  return fmMatch[2].trim();
}

/** 仅读 frontmatter 的 name 字段（用于日志标识） */
export function loadSkillName(skillPath?: string): string {
  const candidates = [
    skillPath,
    join(__dirname, '..', '..', 'skill', 'SKILL.md'),
    join(process.cwd(), 'skill', 'SKILL.md'),
  ].filter(Boolean) as string[];

  const path = candidates.find((p) => existsSync(p));
  if (!path) return 'unknown-skill';
  const raw = readFileSync(path, 'utf-8');
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) return 'unknown-skill';
  const nameMatch = fmMatch[1].match(/^name:\s*(.+)$/m);
  return nameMatch?.[1]?.trim() ?? 'unknown-skill';
}
