"use client";

import dynamic from "next/dynamic";

// 채팅 앱은 브라우저 저장소(익명 ID, 언어 설정)와 WebGL(3D)을 쓰므로 서버에서 미리 그리지 않는다.
const ChatApp = dynamic(() => import("./ChatApp"), {
  ssr: false,
  // 언어 설정을 읽기 전이라 글자 없이 로딩 표시만 한다.
  loading: () => (
    <div className="grid h-dvh place-items-center bg-slate-950">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
    </div>
  ),
});

export default function ClientApp() {
  return <ChatApp />;
}
