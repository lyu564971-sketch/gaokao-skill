import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "现实主义志愿诊断",
  description: "一个先查数据、再给判断的高考志愿对话助手。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
