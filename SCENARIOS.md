# Cooking Master — 서비스 시나리오 정의서

> 현재 구현 상태 기준으로 "무엇이 되어야 하는가"를 정의한 문서  
> 구현 우선순위에 따라 Phase 1 → 2 → 3으로 구분

---

## 현재 구현 상태 진단

| 화면 / 기능 | 상태 | 비고 |
|-------------|------|------|
| 소셜 로그인 (4종) | ✅ 완료 | Google/Kakao/Naver/Facebook |
| 온보딩 (가족 유형, 장보는 요일, 아기 정보) | ✅ 완료 | DB 저장 작동 |
| 식단 캘린더 | ⚠️ 목 데이터 | `data.js` PLAN 하드코딩 |
| 장보기 목록 | ⚠️ 목 데이터 | `data.js` GROCERY 하드코딩 |
| AI 채팅 (ChatSheet) | ⚠️ UI만 | 실제 AI 응답 없음 |
| 레시피 시트 (RecipeSheet) | ⚠️ UI만 | 레시피 DB 없음 |
| 파트너 초대 | ❌ 미구현 | 가짜 링크 표시 |
| 이유식 단계 분기 | ⚠️ UI만 | 실제 식단 분기 없음 |
| 프로필 / 설정 변경 | ⚠️ UI만 | 저장 미연동 |

---

## 전체 사용자 여정

```
앱 진입
  ├─ 첫 방문 → Welcome → Login → Onboarding → 식단 캘린더
  └─ 재방문  → 자동 로그인 → 식단 캘린더

식단 캘린더 (메인 화면)
  ├─ 셀 클릭 → 레시피 시트 (상세 보기 / 교체 요청)
  ├─ + 셀 클릭 → 메뉴 검색 / 직접 입력
  ├─ AI FAB → 채팅 시트 (자연어 교체 요청)
  └─ 장바구니 배너 → 장보기 목록

장보기 목록
  ├─ 체크 → 구매 완료 표시
  ├─ 삭제 → 연관 메뉴 경고
  └─ 공유 → 카카오톡 / 클립보드

프로필
  ├─ 가족 정보 수정
  ├─ 파트너 초대 / 연결
  └─ 로그아웃
```

---

## Phase 1 — 핵심 데이터 연동 (가장 먼저)

> 목 데이터를 걷어내고 실제 DB와 연동

### 1-1. 식단 DB 스키마 추가

```sql
-- 식단 계획 테이블
create table public.meal_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.users(id) on delete cascade,
  plan_date   date not null,          -- 해당 날짜 (YYYY-MM-DD)
  meal_type   text not null,          -- 'breakfast' | 'lunch' | 'dinner'
  menu_name   text,                   -- 메뉴명 (null = 비어있음)
  kcal        integer,
  is_baby     boolean default false,  -- 이유식 여부
  created_at  timestamptz default now(),
  unique (user_id, plan_date, meal_type)
);

-- 레시피 라이브러리 (공통)
create table public.recipes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  kcal        integer,
  ingredients jsonb,   -- [{ name, qty, unit, category }]
  tags        text[],  -- ['한식', '이유식', '고단백', ...]
  image_url   text
);

-- 장보기 목록 (식단에서 자동 생성 + 수동 추가)
create table public.grocery_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.users(id) on delete cascade,
  week_start  date not null,          -- 해당 주 월요일
  name        text not null,
  qty         text,
  category    text,
  is_bought   boolean default false,
  created_at  timestamptz default now()
);
```

### 1-2. 식단 캘린더 시나리오

**셀 상태:**
```
비어있음(+)  → 클릭 → 메뉴 검색 시트 열기
             → 검색 or 직접 입력 → 저장
메뉴 있음    → 클릭 → 레시피 시트 열기
             → 레시피 시트 내 [교체] 버튼 → 검색 시트
             → 레시피 시트 내 [AI에게 맡기기] → AI 채팅
```

**API:**
- `GET  /api/meals?week=0` → 이번 주 식단 조회
- `PUT  /api/meals`        → 특정 날짜/끼니 메뉴 저장
- `DELETE /api/meals`      → 메뉴 삭제

**초기 데이터 전략:**
- 첫 로그인 시 기본 식단 자동 생성 (레시피 라이브러리에서 랜덤 추천)
- 또는 AI에게 요청하여 1주치 생성

### 1-3. 장보기 목록 시나리오

**자동 생성 플로우:**
```
식단 저장됨
  → 해당 메뉴의 재료 목록 추출 (recipes.ingredients)
  → 같은 재료 합산 (예: 대파 2대 + 1대 = 3대)
  → grocery_items에 upsert
  → 카테고리별 정렬 (채소/육류/해산물/조미료...)
```

**체크 시나리오:**
```
재료 터치 → 체크(구매완료)
         → 취소 시 체크 해제
모두 체크 → "장보기 완료!" 토스트
```

**삭제 시나리오:**
```
삭제 버튼 → 해당 재료가 포함된 메뉴 목록 표시
          → [취소] [대체 추천] [삭제] 선택
대체 추천 → AI가 해당 재료 없는 대안 메뉴 추천
```

---

## Phase 2 — AI 연동

### 2-1. AI 채팅 시나리오

**입력 예시:**
- "수요일 저녁 바꿔줘"
- "이번 주 고기 요리 좀 줄여줘"
- "오늘 저녁 재료 이미 있는 거로 해줘"
- "아기 이유식 이번 주 추천해줘"

**처리 플로우:**
```
사용자 입력
  → Claude API (식단 context 포함 프롬프트)
  → AI 응답: 추천 메뉴 + 이유
  → [적용하기] 버튼 → meal_plans 업데이트
  → 장바구니 자동 갱신
```

**API:**
- `POST /api/ai/chat` → 메시지 + 현재 식단 전송 → AI 응답 스트리밍

**프롬프트 컨텍스트에 포함할 것:**
- 가족 유형 (solo/couple/family)
- 아기 월령 + 이유식 단계
- 현재 2주 식단
- 기피 재료 (미래 기능)

### 2-2. 레시피 시트 시나리오

**열릴 때 표시:**
- 메뉴명, 칼로리
- 재료 목록 (양 포함)
- 조리 시간 (예상)
- 이유식 여부 + 단계

**액션:**
- [AI에게 비슷한 거 추천] → 채팅 시트 with 프리셋 메시지
- [교체] → 메뉴 검색 시트
- [장바구니에 추가] → 해당 메뉴 재료를 grocery에 추가

---

## Phase 3 — 파트너 / 가족 기능

### 3-1. 파트너 초대 시나리오

**초대 플로우:**
```
온보딩 "파트너 초대" 단계
  → [초대 링크 생성] 버튼 클릭
  → 서버: 24시간 유효 토큰 생성 → invite_tokens 테이블 저장
  → 링크: https://cooking-master-tau.vercel.app/join?token=xxx
  → 카카오톡/클립보드 공유

파트너가 링크 클릭
  → 앱 진입 → 로그인 (SNS)
  → 토큰 검증 → 가족 그룹 연결
  → 두 식단 병합 (취향 합산)
```

**필요한 DB:**
```sql
-- 가족 그룹
create table public.families (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

-- 가족 구성원
create table public.family_members (
  family_id  uuid references public.families(id),
  user_id    text references public.users(id),
  role       text default 'member',  -- 'owner' | 'member'
  primary key (family_id, user_id)
);

-- 초대 토큰
create table public.invite_tokens (
  token      text primary key,
  family_id  uuid references public.families(id),
  created_by text references public.users(id),
  expires_at timestamptz,
  used_at    timestamptz
);
```

### 3-2. 이유식 자동 분기 시나리오

```
아기 월령 계산 (baby_birthday 기준)
  → 초기(0-5M) / 중기(6-8M) / 후기(9-11M) / 완료기(12M+)

식단 생성 시
  → 성인 식단 + 이유식 칸 별도 생성
  → 이유식은 해당 단계에 맞는 레시피만 추천
  → 캘린더에 파란 점으로 표시

이유식 단계 변경 시 (월령 자동 갱신)
  → 앱 진입 시 체크 → 단계 변경 감지 → 알림 토스트
  → "○○가 중기로 넘어갔어요! 식단을 업데이트할까요?"
```

---

## 구현 우선순위

```
[즉시] Phase 1-1  DB 스키마 추가 (meal_plans, recipes, grocery_items)
[즉시] Phase 1-2  식단 캘린더 API + 실제 저장/조회
[즉시] Phase 1-3  장보기 목록 자동 생성 + 체크 저장

[다음] Phase 2-1  AI 채팅 (Claude API 연동)
[다음] Phase 2-2  레시피 시트 실제 데이터 연동

[이후] Phase 3-1  파트너 초대 + 가족 그룹
[이후] Phase 3-2  이유식 자동 분기 고도화
```

---

## API 전체 목록 (완성 후 기준)

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/auth/providers` | 공급자 설정 상태 |
| GET | `/api/auth/me` | 현재 사용자 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/user/profile` | 프로필 조회 |
| PUT | `/api/user/profile` | 프로필 수정 |
| GET | `/api/meals?week=0` | 식단 조회 |
| PUT | `/api/meals` | 식단 저장 |
| DELETE | `/api/meals` | 식단 삭제 |
| GET | `/api/grocery?week=0` | 장보기 목록 |
| PUT | `/api/grocery/:id` | 체크 상태 변경 |
| POST | `/api/grocery/generate` | 식단에서 장보기 자동 생성 |
| POST | `/api/ai/chat` | AI 채팅 |
| POST | `/api/invite` | 초대 링크 생성 |
| GET | `/api/invite/:token` | 초대 토큰 검증 |
