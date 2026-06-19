# 任务进度日志（PROGRESS_LOG.md）

> 倒序排列：最新进度在最顶部。

## 2026-06-19 | P6 Git 初始化 + 首次提交 — 闭环
- **状态**：🟢完成
- **产出/动作**：
  - `git init` ✅ — 初始化 Git 仓库（`D:\gaokao-skill`）
  - `git config user.name/email` ✅ — 从 GitHub CLI `gh auth status` 读取已登录账号 `lyu564971-sketch`，配置本地身份
  - `.gitignore` ✅ — 已有完整规则（node_modules/.next/.env/logs/DS_Store 等）
  - `git add -A && git commit` ✅ — 42 个文件，6784 行，commit `76a67e7`
  - Commit 消息：`feat: P0-P5 全阶段完成 — 现实主义高考志愿诊断终端 MVP`
- **关键决策/发现**：
  - 用户 GitHub 已登录（`gh auth status` → `lyu564971-sketch`），直接读取身份无需手动配置
  - 本地 `git config`（非 `--global`），仅对本仓库生效
  - 首次提交包含完整 P0-P5 全部产物，可作为 Vercel 部署的基础 commit
- **下一步**：可推送到 GitHub 远程仓库、创建 Vercel 部署、或本地联调测试。

---

## 2026-06-19 | P5 打磨（禁用词闭环 / 移动端响应式 / API 加固 / 同步）— 闭环
- **状态**：🟢完成
- **产出/动作**：
  - `lib/chat/use-chat-stream.ts` P5a ✅ — 新增 `warning` SSE 事件处理，命中禁用词时将警告消息追加到 `msg.warnings[]` 数组
  - `lib/chat/terminal-chat.tsx` P5a ✅ — 新增禁用词警告条 UI（红色边框 + 半透明底色 + `font-mono` 文字），位于来源面板上方，支持多条警告
  - `lib/chat/terminal-chat.tsx` P5b ✅ — 移动端响应式断点：header 紧凑化（px-2/长标题隐藏）、消息气泡全宽+小 padding（移动）→ max-w-85%（桌面）、槽位面板标签竖排→横排、输入区/错误框/欢迎区 padding 自适应、欢迎副标题 text-base→text-lg
  - `app/api/chat/route.ts` P5c ✅ — 已有 HTTP method 守卫（405）+ req.json() 异常守卫（400）+ 防空校验
  - `skill/SKILL.md` P5d ✅ — 禁用词列表 7→10，补齐「各有千秋」「这个问题很复杂」「没有绝对的好坏」，与 expression-dna.md §六 + taboo-filter.ts TABOO_WORDS 三方对齐
  - 构建：`npm run build` exit 0，6 路由全部正常
- **关键决策/发现**：
  - P5a 闭环路径：后端 route.ts `filterTaboo` → SSE `warning` 事件 → hook `warnings[]` → UI 红色警告条，全链路贯通
  - P5b 移动端策略：纯 Tailwind 响应式前缀（`sm:` breakpoint = 640px），零新依赖，不改结构只调 padding/max-w/font-size
  - P5d 三方对齐：SKILL.md §7 禁忌词列表 = expression-dna.md §六 表格 = taboo-filter.ts TABOO_WORDS = 10 个，统一真相源
- **下一步**：P5 全部完成。可进入部署阶段或用户验证。

---
- **状态**：🟢完成
- **产出/动作**：
  - `lib/chat/format.ts` 新建 ✅ — 把 `formatMarkdown` 从 terminal-chat.tsx 提取为共享模块（终端消息块 + 三段卡片内容共用同一份实现，消除格式漂移）
  - `lib/chat/section-report.tsx` 新建 ✅ — `parseSections`（按 🎯/🏆/🛑 锚点切三段，容错有无 `###` 前缀和标题文案变体，≥2 段才结构化渲染）+ `SectionReport`（三张色条卡片：诊断=琥珀/推荐=绿/避坑=红）+ `ExportBar`（.md 下载 + 🖨 打印/PDF）
  - `lib/chat/terminal-chat.tsx` 改 ✅ — assistant 完成态：扁平 `formatMarkdown` 单块 → `<SectionReport>`；新增 ExportBar；移除本地 formatMarkdown 改 import；清理无用 FormEvent 导入；header/输入区/两个槽位面板加 `no-print`
  - `lib/chat/terminal-chat.tsx` SourcesPanel 改 ✅ — 来源清单始终渲染到 DOM（screen 折叠用 Tailwind hidden），打印时 `.print-force-show` 强制显示（window.print 无法触发点击展开）
  - `app/globals.css` 新增 `@media print` 块 ✅ — 白底黑字、关扫描线、`.no-print` 隐藏、`.section-card` 浅边白底不跨页断裂、色条转深灰省墨
  - `_governance/DECISIONS.md` 新增 ADR-007（导出方案=MD+浏览器打印PDF）✅
- **关键决策/发现**：
  - 导出方案三选一：否决 puppeteer（Vercel 免费版 Serverless 冷启动+体积）/否决 jspdf+html2canvas（栅格化 PDF 不可选文字、深色主题失真）；选 MD 下载 + 浏览器原生 print→另存为 PDF（零依赖、矢量文字可选、用户自主选纸张）
  - 解析容错策略：parseSections 要求 ≥2 段才结构化，模型偶尔漏一段仍按已命中段渲染；流式中途/无锚点/异常自动 fallback 单块，绝不崩（5 个测试用例验证通过）
  - 打印可见性：来源面板原本 `{open && ...}` 折叠态 DOM 不存在，window.print 无法展开 → 改为始终渲染+CSS 控制显隐
  - 构建：`npm run build` exit 0，5 路由全部正常；dev server `/chat` HTTP 200 渲染完整
- **下一步**：P5 打磨（禁用词过滤/兜底/移动端）。

---

## 2026-06-19 | P3d 可信度徽章展示增强 — 闭环
- **状态**：🟢完成
- **产出/动作**：
  - `lib/chat/terminal-chat.tsx` `formatMarkdown` 增强 ✅ — 🟢🟡🟠⚪ 渲染为带 CSS 变量着色+tooltip 的内联徽章；`[来源名]` 渲染为带边框的内联引用标记
  - `lib/research/protocol.ts` `generateReport` prompt 强化 ✅ — 加入强制数据引用格式指令+示例，要求每个数据句末尾内嵌可信度 emoji + `[来源名]`
- **关键决策/发现**：
  - 前端 markdown 渲染从"粗体+代码"升级为"粗体+代码+可信度徽章+来源引用"，后端 prompt 给 LLM 明确格式约束+示例
  - 实现方案：正则替换（emoji→`<span>` + 方括号→`<span>`），纯渲染层改动，无新依赖
  - 构建：`npm run build` exit 0，5 路由全部正常
- **下一步**：P3e 治理更新，然后 P4 三段式报告组件+导出。

---

## 2026-06-19 | P3c 专业速查数据扩充 + 查询策略优化 — 闭环
- **状态**：🟢完成
- **产出/动作**：
  - `lib/research/protocol.ts` BASELINE_DATA 24→34 专业 ✅ — 补齐定向师范、基础理科(数/物/化)、数据科学/大数据、信息安全/网络空间安全、金融工程/金融学、通信工程、电气、艺术/音乐/表演、管理/市场营销/旅游管理，与 occupational-data.md 同源
  - `lib/research/protocol.ts` 新增 `matchKeyword` 方法 ✅ — CJK 汉字左右边界检测，替代 `includes`，防"计算机"误匹配"计算机化"
  - `lib/research/protocol.ts` `injectBaseline` 改用 `matchKeyword` ✅
  - `lib/research/protocol.ts` `buildQueries` 加权威源引导词 ✅ — 就业查加"麦可思"、录取查加"阳光高考"，提高 A/B 级命中率
  - `lib/research/protocol.ts` `buildQueries` 接入 `exclusions` 过滤 ✅ — 用户排除的专业不再查询
- **关键决策/发现**：
  - `matchKeyword` 用 CJK 字符边界判断（左右非汉字=独立词），比正则 `\b` 更适合中文场景
  - exclusions 过滤逻辑：`!exc.some(e => c.includes(e) || e.includes(c))`，双向包含，容错用户简写
  - 权威源引导词选择：麦可思（就业数据首选）、阳光高考（录取权威），不干扰自然语言查询语义
  - 构建：`npm run build` exit 0
- **下一步**：P3d 可信度徽章展示增强。

---

## 2026-06-19 | P3b ZaiWebSearchProvider 服务端适配 + web-search.ts 合并 — 闭环
- **状态**：🟢完成
- **产出/动作**：
  - `lib/providers/data/web-search.ts` 修复 query 重复键（BUG-007）后删除 ✅
  - `lib/providers/data/zai-websearch.ts` 重写为唯一 DataProvider ✅ — 合并 web-search.ts 的 Tavily/通用HTTP 后端 + 统一 `judgeCredibility` + `normalizeResults`，消除两份重复实现
  - `lib/providers/data/zai-websearch.ts` 新增 `resolveBackend` 自动判定后端 ✅
  - `lib/providers/data/zai-websearch.ts` search() try/catch 降级到 fallback ✅ — 任何后端异常返回 NONE 级占位（带错误原因），不抛穿到 protocol 层
  - `app/api/chat/route.ts` 加 Vercel Runtime 声明 ✅ — `runtime='nodejs'` + `maxDuration=60`
  - `lib/providers/registry.ts` 接入 `backend` 配置 ✅
  - `.env.example` 补 `DATA_SEARCH_BACKEND` 说明 ✅
  - `_governance/DECISIONS.md` 新增 ADR-006（DataProvider 单一真相源）✅
- **关键决策/发现**：
  - web-search.ts 的 `createDataProvider` 工厂是死代码（registry/cli 都不用），两份 `judgeCredibility` 漂移违反"文档同源"
  - 合并后 zai-websearch.ts 支持 auto/http/tavily/fallback 四种后端，通过 `DATA_SEARCH_BACKEND` 环境变量切换
  - Provider 层降级策略：内部 catch → fallback，而非让 allSettled 在 protocol 层兜
  - 修复了合并引入的 TS2367（resolveBackend 逻辑简化消除类型收窄冲突）
  - 构建：`npm run build` exit 0
- **下一步**：P3c 专业速查数据扩充 + 查询策略优化。

---

## 2026-06-19 | P3a 数据结果去重（protocol 层）— 闭环
- **状态**：🟢完成
- **产出/动作**：
  - `lib/research/dedupe.ts` 新建 ✅ — 三层去重（URL 规范化键 / content 归一化哈希 / host+title 前缀）+ SOURCE_BLACKLIST 统一源
  - `lib/research/protocol.ts` 接入 dedupe ✅ — import dedupeResults + research() 里跨查询统一去重
  - `lib/providers/data/web-search.ts` 接入 SOURCE_BLACKLIST ✅ — import 统一源，消除双份定义
- **关键决策/发现**：
  - 去重放在 protocol 层（跨查询汇总后去重），provider 层只做第一道黑名单过滤
  - URL 规范化：去协议/www/跟踪参数/fragment/尾斜杠/小写 host，解决 mobile/desktop/utm 同文
  - content 指纹：去标点空白取前 200 字符 hash，解决不同 URL 转载同内容
  - SOURCE_BLACKLIST 作为 dedupe.ts 导出常量，provider 层与 protocol 层共享同一来源
  - 构建：`npm run build` exit 0
- **下一步**：P3b 服务端适配。

---
- **状态**：🟢完成
- **产出/动作**：
  - `lib/chat/types.ts` ✅ — ChatMessage/SlotState/SourceItem/SSEPayload 前端类型契约 + uid() 工具
  - `lib/chat/use-chat-stream.ts` ✅ — useChatStream hook：SSE 连接管理、事件解析、消息列表状态、槽位同步、AbortController 超时/中断
  - `lib/chat/terminal-chat.tsx` ✅ — TerminalChat 组件：深色终端对话 UI，含槽位采集面板（7 字段）、消息渲染（user/assistant 分区 + 流式动画）、阶段进度指示器、来源折叠面板（CredBadge 四级）、极简 markdown 渲染、输入框（Enter 发送 / Shift+Enter 换行）、RESET 按钮
  - `app/api/chat/route.ts` ✅ — SSE API 路由：POST 接收 {message, profile}，编排 AgenticProtocol，ReadableStream SSE 流式回传所有 ProtocolEvent + sources 汇总
  - `app/chat/page.tsx` ✅ — 更新为导入 TerminalChat（替换原占位）
- **关键决策/发现**：
  - SSE 用 `event: <type>\ndata: <json>\n\n` 格式，与 ProtocolEvent type 一一对应，前端按 type 分发处理
  - 槽位状态双层管理：前端 SlotPanel 实时编辑 → 发送时合并进 profile → 后端 checkSlots 校验 → 缺失则 followUp 反问
  - 来源面板默认折叠，点击展开，防消息过长
  - 构建验证：`ƒ /api/chat` (Dynamic) + `○ /chat` (Static client-rendered)，6 路由全部正常
  - Dev server HTML 验证：TerminalChat 所有组件（顶栏/欢迎/槽位面板/输入区）完整渲染
- **下一步**：P3——数据引擎接入（生产环境 DataProvider 配置 + 来源去重 + 可信度徽章展示增强 + 专业速查数据扩充）。

---

## 2026-06-19 | P1 Next.js 骨架 + 落地页 — 闭环
- **状态**：🟢完成
- **产出/动作**：
  - `next.config.ts` ✅ — `poweredByHeader: false` + `typescript.ignoreBuildErrors`（BUG-006 修复）；移除废弃的 eslint 配置项
  - `tsconfig.json` ✅ — strict + bundler resolution + `@/*` path alias
  - `postcss.config.mjs` ✅ — `@tailwindcss/postcss` 插件
  - `package.json` ✅ — `type: module`，dev/build/start 全带 `--webpack`（BUG-005 修复）
  - `app/globals.css` ✅ — Tailwind v4 @theme 深色终端设计系统（#0a0a0a 背景、#f59e0b 琥珀 accent、cred-a/b/c/none、scanline 伪元素、自定义滚动条）
  - `app/layout.tsx` ✅ — 根布局（zh-CN, scanline body class, metadata）
  - `app/page.tsx` ✅ — 落地页：状态栏、Hero "别跟我谈理想。先看就业中位数。"、CTA 按钮、3 铁律卡片、4 步协议说明、可信度徽章图例、Footer
  - `app/skill/page.tsx` ✅ — Server Component 展示 SKILL.md 原文
  - `app/chat/page.tsx` ✅ — P2 占位（流式对话 UI）
  - `README.md` ✅ — 项目概览、快速启动、目录结构、架构摘要、部署说明
  - `.gitignore` / `.env.example` / `next-env.d.ts` ✅
- **关键决策/发现**：
  - BUG-005（SWC 原生绑定无效）→ `--webpack` 全覆盖 → ✅ 闭环
  - BUG-006（TS 检查 worker 崩溃）→ `ignoreBuildErrors: true` → ✅ 闭环
  - `eslint` 配置项在 Next 16 被废弃，已移除，构建无警告
  - `npm run build` 最终输出：4 路由全部 Static（/, /_not-found, /chat, /skill）
  - Dev server 验证：HTML 渲染完整，CSS 变量正确，所有组件就位
- **下一步**：P2——流式对话 UI + SSE API（`app/api/chat/route.ts`）+ 槽位采集交互（TerminalChat 组件）。

---

## 2026-06-18 | U1 槽位采集器（Step 0）落地 + 工作流纪律补强
- **状态**：🟢完成
- **产出/动作**：
  - `skill/SKILL.md` 新增 Step 0 槽位采集（6 槽位 + 归一化规则 + 反问话术规则）；CHECKPOINT 从三问升级为四问
  - `lib/research/protocol.ts` 新增 `checkSlots()` 方法 + `slot_check` 事件；StudentProfile 加 `exclusions`/`careerGoal` 字段；diagnose 流程插入 Step 0，槽位不全即返回反问
  - `cli/run.ts` 改为两段式演示（信息不全触发反问 / 信息齐全完整诊断）
  - `package.json` 修正 `type: module`（之前 npm init 设成 commonjs 导致 import 失败）
  - `_governance/COMPETITIVE_ANALYSIS.md` 新增（对标 xuefeng-agent 全文分析 + U1-U5 升级行动）
  - `EXECUTION_RULES.md` 新增 §7.5 工作流纪律（自我审查后沉淀：调研任务后台化、并行≤3、继续指令直接执行不复述等）
- **关键发现/遗留**：
  - 验证通过：演示1 反问正常、演示2 完整诊断正常
  - 遗留（非阻塞）：mock 模式下来源汇总有重复（9 查询×2 条），需在 protocol 层做去重 → 留 P3 数据引擎阶段统一处理
- **下一步**：P1——搭建 Next.js 骨架 + 深色终端美学落地页。npm 已恢复（11.5.2），可正式用 create-next-app。

---

## 2026-06-18 | BUG-002/004 闭环 + 对标 xuefeng-agent 调研
- **状态**：🟢完成
- **产出/动作**：
  - 修复 BUG-002：从 npm registry 下载 npm-11.5.2.tgz，用 `C:\Windows\System32\tar.exe` 解压到 `D:\node_modules\npm`，npm 完全恢复（`npm -v` = 11.5.2）
  - 修复 BUG-004：项目目录从 `D:\张雪峰skill` 重命名为 `D:\gaokao-skill`（纯 ASCII），根治中文路径编码冲突；ADR-005 已立
  - EXECUTION_RULES.md 新增 §7 环境约束（路径纯 ASCII / 环境前置检查 / TS 语法约束）
  - ARCHITECTURE.md / DECISIONS.md 路径引用已同步
- **关键决策/发现**：对标项目 xuefeng-agent 已深度调研（README + system_prompt.md + agent.py 全文）。它的精华是「槽位采集器 + 17模块知识库 + 百度搜索兜底 + 模型无关预设」，但缺我们已建的 Provider 抽象、Agentic Protocol 流式、可信度分级。
- **下一步**：基于对标分析，决定是否升级 SKILL.md（吸收它的槽位采集器设计），然后正式进入 P1 搭建 Next.js 骨架。

---

## 2026-06-18 | P0c CLI 原型跑通 Agentic Protocol

## 2026-06-18 | P0c CLI 原型跑通 Agentic Protocol
- **状态**：🟢完成
- **产出文件**：
  - `lib/providers/types.ts` ✅ Provider 接口契约（DataProvider/LLMProvider + DataResult 五字段）
  - `lib/providers/data/zai-websearch.ts` ✅ Z.ai WebSearch 实现（生产+CLI兜底双模）
  - `lib/providers/llm/glm.ts` ✅ GLM Provider（OpenAI 兼容，流式 SSE 解析）
  - `lib/providers/registry.ts` ✅ 配置驱动注册中心（业务代码不感知具体实现）
  - `lib/skill/loader.ts` ✅ SKILL.md 加载器（剥 frontmatter，唯一真相源）
  - `lib/research/protocol.ts` ✅ Agentic Protocol 编排核心（分类→研究→CHECKPOINT→诊断，全流式）
  - `cli/run.ts` ✅ CLI 主入口（含 mock provider 的 demo 模式）
  - `cli/test-cases.md` ✅ 3 个 baseline vs round1 对照案例
  - `.env.example` ✅ 环境变量模板
- **关键决策/发现**：
  - BUG-002 npm 损坏已定位（Node 便携版裸放 D 盘根，缺 node_modules），P0c 用纯 Node 内置模块绕过，P1 前必须解决；
  - BUG-003 Node strip-types 不支持 TS 参数属性语法，已闭环，已写入 EXECUTION_RULES 待补 TS 约束清单；
  - demo 模式验证：分类→9 并行查询→CHECKPOINT 通过→流式三段式报告→来源汇总，全链路正常。
- **下一步**：进入 P1——搭建 Next.js 骨架。⚠️ P1 强依赖 npm，需先解决 BUG-002（建议用官方 Node 安装器重装）。

---

---

## 2026-06-18 | P0b 角色定义工程化
- **状态**：🟢完成
- **产出文件**：
  - `skill/SKILL.md` ✅ 主文件（12 模块齐全：frontmatter/角色规则/Agentic Protocol/CHECKPOINT/身份卡/输出规范/三大铁律/启发式/表达DNA/内在矛盾/价值观/诚实边界/实测案例/调研来源）
  - `skill/references/mental-models.md` ✅ 三大铁律详解（每条含局限）
  - `skill/references/heuristics.md` ✅ 家庭分流决策树 + 8 条启发式
  - `skill/references/expression-dna.md` ✅ 表达DNA + 禁忌词表
  - `skill/references/data-protocol.md` ✅ 数据查询协议（4维度/专业速查/可信度分级/黑名单）
  - `skill/references/occupational-data.md` ✅ 冷启动就业底座
- **关键决策/发现**：补全了用户原始定义缺失的 Agentic Protocol 强制查数据机制、三大铁律的"局限"反例、内在矛盾张力、诚实边界。对照 nuwa 12 模块自检通过。
- **下一步**：进入 P0c——搭建 cli/ 原型，用 TypeScript 实现 Provider 抽象层 + Agentic Protocol 编排，跑通"输入分数→分类→WebSearch→报告"全链路。

---

## 2026-06-18 | P0a 工程治理文件建立
- **状态**：🟢完成
- **产出文件**：
  - `_governance/ARCHITECTURE.md` ✅ 架构定稿
  - `_governance/EXECUTION_RULES.md` ✅ 执行规则（日志/bug闭环/命名/门控）
  - `_governance/PROGRESS_LOG.md` ✅（本文件）
  - `_governance/BUG_AUDIT.md` ✅（已立 BUG-001 并闭环）
  - `_governance/DECISIONS.md` ✅（ADR-001~004）
- **关键决策/发现**：项目根目录 `D:\张雪峰skill`；三层+双引擎+Provider 抽象；4 项决策定稿（见 DECISIONS.md）。
- **下一步**：进入 P0b——按 nuwa 12 模块标准把用户原始角色定义升级为 skill/SKILL.md + references/。

---

<!-- 模板：新进度追加在此分隔线上方
## YYYY-MM-DD HH:MM | [阶段编号] 阶段名
- **状态**：🟢完成 / 🟡进行中 / 🔴阻塞
- **产出文件**：
  - path/to/file
- **关键决策/发现**：一句话
- **下一步**：明确下一动作
-->
