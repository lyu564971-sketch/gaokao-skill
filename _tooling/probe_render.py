"""
Playwright 探针 - 阶段1：打开 Render dashboard，判断登录态，导出页面状态到 JSON。
非交互式：不需要 input()，结果写文件，供后续脚本读取。
"""
import json
from playwright.sync_api import sync_playwright

DEPLOY_URL = "https://dashboard.render.com/web/srv-d8r2md6gvqtc73ef25fg/deploys/dep-d8r83gjrjlhs73e167k0"
OUT = r"C:\Users\26239\ZCodeProject\_tooling\probe_result.json"

result = {"needs_login": False, "url": "", "title": "", "body_excerpt": "", "error": None}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, channel="chrome")
    context = browser.new_context(viewport={"width": 1400, "height": 900})
    page = context.new_page()

    try:
        print(f">> 导航: {DEPLOY_URL}", flush=True)
        page.goto(DEPLOY_URL, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(4000)  # 等 SPA 渲染

        url = page.url
        title = page.title()
        result["url"] = url
        result["title"] = title
        print(f">> URL: {url}", flush=True)
        print(f">> Title: {title}", flush=True)

        # 判断是否需要登录
        if any(k in url.lower() for k in ["login", "signin", "auth", "sso"]):
            result["needs_login"] = True
            print(">> 需要登录", flush=True)

        body_text = page.inner_text("body")
        result["body_excerpt"] = body_text[:3000]
        print(">> ===== 页面文本前 1500 字 =====", flush=True)
        print(body_text[:1500], flush=True)

    except Exception as e:
        result["error"] = str(e)
        print(f">> 异常: {e}", flush=True)
    finally:
        # 保留浏览器窗口 8 秒供观察，然后关闭
        page.wait_for_timeout(8000)
        browser.close()

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print(f">> 结果已写入 {OUT}", flush=True)
