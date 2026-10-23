// 서버 전용 환경변수. NEXT_PUBLIC_ 이 붙지 않아서 브라우저로는 전달되지 않는다.

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경변수 ${name} 이(가) 없습니다. web/.env.local 을 확인하세요.`);
  return value;
}

export function getEnv() {
  return {
    // 대시보드에서 REST 주소(/rest/v1/)까지 복사한 경우에도 동작하게 한다.
    supabaseUrl: required("SUPABASE_URL").split("/rest/v1")[0].replace(/\/$/, ""),
    supabaseKey: required("SUPABASE_SECRET_KEY"),
    geminiKey: required("GEMINI_API_KEY"),
    // 결제된 API 키를 쓰므로 브라우저(익명 ID)당 24시간 질문 수를 제한한다.
    dailyLimit: Number(process.env.DAILY_MESSAGE_LIMIT ?? 30),
  };
}
