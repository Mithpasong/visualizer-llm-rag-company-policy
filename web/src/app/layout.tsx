import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mithpasong 사내 규정 도우미",
  description: "사내 규정집 PDF를 Vector DB로 검색해 근거와 함께 답하는 RAG 챗봇",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
