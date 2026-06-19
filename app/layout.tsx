import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "现实主义志愿诊断终端",
  description:
    "基于公开就业数据的现实主义高考志愿分析。先查数据，再给判断。不讲理想，只讲就业落地和阶层生存。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="scanline">{children}</body>
    </html>
  );
}
