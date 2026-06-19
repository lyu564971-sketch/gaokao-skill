import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-16">
      {/* 顶部状态栏 */}
      <header className="mb-20 flex items-center justify-between border-b border-[var(--color-border)] pb-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
          <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-fg-dim)]">
            gaokao-realist · v0.1
          </span>
        </div>
        <Link
          href="/skill"
          className="font-mono text-xs text-[var(--color-fg-dim)] transition-colors hover:text-[var(--color-accent)]"
        >
          [ 关于角色定义 ]
        </Link>
      </header>

      {/* Hero 区 */}
      <section className="flex flex-1 flex-col justify-center">
        <div className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">
          // 现实主义志愿诊断终端
        </div>
        <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight md:text-6xl">
          别跟我谈理想。
          <br />
          <span className="text-[var(--color-accent)]">先看就业中位数。</span>
        </h1>
        <p className="mb-10 max-w-2xl text-lg leading-relaxed text-[var(--color-fg-dim)]">
          一个极度理性的高考志愿分析终端。输入分数、位次、家庭条件，
          它先联网核查就业中位数、薪资、录取线，
          再给出结构化、带数据来源、有压迫感的诊断报告。
          <span className="text-[var(--color-fg)]">
            {" "}
            不讲空泛理想，只讲就业落地和阶层生存。
          </span>
        </p>

        {/* 核心入口 */}
        <div className="mb-12 flex flex-col gap-4 sm:flex-row">
          <Link
            href="/chat"
            className="group inline-flex items-center justify-center gap-2 border border-[var(--color-accent)] bg-[var(--color-accent)] px-8 py-4 font-mono text-sm font-semibold text-[var(--color-bg)] transition-all hover:bg-transparent hover:text-[var(--color-accent)]"
          >
            <span>&gt;_ 开始诊断</span>
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
          <a
            href="#how"
            className="inline-flex items-center justify-center gap-2 border border-[var(--color-border-bright)] px-8 py-4 font-mono text-sm text-[var(--color-fg-dim)] transition-colors hover:border-[var(--color-fg-dim)] hover:text-[var(--color-fg)]"
          >
            怎么运作
          </a>
        </div>

        {/* 三个铁律 */}
        <div className="grid gap-px overflow-hidden border border-[var(--color-border)] bg-[var(--color-border)] md:grid-cols-3">
          {[
            {
              n: "01",
              t: "社会筛子论",
              d: "HR 只看学历门槛。够不上名校时，专业选择权远大于学校光环。",
            },
            {
              n: "02",
              t: "家庭背景硬分流",
              d: "试错成本为零的家庭没有资格谈理想。困难家庭强推能快速变现的理工科。",
            },
            {
              n: "03",
              t: "中位数倒推法",
              d: "只看普通毕业生的去向和起薪，不看顶尖的幸存者偏差。",
            },
          ].map((r) => (
            <div
              key={r.n}
              className="bg-[var(--color-bg-card)] p-6 transition-colors hover:bg-[var(--color-bg-elevated)]"
            >
              <div className="mb-3 font-mono text-xs text-[var(--color-accent)]">
                {r.n}
              </div>
              <div className="mb-2 font-semibold">{r.t}</div>
              <div className="text-sm leading-relaxed text-[var(--color-fg-dim)]">
                {r.d}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 工作流说明 */}
      <section id="how" className="mt-24 border-t border-[var(--color-border)] pt-12">
        <div className="mb-8 font-mono text-xs uppercase tracking-[0.3em] text-[var(--color-accent)]">
          // agentic protocol · 先查后答
        </div>
        <div className="grid gap-6 md:grid-cols-4">
          {[
            { step: "Step 0", t: "槽位采集", d: "多轮追问补全省份/位次/家庭条件，不全不答。" },
            { step: "Step 1", t: "问题分类", d: "判断是纯框架问题还是需事实问题。" },
            { step: "Step 2", t: "联网核查", d: "并行查就业中位数、录取线、对口率、行业信号。" },
            { step: "Step 3", t: "诊断报告", d: "三段式输出：风险警告 / 推荐方案 / 避坑指南。" },
          ].map((s) => (
            <div key={s.step}>
              <div className="mb-2 font-mono text-xs text-[var(--color-fg-faint)]">
                {s.step}
              </div>
              <div className="mb-1 font-semibold text-[var(--color-fg)]">
                {s.t}
              </div>
              <div className="text-sm text-[var(--color-fg-dim)]">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 数据可信度说明 */}
      <section className="mt-16 border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6">
        <div className="mb-4 font-mono text-xs uppercase tracking-widest text-[var(--color-fg-dim)]">
          数据可信度分级 · 每条结论可溯源
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--color-cred-a)]" />
            <span className="text-[var(--color-fg-dim)]">A 官方</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--color-cred-b)]" />
            <span className="text-[var(--color-fg-dim)]">B 权威媒体</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[var(--color-cred-c)]" />
            <span className="text-[var(--color-fg-dim)]">C 第三方</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full border border-dashed border-[var(--color-cred-none)]" />
            <span className="text-[var(--color-fg-dim)]">⚪ 无数据（诚实标注）</span>
          </span>
        </div>
      </section>

      {/* 页脚 */}
      <footer className="mt-20 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-fg-faint)]">
        <p className="font-mono">
          // 本终端基于公开就业数据和现实主义框架给判断，最终决策权在你。
        </p>
      </footer>
    </main>
  );
}
