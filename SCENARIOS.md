# Cooking Master — 시나리오 & 다음 단계

> 마지막 업데이트: 2026-05-09  
> Phase 1 + Phase 2 + Phase 3(파트너 초대) 완료 기준

---

## 구현 현황 요약

| 화면 / 기능 | 상태 | 비고 |
|-------------|------|------|
| 소셜 로그인 (4종) | ✅ 완료 | Google / 카카오 / 네이버 / Facebook |
| 온보딩 | ✅ 완료 | 가족 유형·장보는 요일·아기 정보 DB 저장 + 웰컴 오버레이 |
| 식단 캘린더 | ✅ DB 연동 | 조회·저장·자동 시드 |
| 레시피 시트 | ✅ DB 연동 | 재료 표시, 메뉴 교체 버튼 |
| 장보기 목록 | ✅ DB 연동 | 자동 생성(POST)·체크·삭제, generate.js 병합 완료 |
| AI 채팅 | ✅ 코드 완료 | 크레딧 충전 후 활성화 |
| 파트너 초대 | ✅ 완료 | invite_tokens 테이블, /join 라우트, ProfileScreen 통합 |
| 가족 그룹 연결 | ✅ MVP | partner_name 양방향 업데이트 (공유 식단은 Phase 4) |
| 이유식 단계 자동 분기 | ⚠️ 부분 | 태그 표시만, 월령 자동 전환 없음 |
| 프로필 수정 저장 | ✅ 완료 | FamilyEditSheet → PUT /api/user/profile |

---

## 시나리오 A — 가입 추천 (신규 사용자 온보딩)

### A-1. 일반 가입 플로우
```
앱 첫 실행
  → WelcomeScreen ("시작하기")
  → LoginScreen (소셜 로그인 4종 선택)
  → OAuth 성공 → JWT 발급 → sessionStorage에 cm_welcome 저장
  → / 리디렉트 → onboarded=false → /onboarding
  → 온보딩 완료 (가족 유형·취향·아기 정보 입력)
  → 2주 AI 식단 자동 생성
  → 웰컴 오버레이 (2초) → /calendar
  → "🎉 환영해요, {name}님!" 토스트 (로그인 성공)
```

### A-2. 파트너 초대 링크로 가입
```
기존 사용자 A
  → ProfileScreen → [파트너 초대] 섹션
  → [초대 링크 만들기] 클릭
  → POST /api/invite → token 생성 (7일 유효, 1회 사용)
  → URL: https://cooking-master-tau.vercel.app/join?token=xxx
  → [링크 복사] 또는 [공유하기] (카카오·문자 등)

신규 사용자 B가 링크 수신
  → 브라우저에서 /join?token=xxx 접속
  → GET /api/invite?token=xxx → 토큰 유효성 확인 + A의 이름 반환
  → JoinScreen: "{A}님이 초대했어요" 카드 표시
  → [로그인하고 함께하기] 클릭
  → token을 localStorage(cookingMaster_pendingInvite)에 저장
  → /login 리디렉트 → 소셜 로그인 완료
  → /join 복귀 → useEffect 감지 → 자동으로 PUT /api/invite
  → 두 사용자 partner_name 양방향 업데이트
  → JoinScreen "연결됐어요! 🎉" → [식단 캘린더 보기] → /calendar
```

### A-3. 이미 로그인된 사용자가 초대 링크 수락
```
기존 사용자 B (이미 로그인 상태)
  → /join?token=xxx 접속
  → GET /api/invite → 토큰 확인 + A의 이름 표시
  → [{A}님과 함께하기] 클릭
  → PUT /api/invite { token } (즉시 수락)
  → 두 사용자 partner_name 업데이트
  → ProfileScreen에서 파트너 연결됨 뱃지 확인 가능
```

---

## 시나리오 B — 가족 그룹 식단 관리

### B-1. 파트너 연결 후 식단 공유 (현재 MVP)
```
A와 B가 연결된 상태
  → 각자 캘린더에서 식단 확인 (현재: 각자의 식단 독립)
  → 장보기 목록: 각자 독립 (MVP)
  → ProfileScreen → FAMILY 섹션에 파트너 이름 표시
  → ProfileScreen → INVITE 섹션에 "B님과 연결됨" 뱃지 표시
```

> **Phase 4 구현 예정:** 동일 family_group_id로 meals/grocery 공유

### B-2. 커플 식단 AI 생성
```
[AI 채팅] → "이번 주 식단 둘이 먹기 좋게 바꿔줘"
  → AI: partner_name + food_likes + allergies 양쪽 반영
  → 제안된 식단 [식단에 적용하기] → 캘린더 업데이트
```

### B-3. 아기 이유식 자동 분기 (현재 부분 구현)
```
가족 유형 = "가족" + 아기 생년월일 입력
  → family.baby_months 자동 계산
  → 캘린더 메뉴에 "이유식" 태그 자동 추가
  → 장보기 목록 아이템에 "이유식" 배지 표시
  → AI 채팅: "아기 이번 주 이유식 추천" → baby=true 레시피 필터링
```

---

## 시나리오 C — 오류 처리

### C-1. 만료된 초대 링크
```
/join?token=xxx (7일 경과 또는 이미 사용된 토큰)
  → GET /api/invite → 410 error: "already_used" | "expired"
  → JoinScreen 에러 상태: "이미 사용된 초대 링크입니다." / "만료된 초대 링크입니다."
  → [홈으로 이동] 버튼
```

### C-2. 본인 초대 링크 수락 시도
```
A가 자신의 초대 링크를 /join에서 수락 시도
  → PUT /api/invite → 400 error: "self_invite"
  → "본인의 초대 링크는 수락할 수 없습니다." 에러 표시
```

### C-3. 토큰 없는 /join 접속
```
/join (token 쿼리 파라미터 없음)
  → JoinScreen → "잘못된 초대 링크입니다." 에러 즉시 표시
```

---

## 다음 우선 작업 목록

### 🔴 1순위 — Anthropic 크레딧 충전 (즉시)
- [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing) 접속
- $5~$10 크레딧 충전
- 충전 직후 AI 채팅 자동 활성화 (재배포 불필요)

### 🔴 2순위 — Supabase DB 마이그레이션 실행
```sql
-- scripts/supabase-schema-v4.sql 실행 필요
-- invite_tokens 테이블 생성 + user_profiles에 food_likes/allergies 컬럼 추가
```

### 🟠 3순위 — 메뉴 삭제 기능
```
CalendarScreen 메뉴 셀 → 길게 누르거나 RecipeSheet에서 [삭제]
  → DELETE /api/meals 또는 PUT { menu_name: null }
  → 캘린더 낙관적 업데이트 (빈 셀로)
```

### 🟠 4순위 — AI 채팅 UX 개선
- 채팅 후 캘린더 자동 새로고침 (현재 수동)
- [식단에 적용하기] 후 확인 토스트
- AI 응답 내 파트너·아기 정보 반영 안내

### 🟡 5순위 — Phase 4: 가족 그룹 공유 식단
- `family_groups` 테이블 + `family_group_id` FK 연결
- meals/grocery API에 family_group 기반 조회 추가
- 파트너 식단 변경 시 실시간 반영 (Supabase Realtime or polling)

---

## 전체 API 목록 (2026-05-09 기준)

| Method | Path | 설명 | 상태 |
|--------|------|------|------|
| GET/POST | `/api/auth/oauth` | OAuth 시작/콜백 | ✅ |
| POST | `/api/auth/facebook-deletion` | FB 삭제 콜백 | ✅ |
| GET | `/api/auth/providers` | 공급자 상태 | ✅ |
| POST | `/api/auth/logout` | 로그아웃 | ✅ |
| GET/PUT/DELETE | `/api/user/profile` | 유저+프로필 조회/수정/탈퇴 | ✅ |
| GET/PUT | `/api/meals` | 식단 조회/저장 | ✅ |
| GET | `/api/recipes` | 레시피 목록/단건 | ✅ |
| GET/PUT/DELETE/POST | `/api/grocery` | 장보기 목록 + 자동 생성 | ✅ |
| POST | `/api/ai/chat` | AI 채팅 | ✅ (크레딧 필요) |
| GET/POST/PUT | `/api/invite` | 초대 생성/확인/수락 | ✅ |

**함수 슬롯: 12/12 (Vercel Hobby 한도)**

---

## 함수 슬롯 내역

| # | 경로 | 비고 |
|---|------|------|
| 1 | `api/auth/oauth.js` | |
| 2 | `api/auth/callback.js` | |
| 3 | `api/auth/facebook-deletion.js` | |
| 4 | `api/auth/providers.js` | |
| 5 | `api/auth/logout.js` | |
| 6 | `api/user/profile.js` | |
| 7 | `api/meals/index.js` | |
| 8 | `api/recipes/index.js` | |
| 9 | `api/grocery/index.js` | GET+PUT+DELETE+POST(generate 통합) |
| 10 | `api/ai/chat.js` | |
| 11 | `api/invite/index.js` | GET+POST+PUT |
| 12 | (예비) | 향후 Phase 4 활용 |
