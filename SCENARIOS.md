# Cooking Master — 서비스 시나리오 & 다음 단계

> 마지막 업데이트: 2026-05-03  
> Phase 1 완료 기준으로 남은 작업을 정의

---

## 구현 현황 요약

| 화면 / 기능 | 상태 | 비고 |
|-------------|------|------|
| 소셜 로그인 (4종) | ✅ 완료 | Google/Kakao/Naver/Facebook |
| 온보딩 | ✅ 완료 | 가족 유형·장보는 요일·아기 정보 DB 저장 |
| 식단 캘린더 | ✅ DB 연동 | API 조회·저장, 첫 로그인 자동 시드 |
| 장보기 목록 | ✅ DB 연동 | 식단에서 자동 생성, 체크·삭제 저장 |
| AI 채팅 (ChatSheet) | ⚠️ UI만 | Claude API 미연동 |
| 레시피 시트 (RecipeSheet) | ⚠️ UI만 | 재료·조리법 표시 미연동 |
| 파트너 초대 | ❌ 미구현 | 링크 생성·수락 없음 |
| 이유식 단계 자동 분기 | ⚠️ 부분 | 태그 표시만, 월령 기반 분기 없음 |
| 프로필 수정 | ⚠️ 부분 | 조회됨, 저장 일부 미연동 |

---

## Phase 2 — AI 채팅 연동

### 시나리오: 자연어로 식단 교체

```
사용자: "수요일 저녁 닭고기로 바꿔줘"
  → /api/ai/chat  (현재 식단 context 포함)
  → Claude API 스트리밍 응답
  → AI: "수요일 저녁을 '닭가슴살 샐러드'로 바꾸는 건 어때요? (380kcal)"
  → [적용하기] 버튼 → PUT /api/meals
  → 캘린더 실시간 갱신
```

**지원할 요청 유형:**
- 특정 날/끼니 교체: "화요일 점심 바꿔줘"
- 기간 조정: "이번 주 고기 요리 좀 줄여줘"
- 재료 기반: "집에 두부 있어, 두부 요리로 해줘"
- 이유식: "아기 이번 주 중기 이유식 추천해줘"
- 영양 기반: "단백질 높은 걸로 바꿔줘"

**구현 작업:**
- [ ] `api/ai/chat.js` — Claude API 연동 (스트리밍)
- [ ] Vercel 환경변수: `ANTHROPIC_API_KEY` 추가
- [ ] ChatSheet.jsx — 스트리밍 응답 렌더링
- [ ] 응답에서 메뉴명 파싱 → [적용하기] 버튼 연결
- [ ] 프롬프트 컨텍스트: 가족 유형, 아기 월령, 현재 2주 식단, 요청

**주의:**
- Vercel Hobby 함수 한도 11/12 → `ai/chat.js` 추가 시 12/12 (한도 꽉 참)
- 이후 함수 추가 필요 시 기존 함수 병합 필요

---

## Phase 2 — 레시피 시트 실제 데이터 연동

### 시나리오: 메뉴 탭 → 레시피 상세

```
캘린더 셀(메뉴 있음) 클릭
  → RecipeSheet 열림
  → GET /api/recipes/:name (또는 이름으로 조회)
  → 표시: 메뉴명, 칼로리, 재료 목록, 이유식 여부·메모
  → [교체] → MealPicker 시트
  → [AI에게 비슷한 거 추천] → ChatSheet (프리셋 메시지)
  → [장바구니에 추가] → POST /api/grocery/add (개별 추가)
```

**구현 작업:**
- [ ] `api/recipes/index.js`에 단건 조회 추가 (GET `/api/recipes?name=xxx`)
- [ ] RecipeSheet.jsx — DB 재료 목록 렌더링
- [ ] 이유식 메모(baby_note) 표시
- [ ] [AI에게 추천] 버튼 → ChatSheet 프리셋 메시지 전달

---

## Phase 2 — 프로필 수정 완전 연동

### 시나리오: 가족 정보 변경

```
ProfileScreen → 장보는 요일 변경
  → PUT /api/user/profile { shopping_day: 6 }
  → FamilyContext 즉시 반영
  → 장보기 화면 D-X 자동 업데이트

ProfileScreen → 아기 정보 수정
  → 이름·생년월일 변경
  → 월령 자동 재계산 → 이유식 단계 업데이트
```

**구현 작업:**
- [ ] ProfileScreen.jsx — 저장 버튼 API 연결 (현재 UI만)
- [ ] `api/user/profile.js` PUT — 모든 필드 업데이트 확인
- [ ] FamilyContext — 프로필 변경 시 context 재로드

---

## Phase 3 — 파트너 초대 / 가족 그룹

### 시나리오: 파트너 연결

```
ProfileScreen → [파트너 초대] 버튼
  → POST /api/invite → 24시간 유효 토큰 생성
  → 공유 링크: https://cooking-master-tau.vercel.app/join?token=xxx
  → 카카오톡 공유 or 클립보드 복사

파트너가 링크 접속
  → /join?token=xxx → 소셜 로그인
  → GET /api/invite/:token → 토큰 검증
  → 가족 그룹 연결 → 식단 공유 시작
```

**필요한 DB 테이블:**
```sql
create table public.families (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now()
);

create table public.family_members (
  family_id uuid references public.families(id),
  user_id   text references public.users(id),
  role      text default 'member',  -- 'owner' | 'member'
  primary key (family_id, user_id)
);

create table public.invite_tokens (
  token      text primary key,
  family_id  uuid references public.families(id),
  created_by text references public.users(id),
  expires_at timestamptz,
  used_at    timestamptz
);
```

**구현 작업:**
- [ ] DB 테이블 생성 (위 SQL 실행)
- [ ] `api/invite/index.js` — 초대 토큰 생성 (POST)
- [ ] `api/invite/[token].js` — 토큰 수락 (GET/POST)
- [ ] `/join` 라우트 + JoinScreen.jsx — 초대 수락 화면
- [ ] FamilyContext — 가족 그룹 식단 merge 로직

**⚠️ 함수 한도 주의:** 현재 11/12. Phase 3 추가 시 한도 초과 → Pro 플랜 업그레이드 또는 함수 병합 필요

---

## Phase 3 — 이유식 단계 자동 분기

### 시나리오: 월령 기반 자동 전환

```
앱 진입 시 월령 체크
  → baby_birthday 기준 현재 월령 계산
  → 이전 방문 대비 단계 변경 감지
    초기 (0-5개월) / 중기 (6-8개월) / 후기 (9-11개월) / 완료기 (12개월+)
  → 단계 변경 시 토스트: "○○가 중기로 넘어갔어요! 식단을 업데이트할까요?"
  → [업데이트] → AI에게 해당 단계 이유식 1주치 요청

식단 생성 시
  → 성인 식단 + 이유식 칸 별도 분리
  → 이유식 레시피만 필터링 (baby: true, 해당 단계 태그)
  → 캘린더 셀에 이유식 배지 표시
```

**구현 작업:**
- [ ] FamilyContext — 월령 계산 + 단계 변화 감지 로직
- [ ] 레시피 시드 데이터 — 이유식 단계별 태그 추가 (초기/중기/후기)
- [ ] AI 프롬프트 — 이유식 단계 컨텍스트 포함
- [ ] 캘린더 UI — 이유식 셀 시각적 구분

---

## 기타 — 서비스 안정화

| 항목 | 내용 | 우선순위 |
|------|------|----------|
| Facebook 앱 라이브 전환 | 비즈니스 신원 인증 완료 후 게시 | 🔴 높음 |
| Google OAuth 앱 검수 | 구글 콘솔에서 검수 신청 (현재 테스트 모드) | 🟡 중간 |
| 모바일 PWA | `manifest.json`, 아이콘, 홈 화면 추가 | 🟡 중간 |
| 에러 모니터링 | Vercel Analytics 또는 Sentry 연동 | 🟢 낮음 |
| 커스텀 도메인 | Vercel 도메인 연결 | 🟢 낮음 |

---

## 전체 API 목록 (현재 완성 기준)

| Method | Path | 설명 | 상태 |
|--------|------|------|------|
| GET | `/api/auth/providers` | 공급자 설정 상태 | ✅ |
| GET | `/api/auth/me` | 현재 사용자 | ✅ |
| POST | `/api/auth/logout` | 로그아웃 | ✅ |
| GET→POST | `/api/auth/oauth` → `/api/auth/callback` | OAuth 플로우 | ✅ |
| POST | `/api/auth/facebook-deletion` | Facebook 삭제 콜백 | ✅ |
| GET/PUT | `/api/user/profile` | 프로필 조회/수정 | ✅ |
| GET/PUT | `/api/meals` | 식단 조회/저장 | ✅ |
| GET | `/api/recipes` | 레시피 목록 | ✅ |
| GET/PUT/DELETE | `/api/grocery` | 장보기 목록 | ✅ |
| POST | `/api/grocery/generate` | 식단→장보기 자동 생성 | ✅ |
| POST | `/api/ai/chat` | AI 채팅 | ❌ 미구현 |
| POST | `/api/invite` | 초대 링크 생성 | ❌ 미구현 |
| GET | `/api/invite/:token` | 초대 수락 | ❌ 미구현 |

---

## 권장 다음 작업 순서

```
1. 앱 테스트 — 로그인 → 캘린더 → 장보기 전체 흐름 확인
2. Phase 2-1 AI 채팅 — ANTHROPIC_API_KEY 추가 → api/ai/chat.js 구현
3. Phase 2-2 레시피 시트 — RecipeSheet 실제 재료 표시
4. Facebook 라이브 — 신원 인증 완료 후 앱 게시
5. Phase 3 파트너 초대 — 가족 그룹 DB + 초대 플로우
```
