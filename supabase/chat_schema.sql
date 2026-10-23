-- 채팅 대화 저장용 테이블
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행한다. 여러 번 실행해도 안전하다.
-- 로그인 없이 브라우저마다 만든 익명 ID(client_id)로 대화를 구분한다.

-- ① 대화 목록
create table if not exists public.conversations (
  id         uuid primary key default gen_random_uuid(),
  client_id  text not null,                 -- 브라우저의 익명 ID
  title      text not null,                 -- 첫 질문으로 만든 제목
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_client_idx on public.conversations (client_id, updated_at desc);

-- ② 대화 안의 메시지
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  client_id       text not null,            -- 하루 질문 수 제한을 세기 위해 함께 저장
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  model           text,                     -- 답변한 모델 (assistant만)
  search          jsonb,                    -- 검색 결과·출처·3D 좌표 (assistant만)
  created_at      timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_client_idx on public.messages (client_id, created_at);

-- ③ 보안: RLS를 켜고 정책은 만들지 않는다. 서버의 비밀 키(service_role)만 접근한다.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
grant select, insert, update, delete on public.conversations to service_role;
grant select, insert, update, delete on public.messages to service_role;
