-- BullsNote Stage 2: Supabase Cloud Sync Schema & RLS Policies
-- Supabase Dashboard > SQL Editor 에서 전체 스크립트를 실행하세요.

-- 1. 프로젝트(폴더) 테이블
create table if not exists public.bullsnote_projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  primary key (user_id, id)
);

-- 2. 노트 테이블
create table if not exists public.bullsnote_notes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  primary key (user_id, id)
);

-- 3. 사용자 설정 테이블 (할일 상태 라벨 등)
create table if not exists public.bullsnote_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false
);

-- 4. 조회 성능 향상을 위한 인덱스
create index if not exists idx_bullsnote_projects_user_updated
  on public.bullsnote_projects (user_id, updated_at desc);

create index if not exists idx_bullsnote_notes_user_updated
  on public.bullsnote_notes (user_id, updated_at desc);

create index if not exists idx_bullsnote_settings_user_updated
  on public.bullsnote_settings (user_id, updated_at desc);

-- 5. 권한 부여 (authenticated 역할이 RLS 정책 하에 테이블에 접근할 수 있도록 명시)
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.bullsnote_projects to authenticated;
grant select, insert, update, delete on table public.bullsnote_notes to authenticated;
grant select, insert, update, delete on table public.bullsnote_settings to authenticated;

-- 6. Row Level Security (RLS) 활성화
alter table public.bullsnote_projects enable row level security;
alter table public.bullsnote_notes enable row level security;
alter table public.bullsnote_settings enable row level security;

-- 7. 본인 데이터만 읽기/쓰기/수정/삭제 가능하도록 정책 생성
drop policy if exists "bullsnote_projects_owner_all" on public.bullsnote_projects;
create policy "bullsnote_projects_owner_all"
  on public.bullsnote_projects
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "bullsnote_notes_owner_all" on public.bullsnote_notes;
create policy "bullsnote_notes_owner_all"
  on public.bullsnote_notes
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "bullsnote_settings_owner_all" on public.bullsnote_settings;
create policy "bullsnote_settings_owner_all"
  on public.bullsnote_settings
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
