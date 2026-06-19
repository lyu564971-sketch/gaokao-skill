# 架构方案定稿（ARCHITECTURE.md）

> 项目：现实主义高考志愿分析师 · Web 产品
> 定稿日期：2026-06-18
> 状态：P0a 锁定，后续重大变更需走 ADR（见 DECISIONS.md）

---

## 0. 产品定义

一个基于张雪峰现实主义的**高考志愿 AI 诊断终端**：用户输入分数/位次/省份/选科/家庭条件/候选名单，AI 先联网核查就业中位数、薪资、录取线，再输出一份结构化、带数据来源、有压迫感的诊断报告。

**核心差异化**：Agentic Protocol（先查后答）——强制 WebSearch 查真实数据再开口，绝不凭训练语料编薪资/编录取线。

---

## 1. 决策定稿

| 决策项 | 定案 | 理由 |
|--------|------|------|
| 项目路径 | `D:\gaokao-skill` | 用户指定（原 `D:\张雪峰skill`，因 BUG-004 编码冲突改名，见 ADR-005） |
| 部署 | Vercel 免费版 | 免费 + 送 `*.vercel.app` 子域名 + Next.js 原生 + 个人额度够用 |
| 数据引擎 | Z.ai 内置 WebSearch（首版） | 零接入成本；抽象成 Provider 接口，未来可插 Tavily/官方源 |
| P0 起点 | SKILL.md 全套 + CLI 验证 Agentic Protocol + 预留 Provider API 层 | 最不确定的环节先验证 |

---

## 2. 三层 + 双引擎 + Provider 抽象架构

```
┌─────────────────────────────────────────────────────────┐
│  Presentation Layer（前端）                              │
│  Next.js 15 App Router + React 19 + Tailwind v4          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ 对话终端 UI  │  │ 数据卡片网格 │  │ 报告导出面板  │  │
│  │ (流式渲染)   │  │ (来源溯源)   │  │ (MD/PDF)      │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└─────────────────────────┬───────────────────────────────┘
                          │ SSE
┌─────────────────────────┴───────────────────────────────┐
│  Orchestration Layer（后端 BFF / Next.js Route Handlers）│
│  ┌────────────────────────────────────────────────────┐ │
│  │  Session Manager          （会话状态/上下文窗口）    │ │
│  │  System Prompt Engine     （加载 SKILL.md）         │ │
│  │  Agentic Protocol         （核心：先查后答）         │ │
│  │  ┌────────────────────────────────────────────┐    │ │
│  │  │ Step1 分类 → Step2 WebSearch → CHECKPOINT   │    │ │
│  │  └────────────────────────────────────────────┘    │ │
│  │  Stream Renderer         （LLM 流 → SSE）          │ │
│  │  Source Extractor        （抽取数据 + 来源）        │ │
│  └────────────────────────────────────────────────────┘ │
└──────────┬──────────────────────────────────┬───────────┘
           │                                   │
┌──────────▼─────────────┐      ┌──────────────▼──────────┐
│  LLM Engine            │      │  Data Engine            │
│  (GLM-4.6 / OpenAI 兼容│      │  Z.ai WebSearch         │
│   接口，流式)          │      │  + Provider 抽象层      │
└────────────────────────┘      └─────────────────────────┘
```

### 2.1 Provider 抽象层（满足"方便后续接入新 API"）

```
lib/providers/
├── types.ts                  # 接口定义
│   ├── DataProvider:   search(query) → Result[]
│   └── LLMProvider:    chat() / stream()
├── data/
│   ├── zai-websearch.ts      # ⭐ 现在实现（Z.ai 内置 WebSearch）
│   ├── tavily.ts             # 未来（占位）
│   └── official.ts           # 未来（教育部/麦可思，占位）
├── llm/
│   └── glm.ts                # 主实现（OpenAI 兼容接口）
└── registry.ts               # 配置驱动切换，业务代码不感知
```

- 业务层只调 `registry.getDataProvider().search(...)`，换引擎只改环境变量
- 每个 Result 强制五字段：`{content, url, source_name, timestamp, credibility_level}`

### 2.2 部署适配（Vercel 免费版约束）

免费版 Serverless 有超时限制 → Agentic Protocol 必须**流式分阶段返回**：
- 阶段1（<1s）：返回"问题分类结果"
- 阶段2（3-8s）：流式返回 WebSearch 进度 + 找到的数据点
- 阶段3：流式生成三段式报告

用 Edge Runtime（更长超时、更稳定）。分阶段流式反而强化"专业终端"的前卫感。

---

## 3. Agentic Protocol（"先查后答"引擎 · 核心差异化）

```
用户输入客观数据
        │
        ▼
┌───────────────────────────────────────────────────────┐
│ Step 1: 问题分类（LLM 单次推理，<1s）                  │
│  分类标签:                                             │
│   • "纯框架问题"（如"该不该复读"）→ 跳过 Step2        │
│   • "需事实问题"（涉及具体院校/专业/薪资）→ 进 Step2  │
│   • "混合问题" → 进 Step2                              │
└───────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────┐
│ Step 2: 现实主义研究（并行 WebSearch，3-8s）          │
│  按候选名单/位次并行查 4 个维度:                      │
│   ① 该专业近3年就业中位数 + 起薪区间                  │
│   ② 该院校该省录取位次趋势（是否下滑/爆冷）           │
│   ③ 该专业考公/考编对口率 + 主要对口单位              │
│   ④ 行业饱和度信号（裁员潮/扩招/政策变动）            │
│  硬约束: 每条数据必须带来源 URL + 时间戳               │
└───────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────┐
│ CHECKPOINT 质量门控（自检，0.5s）                     │
│  ① 数据查了吗？（≥3 条独立来源）                      │
│  ② 第一句给判断了吗？（不铺垫）                       │
│  ③ 家庭条件/省份/位次都用上了吗？                     │
│  任一为否 → 回退到对应 Step，不准硬出报告             │
└───────────────────────────────────────────────────────┘
        │
        ▐ 流式输出三段式报告
        ▼
   用户终端
```

### 数据可信度分级（专业感锚点）

| 等级 | 来源类型 | UI 呈现 |
|------|---------|---------|
| 🟢 A 级 | 官方（教育部/统计局/院校招生网） | 绿色徽章 + 可点击来源 |
| 🟡 B 级 | 权威媒体（36氪/财新/麦可思） | 黄色徽章 |
| 🟠 C 级 | 第三方平台（看准网/职友集） | 橙色徽章 + "仅供参考" |
| ⚪ 无数据 | 仅有框架推断 | 灰色虚线 + "数据缺失，框架推断" |

对应 nuva 诚实边界：绝不假装有数据，宁可标注"60 分诚实报告"也不编"90 分幻觉报告"。

---

## 4. 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 框架 | Next.js 15 (App Router) + React 19 | 全栈一体，SSE 原生支持，Vercel 零配置部署 |
| 语言 | TypeScript 严格模式 | 高考数据不能算错，类型安全是底线 |
| 样式 | Tailwind CSS v4 | 原子化，设计系统一致性强 |
| UI 组件 | shadcn/ui + Radix | 无样式无锁定，专业克制美学可定制 |
| LLM 接口 | OpenAI 兼容 SDK | GLM/通义/Kimi 全兼容，换模型只改 baseURL + key |
| 流式协议 | SSE | 比 WebSocket 简单，LLM 流是天然单向 |
| Markdown | react-markdown + remark-gfm + rehype-highlight | 报告是结构化 Markdown |
| 状态 | Zustand | 轻量，聊天场景足够 |
| 持久化 | MVP localStorage；后续可选 Vercel KV | 单用户无需数据库 |
| 部署 | Vercel 免费版 | 送子域名，零配置 |
| 字体 | 思源黑体/HarmonyOS Sans + JetBrains Mono | 数字等宽对齐是专业感基础 |

主模型：GLM-4.6 或同档（中文表达 + 长报告 + 角色扮演稳定）；所有调用走 OpenAI 兼容接口。

---

## 5. 前端设计取向：数据终端美学

反主流消费级 App 的圆角渐变，走 Bloomberg Terminal × Linear 的克制路线。

| 维度 | 决策 | 理由 |
|------|------|------|
| 色调 | 深色为主（#0a0a0a 炭黑）+ 琥珀色强调（#f59e0b 警示感） | 理性、压迫感、契合风险主题 |
| 布局 | 单栏纵向流 + 左侧固定侧边栏（会话历史） | 阅读 AI 长报告最佳形态 |
| 字体层级 | 标题思源黑体 Bold；正文 Regular；数据 JetBrains Mono | 数字等宽对齐 |
| 数据呈现 | 表格 + 微图表（sparkline）+ 可信度徽章 | 信息密度高但不杂乱 |
| 动效 | 极简：token 涌现 + 卡片淡入；禁用弹跳/视差 | 克制 = 专业 |
| 空状态 | hero 一句 slogan + 单输入框 | 高考焦虑用户需明确入口 |

---

## 6. 完整目录结构

```
D:\gaokao-skill\
├── _governance/                 # ⭐ 工程治理（P0a）
│   ├── ARCHITECTURE.md
│   ├── EXECUTION_RULES.md
│   ├── PROGRESS_LOG.md
│   ├── BUG_AUDIT.md
│   └── DECISIONS.md
├── skill/                       # 角色定义（P0b）
│   ├── SKILL.md
│   └── references/
│       ├── mental-models.md
│       ├── heuristics.md
│       ├── expression-dna.md
│       ├── data-protocol.md
│       └── occupational-data.md
├── cli/                         # P0c：CLI 原型
│   ├── run.ts
│   └── test-cases.md
├── app/                         # P1+：Next.js
│   ├── layout.tsx  page.tsx  chat/[id]/  report/[id]/  skill/
│   └── api/{chat,classify,research}/route.ts
├── components/  lib/  public/
├── .env.example
├── package.json  tsconfig.json  tailwind.config.ts  next.config.ts
└── README.md
```

---

## 7. 分阶段路线图

| 阶段 | 交付物 | 验收 |
|------|--------|------|
| P0a | _governance/ 5份治理文件 | 模板齐全，规则可执行 |
| P0b | skill/SKILL.md + references/ | 对照 nuwa 12 模块自检通过 |
| P0c | cli/ 原型跑通 Agentic Protocol | 输入分数→分类→WebSearch→报告全链路 |
| P1 | Next.js 骨架 + 落地页 | Vercel 部署可访问，深色终端美学 |
| P2 | 流式对话 + SSE 接口 | token 涌现，分阶段进度可见 |
| P3 | 数据引擎接入 + 来源徽章 | 报告出现可信度徽章 + 可点击来源 |
| P4 | 三段式报告组件 + 导出 | MD/PDF 导出 |
| P5 | 打磨：禁用词过滤/兜底/移动端 | 全故障矩阵覆盖 |

---

## 8. 风险与缓解（重点 3 条）

| 风险 | 缓解 |
|------|------|
| LLM 跳过 WebSearch | CHECKPOINT 硬校验 + 后处理检测"是否引用来源 URL"，无来源降级提示 |
| Vercel Serverless 超时 | 流式分阶段返回 + Edge Runtime |
| WebSearch 数据稀疏/过时 | 冷启动底座 occupational-data.md + 数据缺失诚实标注 |

---

## 9. 理论来源

本架构的角色定义部分借鉴 nuwa-skill（女娲.skill）的 12 模块人物 Skill 标准，以及 zhangxuefeng-skill 的工程化骨架。已沉淀到 `DECISIONS.md`。
