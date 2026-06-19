import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // BUG-006: Next 16 webpack worker 在 SWC wasm fallback 下做 TS 检查时崩溃
  // （"invalid type: unit value, expected usize"）。编译本身已通过，
  // 类型检查改由 IDE/tsc 独立做。部署到 Vercel（标准 Linux，SWC 原生）后可移除此项。
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
