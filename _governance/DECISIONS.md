# 关键决策记录（DECISIONS.md · ADR 风格）

> Architecture Decision Records。每个重大决策一条，倒序（最新在上）。已决策项禁止静默变更，偏离必须新增 ADR。

---

## ADR-007 | 报告导出方案：Markdown 下载 + 浏览器原生打印（另存为 PDF）
- **日期**：2026-06-19
- **状态**：已采纳
- **背景**：P4 需要报告导出能力。DECISIONS.md 待定项原列"报告导出 PDF 的具体实现方案（puppeteer vs 客户端 html2pdf）"。三个候选：
  1. 服务端 puppeteer 生成 PDF；
  2. 客户端 jspdf + html2canvas 栅格化 PDF；
  3. Markdown 下载 + 浏览器原生 print→另存为 PDF。
- **决策**：选方案 3。`ExportBar` 提供「.md 下载」（Blob 拼接报告+来源清单）和「🖨 打印 / PDF」（`window.print()` + `@media print` CSS）两个按钮。
- **理由**：
  1. **零新依赖**：纯 Blob + window.print 浏览器 API，不增加包体积；
  2. **矢量 PDF**：浏览器原生打印生成的是矢量文字 PDF，可选中可复制可搜索；jspdf+html2canvas 是栅格化图片，文字不可选、深色主题渲染易失真；
  3. **Vercel 友好**：puppeteer 需 headless Chromium，Vercel 免费版 Serverless 冷启动慢、体积大、易超时；方案 3 纯客户端无此问题；
  4. **用户自主**：用户在打印对话框自主选纸张/方向/是否彩色，灵活性最高。
- **后果**：
  1. PDF 质量依赖用户浏览器的打印引擎（现代 Chrome/Edge 质量好，老浏览器可能略差），属可接受妥协；
  2. `app/globals.css` 新增 `@media print` 块，UI chrome（顶栏/输入区/槽位面板/导出栏）加 `.no-print` 隐藏，`.section-card` 转白底黑字、不跨页断裂；
  3. `SourcesPanel` 来源清单从 `{open && ...}` 改为始终渲染+CSS 控制显隐，否则折叠态 window.print 无法展开；
  4. 待定项"报告导出 PDF 的具体实现方案"关闭。未来如需一键高质量 PDF（如带水印/品牌页眉），再评估 puppeteer 单独 ADR。

---

## ADR-006 | DataProvider 单一真相源（web-search.ts 合并进 zai-websearch.ts）
- **日期**：2026-06-19
- **状态**：已采纳
- **背景**：项目存在两套 DataProvider 实现——`zai-websearch.ts`（ZaiWebSearchProvider 类，被 registry.ts 和 cli/run.ts 使用）和 `web-search.ts`（createDataProvider 工厂，含 Tavily/通用HTTP 后端 + 独立 judgeCredibility/normalizeResults，但**无任何调用方**，是死代码）。两份 `judgeCredibility` 函数逻辑相似但有微妙差异（web-search.ts 多了 `tavily` 关键词），违反 EXECUTION_RULES §6"文档与代码同源"。
- **决策**：删除 `web-search.ts`，将其多后端能力（Tavily/通用HTTP）+ 统一 `judgeCredibility`/`normalizeResults` 合并进 `zai-websearch.ts`。`ZaiWebSearchProvider` 成为唯一的 DataProvider 实现，支持 auto/http/tavily/fallback 四种后端，通过 `WebSearchConfig.backend` 和环境变量 `DATA_SEARCH_BACKEND` 切换。
- **理由**：
  1. 消除死代码和重复实现，单一真相源更易维护；
  2. 消除两份 `judgeCredibility` 的微妙漂移风险；
  3. `judgeCredibility`/`normalizeResults`/`SOURCE_BLACKLIST` 集中在 zai-websearch.ts + dedupe.ts，架构更清晰；
  4. 保留多后端能力（auto 判定 + 显式切换），不影响未来扩展。
- **后果**：
  1. `lib/providers/data/web-search.ts` 被删除（251 行）；
  2. `zai-websearch.ts` 成为唯一 DataProvider 文件，从 134 行增长到 ~260 行；
  3. `registry.ts` 新增 `DATA_SEARCH_BACKEND` 环境变量传递；
  4. 切换后端只改 `.env`，不改业务代码——满足 EXECUTION_RULES §5 的可插拔约束。

---

## ADR-004 | 实施顺序与 Provider 预留
- **日期**：2026-06-18
- **状态**：已采纳
- **背景**：需要确定从哪里开始实施，且用户要求"方便后续接入新 API"。
- **决策**：P0 从"SKILL.md 全套 + CLI 验证 Agentic Protocol"开始；数据层和 LLM 层都抽象成 Provider 接口，Z.ai WebSearch 只是首版实现。
- **理由**：最不确定的环节（角色定义能否工程化、Agentic Protocol 能否跑通）先验证，降低后期返工风险；Provider 抽象满足可扩展性要求且不增加首版工作量。
- **后果**：首版只有 1 个 DataProvider 实现（zai-websearch.ts）和 1 个 LLMProvider 实现（glm.ts），但接口完整，未来加 Tavily/官方源不改业务代码。

---

## ADR-003 | 数据引擎首版选 Z.ai 内置 WebSearch
- **日期**：2026-06-18
- **状态**：已采纳
- **背景**：Agentic Protocol 的"强制查数据"需要一个数据引擎。候选：Z.ai 内置 WebSearch / 第三方 API（Tavily/Serper）/ 混合。
- **决策**：首版用 Z.ai 内置 WebSearch，通过 Provider 抽象层接入。
- **理由**：零接入成本（当前环境就有），中文结果质量好，适合 MVP。第三方 API 有费用且需注册 key，留待进阶。
- **后果**：Result 强制五字段（content/url/source_name/timestamp/credibility_level），WebSearch 原始返回需做适配转换。

---

## ADR-002 | 部署到 Vercel 免费版
- **日期**：2026-06-18
- **状态**：已采纳
- **背景**：用户单人团队、经费有限、无自有域名。
- **决策**：部署到 Vercel 免费版，使用其 `*.vercel.app` 子域名。
- **理由**：免费、Next.js 原生零配置、送子域名解决无域名问题、个人额度够用。
- **后果**：
  1. Serverless 有超时限制 → Agentic Protocol 必须设计成**流式分阶段返回**；
  2. 用 Edge Runtime 争取更长超时；
  3. 未来如需稳定国内访问，再考虑 Cloudflare 或自有域名 + CDN（届时新增 ADR）。

---

## ADR-005 | 项目目录从中文改为纯英文
- **日期**：2026-06-18
- **状态**：已采纳
- **背景**：`D:\张雪峰skill` 含中文，npm 在 Windows 下读目录名时 GBK/UTF-8 编码冲突（BUG-004），`npm init` 报 `Invalid name: "寮犻洩宄皊kill"`，阻碍 Next.js 骨架搭建。
- **决策**：重命名为 `D:\gaokao-skill`。
- **理由**：根治编码问题，npm/Vercel/Git 等工具对纯 ASCII 路径兼容性最好。已产出文件内容无硬编码中文路径（仅 run.ts 用法注释和治理文档历史记录，前者已改，后者保留作历史）。
- **后果**：所有后续工作在新路径下进行；治理文档中的历史记录保留旧路径引用（作为事实记录，不篡改）。

---

## ADR-001 | 项目根目录与整体架构方向
- **日期**：2026-06-18
- **状态**：已采纳
- **背景**：需要确定项目落地位置和整体架构。
- **决策**：
  1. 项目根目录：`D:\张雪峰skill`（用户指定），代码与治理文件全部在此目录；
  2. 架构方向：三层（表现层/编排层/数据层）+ 双引擎（LLM/Data）+ Provider 抽象；
  3. 角色定义参考 nuwa-skill（女娲.skill）12 模块标准 + zhangxuefeng-skill 工程化骨架；
  4. 治理机制：`_governance/` 下 5 份文件（ARCHITECTURE/EXECUTION_RULES/PROGRESS_LOG/BUG_AUDIT/DECISIONS）。
- **理由**：用户要求整个项目集中在一处，且要求工程治理（日志/架构备份/bug 审查）。
- **后果**：所有产出必须落在 `D:\张雪峰skill\` 下；每次阶段推进更新 PROGRESS_LOG；每次 bug 进 BUG_AUDIT。

---

## 待定决策（未来可能需要 ADR）

- [ ] 是否需要用户登录体系（MVP 暂用 localStorage，未来可能加 Vercel KV + Auth）
- [ ] 是否接入官方数据源（教育部阳光高考/麦可思）作为 A 级来源
- [ ] 报告导出 PDF 的具体实现方案 → ✅ 已决策，见 ADR-007（MD 下载 + 浏览器打印）
- [ ] 是否做用量限制 / 防滥用（免费部署下的成本控制）
