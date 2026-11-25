-- 스트존 데이터 모델 (Supabase/PostgreSQL 15+). 서버가 채점·집계의 유일한 권위(authoritative)다.
-- 앱 TS 로직(src/core)과 SQL 함수는 같은 공식을 구현하며, scripts/verify-sql.mts가 두 구현의 일치를 대조 검증한다.
-- 주의: auth.users / auth.uid() 는 Supabase가 제공. 로컬 검증 시에는 verify 스크립트가 스텁을 만든다.

create extension if not exists pgcrypto;

-- ───────────────────────── 기준 데이터 ─────────────────────────
create table teams (
  id     text primary key,
  name   text not null,
  short  text not null,
  brand  text not null           -- 대표 색상(HEX). 로고는 상표 이슈로 저장하지 않음
);

-- KST 기준 주간 시즌 키(월요일 날짜). 모든 집계의 파티션 키.
create function season_week(ts timestamptz) returns date
language sql immutable parallel safe as
$$ select date_trunc('week', ts at time zone 'Asia/Seoul')::date $$;

create function kst_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- ───────────────────────── 투구 데이터 ─────────────────────────
-- source='simulated': 시뮬레이션 궤적(기본). source='licensed': 라이선스 계약된 추적 데이터(license_ref 필수).
create table pitches (
  id               text primary key,
  source           text not null check (source in ('simulated','licensed')),
  license_ref      text,                                   -- 계약/약관 식별자
  game_date        date,
  label            text,                                   -- "9회말 2사 만루 풀카운트"
  pitch_type       text not null check (pitch_type in ('fastball','slider','curve','changeup','forkball')),
  speed_kph        smallint not null,
  batter_height_cm smallint not null check (batter_height_cm between 140 and 220),
  plate_x_in       numeric(6,2) not null,                  -- 포수 시점, 플레이트 중앙=0, inch
  plate_z_in       numeric(6,2) not null,                  -- 지면 기준 높이, inch
  release_x_in     numeric(6,2) not null,
  release_z_in     numeric(6,2) not null,
  bow_x_in         numeric(6,2) not null default 0,
  bow_z_in         numeric(6,2) not null default 0,
  difficulty       text not null check (difficulty in ('easy','medium','hard','controversial')),
  created_at       timestamptz not null default now(),
  check (source <> 'licensed' or license_ref is not null)
);

-- 공 가장자리~존 경계 거리(inch). 음수=스트라이크(걸침), 양수=볼.  (src/core/zone.ts judge()와 동일)
create function edge_margin_in(x numeric, z numeric, h_cm numeric) returns numeric
language sql immutable parallel safe as $$
  with g as (
    select -8.5::numeric as l, 8.5::numeric as r,
           0.2764 * (h_cm / 2.54) as b, 0.5635 * (h_cm / 2.54) as t
  ), d as (
    select g.*, greatest(g.l - x, 0, x - g.r) as dx, greatest(g.b - z, 0, z - g.t) as dz from g
  )
  select (case when dx > 0 or dz > 0 then sqrt(dx*dx + dz*dz)
               else -least(x - l, r - x, z - b, t - z) end) - 1.45
  from d
$$;

alter table pitches add column edge_margin numeric generated always as (edge_margin_in(plate_x_in, plate_z_in, batter_height_cm)) stored;
alter table pitches add column abs_call text generated always as (case when edge_margin_in(plate_x_in, plate_z_in, batter_height_cm) <= 0 then 'strike' else 'ball' end) stored;

-- 클라이언트에는 정답 컬럼(abs_call, edge_margin)을 숨긴 뷰만 노출한다.
create view pitches_public as
  select id, source, label, pitch_type, speed_kph, batter_height_cm,
         plate_x_in, plate_z_in, release_x_in, release_z_in, bow_x_in, bow_z_in, difficulty
  from pitches;

-- 오늘의 논란 판정: 하루 1~3개, 운영 배치(또는 날짜 시드 생성기)가 사전 등록
create table controversies (
  day      date not null,
  idx      smallint not null check (idx between 1 and 3),
  pitch_id text not null references pitches(id),
  primary key (day, idx)
);

-- ───────────────────────── 사용자 ─────────────────────────
create table profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 1 and 12),
  team_id    text references teams(id),
  pending_team_id text references teams(id),   -- 구단 변경은 다음 월요일 00:00 KST부터 적용(주중 갈아타기 어뷰징 방지)
  is_anonymous boolean not null default true,  -- 가입 없이 시작 → 이후 소셜 로그인으로 승격(link identity)
  created_at timestamptz not null default now()
);

create table streaks (
  user_id  uuid primary key references profiles(user_id) on delete cascade,
  current  int not null default 0,
  best     int not null default 0,
  last_day date
);

-- ───────────────────────── 응답(정답 로그) ─────────────────────────
create table answers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(user_id) on delete cascade,
  team_id     text references teams(id),                 -- 응답 시점 구단 스냅샷(주중 이동해도 과거 기록 불변)
  round_id    uuid not null,
  pitch_id    text not null references pitches(id),
  mode        text not null check (mode in ('quick','daily')),
  user_call   text not null check (user_call in ('strike','ball','timeout')),
  correct     boolean not null,
  rt_ms       int not null check (rt_ms between 0 and 60000),
  score       int not null default 0,
  created_at  timestamptz not null default now(),
  season_week date generated always as (season_week(created_at)) stored,
  unique (user_id, round_id, pitch_id)
);
-- 논란 판정은 투구당 1인 1표
create unique index answers_one_vote on answers (user_id, pitch_id) where mode = 'daily';
create index answers_week_team on answers (season_week, team_id, user_id);
create index answers_pitch_team on answers (pitch_id, team_id) where mode = 'daily';

-- ───────────────────────── 리그 ─────────────────────────
create table leagues (
  code       text primary key check (code ~ '^[A-HJ-KM-NP-Z2-9]{6}$'),
  name       text not null check (char_length(name) between 1 and 16),
  kind       text not null check (kind in ('friends','team')),
  team_id    text references teams(id),
  owner_id   uuid not null references profiles(user_id) on delete cascade,
  created_at timestamptz not null default now()
);
create table league_members (
  code      text not null references leagues(code) on delete cascade,
  user_id   uuid not null references profiles(user_id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (code, user_id)
);

-- Phase 2: 원격 푸시용(MVP는 로컬 알림만 사용)
create table push_tokens (
  user_id  uuid not null references profiles(user_id) on delete cascade,
  token    text not null,
  platform text not null check (platform in ('ios','android')),
  primary key (user_id, token)
);

-- ───────────────────────── 점수식 (src/core/scoring.ts scorePitch()와 동일) ─────────────────────────
create function score_pitch(p_correct boolean, p_edge_margin numeric, p_rt_ms int, p_combo int)
returns int language sql immutable as $$
  select case when not p_correct then 0 else
    100
    + round(100 * least(1, greatest(0, 1 - abs(p_edge_margin) / 4)))::int
    + round(50  * least(1, greatest(0, 1 - p_rt_ms / 4000.0)))::int
    + 10 * least(greatest(p_combo - 1, 0), 4)
  end
$$;

-- ───────────────────────── 서버 권위 채점 ─────────────────────────
create function submit_answer(p_round uuid, p_pitch text, p_mode text, p_call text, p_rt_ms int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pr pitches%rowtype;
  prof profiles%rowtype;
  ok boolean;
  combo int := 0;
  sc int;
  t date := kst_today();
  st streaks%rowtype;
  r record;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into pr from pitches where id = p_pitch;
  if not found then raise exception 'unknown pitch'; end if;
  select * into prof from profiles where user_id = uid;
  if not found then raise exception 'no profile'; end if;

  ok := (p_call = pr.abs_call);
  if ok then
    -- 같은 라운드에서 직전까지의 연속 정답 수 + 1
    combo := 1;
    for r in select correct from answers where user_id = uid and round_id = p_round order by created_at desc, id loop
      exit when not r.correct;
      combo := combo + 1;
    end loop;
  end if;
  sc := case when p_mode = 'daily' then 0 else score_pitch(ok, pr.edge_margin, p_rt_ms, combo) end;

  insert into answers (user_id, team_id, round_id, pitch_id, mode, user_call, correct, rt_ms, score)
  values (uid, prof.team_id, p_round, p_pitch, p_mode, p_call, ok, p_rt_ms, sc);

  -- 스트릭 (src/core/streak.ts recordPlay()와 동일)
  insert into streaks (user_id) values (uid) on conflict do nothing;
  select * into st from streaks where user_id = uid for update;
  if st.last_day is distinct from t then
    st.current := case when st.last_day = t - 1 then st.current + 1 else 1 end;
    update streaks set current = st.current, best = greatest(best, st.current), last_day = t where user_id = uid;
  end if;

  return jsonb_build_object('correct', ok, 'abs_call', pr.abs_call, 'edge_margin_in', pr.edge_margin, 'score', sc);
end $$;

-- ───────────────────────── 구단 대항전 집계 (src/core/ranking.ts computeTeamRanking()와 동일) ─────────────────────────
-- 1) 개인 캡(p_cap) 2) 베이지안 수축(p_prior) 3) 정확도만 사용
create function team_ranking(p_week date, p_cap int default 100, p_prior numeric default 50, p_min_players int default 5)
returns table (team_id text, rank int, accuracy numeric, raw_accuracy numeric, players int, attempts bigint, provisional boolean)
language sql stable as $$
  with u as (
    select a.team_id, a.user_id, count(*)::numeric att, count(*) filter (where a.correct)::numeric cor
    from answers a where a.season_week = p_week and a.team_id is not null group by a.team_id, a.user_id
  ), e as (
    select team_id, user_id, att, cor, least(att, p_cap) eatt,
           case when att <= p_cap then cor else cor * p_cap / att end ecor from u
  ), lg as (select coalesce(sum(ecor) / nullif(sum(eatt), 0), 0.5) mu from e),
  t as (
    select tm.id team_id, coalesce(sum(e.eatt), 0) eatt, coalesce(sum(e.ecor), 0) ecor,
           coalesce(sum(e.att), 0) att, coalesce(sum(e.cor), 0) cor, count(e.user_id)::int players
    from teams tm left join e on e.team_id = tm.id group by tm.id
  ), s as (
    select t.team_id, (t.ecor + p_prior * lg.mu) / (t.eatt + p_prior) acc,
           case when t.att > 0 then t.cor / t.att else 0 end raw, t.players, t.att
    from t cross join lg
  )
  select s.team_id, (row_number() over (order by s.acc desc, s.players desc, s.team_id))::int,
         s.acc, s.raw, s.players, s.att::bigint, s.players < p_min_players
  from s order by 2
$$;

-- 내 구단 기여도 = 캡 적용 정답 − 캡 적용 시도 × 리그 평균 (src/core/ranking.ts teamContribution())
create function my_team_contribution(p_week date, p_cap int default 100)
returns numeric language sql stable security definer set search_path = public as $$
  with me as (
    select count(*)::numeric att, count(*) filter (where correct)::numeric cor
    from answers where user_id = auth.uid() and season_week = p_week and team_id is not null
  ), mu as (
    select coalesce(sum(ecor) / nullif(sum(eatt), 0), 0.5) v from (
      select least(count(*), p_cap)::numeric eatt,
             case when count(*) <= p_cap then (count(*) filter (where correct))::numeric
                  else (count(*) filter (where correct))::numeric * p_cap / count(*) end ecor
      from answers where season_week = p_week and team_id is not null group by team_id, user_id
    ) z
  )
  select round(((case when me.att <= p_cap then me.cor else me.cor * p_cap / me.att end)
              - least(me.att, p_cap) * mu.v)::numeric, 1)
  from me, mu where me.att > 0
$$;

-- 논란 판정 구단별 표 집계(팬 투표 vs ABS 공개용)
create function controversy_tally(p_pitch text)
returns table (team_id text, strike bigint, ball bigint)
language sql stable security definer set search_path = public as $$
  select team_id, count(*) filter (where user_call = 'strike'), count(*) filter (where user_call = 'ball')
  from answers where mode = 'daily' and pitch_id = p_pitch and team_id is not null group by team_id
$$;

-- ───────────────────────── 리그 ─────────────────────────
create function create_league(p_name text, p_kind text) returns text
language plpgsql security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from leagues where code = c);
  end loop;
  insert into leagues (code, name, kind, team_id, owner_id)
    values (c, p_name, p_kind, case when p_kind = 'team' then (select team_id from profiles where user_id = auth.uid()) end, auth.uid());
  insert into league_members (code, user_id) values (c, auth.uid());
  return c;
end $$;

create function join_league(p_code text) returns void
language sql security definer set search_path = public as $$
  insert into league_members (code, user_id) select code, auth.uid() from leagues where code = upper(p_code) on conflict do nothing
$$;

create function league_standings(p_code text, p_week date)
returns table (user_id uuid, nickname text, attempts bigint, accuracy numeric)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.nickname, count(a.id), case when count(a.id) = 0 then null else round(avg((a.correct)::int), 4) end
  from league_members m join profiles p using (user_id)
  left join answers a on a.user_id = m.user_id and a.season_week = p_week
  where m.code = upper(p_code) and exists (select 1 from league_members x where x.code = m.code and x.user_id = auth.uid())
  group by m.user_id, p.nickname order by 4 desc nulls last, 3 desc
$$;

-- ───────────────────────── RLS ─────────────────────────
alter table profiles enable row level security;
alter table streaks enable row level security;
alter table answers enable row level security;
alter table leagues enable row level security;
alter table league_members enable row level security;
alter table push_tokens enable row level security;
alter table pitches enable row level security;          -- 정답 컬럼 보호: 직접 SELECT 금지, pitches_public/RPC만 사용
alter table teams enable row level security;
alter table controversies enable row level security;

create policy teams_read on teams for select using (true);
create policy controversies_read on controversies for select using (true);
create policy profiles_own on profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy streaks_own on streaks for select using (user_id = auth.uid());
create policy answers_own_read on answers for select using (user_id = auth.uid());   -- INSERT는 submit_answer(security definer)만
create policy leagues_read on leagues for select using (true);                       -- 초대 코드 착지 화면에서 이름 조회
create policy members_own on league_members for select using (user_id = auth.uid());
create policy push_own on push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 시드: 10개 구단 (색상은 근사값, 출시 전 가이드 확인)
insert into teams (id, name, short, brand) values
  ('kia','KIA 타이거즈','KIA','#EA0029'), ('samsung','삼성 라이온즈','삼성','#074CA1'),
  ('lg','LG 트윈스','LG','#C30452'),       ('doosan','두산 베어스','두산','#131230'),
  ('kt','kt wiz','kt','#D71920'),          ('ssg','SSG 랜더스','SSG','#CE0E2D'),
  ('lotte','롯데 자이언츠','롯데','#041E42'), ('hanwha','한화 이글스','한화','#FC4E00'),
  ('nc','NC 다이노스','NC','#315288'),      ('kiwoom','키움 히어로즈','키움','#570514');
