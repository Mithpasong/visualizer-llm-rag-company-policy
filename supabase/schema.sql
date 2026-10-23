-- Mithpasong 사내 규정 RAG: Vector DB 테이블과 검색 함수
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행한다. 여러 번 실행해도 안전하다.

-- ① pgvector 확장 켜기 (Supabase 권장대로 extensions 스키마에 설치)
create extension if not exists vector with schema extensions;

-- ② 조각 저장 테이블
--    embedding 의 768 은 임베딩 모델이 만드는 숫자 개수(차원)와 반드시 같아야 한다.
create table if not exists public.chunks (
  id         text primary key,                 -- 조각 ID (예: 휴가규정-제2조-1). 다시 넣으면 덮어쓴다.
  content    text not null,                    -- 조각 원문
  metadata   jsonb not null default '{}',      -- ref, 페이지, 규정 이름 등
  embedding  extensions.vector(768) not null,  -- 의미 벡터
  updated_at timestamptz not null default now()
);

-- ③ 빠른 검색을 위한 인덱스 (코사인 거리)
create index if not exists chunks_embedding_idx
  on public.chunks using hnsw (embedding extensions.vector_cosine_ops);

-- ④ 보안: 행 수준 보안(RLS)을 켜고 정책은 만들지 않는다.
--    → 공개 키(anon, publishable)로는 아무것도 읽거나 쓸 수 없다.
--    → 서버의 비밀 키(service_role, secret)만 RLS를 우회해 접근한다.
alter table public.chunks enable row level security;
grant select, insert, update, delete on public.chunks to service_role;

-- ⑤ 검색 함수: 질문 벡터와 가까운 조각을 가까운 순서로 돌려준다.
create or replace function public.match_chunks (
  query_embedding extensions.vector(768),
  match_count     int default 5
)
returns table (id text, content text, metadata jsonb, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select
    c.id,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity  -- 1에 가까울수록 비슷하다
  from public.chunks c
  order by c.embedding <=> query_embedding               -- 가까운 순서
  limit match_count;
$$;

-- 검색 함수도 서버 키로만 실행할 수 있게 한다.
revoke execute on function public.match_chunks(extensions.vector, int) from public, anon, authenticated;
grant execute on function public.match_chunks(extensions.vector, int) to service_role;
