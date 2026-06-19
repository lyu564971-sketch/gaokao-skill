# 现实主义高考志愿诊断终端

> 别跟我谈理想。先看就业中位数。

一个基于公开就业数据的**现实主义高考志愿 AI 诊断终端**：用户输入分数/位次/省份/选科/家庭条件，AI 先联网核查就业中位数、薪资、录取线，再输出结构化、带数据来源、有压迫感的诊断报告。

**核心差异化**：Agentic Protocol（先查后答）——强制联网查真实数据再开口，绝不凭训练语料编薪资/编录取线。

---

## 快速开始

### 环境要求
- Node.js 18+（开发用，自带 npm）
- 一个 OpenAI 兼容的 LLM API Key（GLM / 通义 / Kimi / DeepSeek 均可）

### 安装与运行

```bash
npm install
cp .env.example .env   # 填入 LLM_API_KEY 等
npm run dev            # 开发服务器 http://localhost:3000
```

### CLI 原型（无需前端，验证 Agentic Protocol）

```bash
npm run cli:demo       # mock 模式，验证编排逻辑
npm run cli            # 接真实 LLM（需配 .env）
```

---

## 项目结构

```
gaokao-skill/
├── _governance/          # ⭐ 工程治理（架构/规则/日志/bug/决策）
├── skill/                # 角色定义（SKILL.md + references，前后端共用）
├── lib/
│   ├── providers/        # Provider 抽象层（LLM + Data 可插拔）
│   ├── research/         # Agentic Protocol 编排核心
│   └── skill/            # SKILL.md 加载器
├── cli/                  # CLI 原型
├── app/                  # Next.js 前端（App Router）
├── components/           # React 组件
└── package.json
```

---

## 架构

三层 + 双引擎 + Provider 抽象。详见 `_governance/ARCHITECTURE.md`。

- **表现层**：Next.js + React + Tailwind（深色终端美学）
- **编排层**：Agentic Protocol（Step 0 槽位采集 → Step 1 分类 → Step 2 联网核查 → Step 3 诊断）
- **引擎层**：LLM Provider（GLM 等）+ Data Provider（WebSearch，可插拔）

### Agentic Protocol

| 步骤 | 作用 |
|------|------|
| Step 0 槽位采集 | 多轮追问补全省份/位次/家庭条件，不全不答 |
| Step 1 问题分类 | 判断纯框架 / 需事实 / 混合 |
| Step 2 联网核查 | 并行查就业中位数、录取线、对口率、行业信号 |
| Step 3 诊断报告 | 三段式：风险警告 / 推荐方案 / 避坑指南 |
| CHECKPOINT | 开口前四问自检，不全回退 |

### 数据可信度分级

| 等级 | 来源 | 徽章 |
|------|------|------|
| A | 官方（教育部/考试院/统计局） | 🟢 |
| B | 权威媒体（麦可思/36氪/财新） | 🟡 |
| C | 第三方平台 | 🟠 |
| 无 | 数据缺失，框架推断 | ⚪ |

---

## 工程治理

本项目带完整治理机制（`_governance/`）：
- `ARCHITECTURE.md` — 架构定稿
- `EXECUTION_RULES.md` — 执行规则（日志/bug 闭环/命名/工作流纪律）
- `PROGRESS_LOG.md` — 任务进度日志
- `BUG_AUDIT.md` — Bug 审查台账（5 字段闭环）
- `DECISIONS.md` — 关键决策记录（ADR）
- `COMPETITIVE_ANALYSIS.md` — 对标分析

---

## 部署

Vercel 免费版（送 `*.vercel.app` 子域名）。流式响应用 Edge Runtime 规避超时。

---

## 致谢

角色定义方法论参考 [nuwa-skill（女娲.skill）](https://github.com/alchaincyf/nuwa-skill) 与 [zhangxuefeng-skill](https://github.com/alchaincyf/zhangxuefeng-skill)。槽位采集设计借鉴 [xuefeng-agent](https://github.com/ziqihe10-droid/xuefeng-agent)。

## License

ISC
