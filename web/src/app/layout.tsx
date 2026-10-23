import type { Metadata } from "next";
// Pretendard 웹폰트를 직접 제공한다. 화면에 나오는 글자가 속한 묶음(subset)만 내려받아 빠르다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
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
