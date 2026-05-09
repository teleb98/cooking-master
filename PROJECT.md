# Cooking Master — 프로젝트 진행 현황

> 한국 가족 식단 관리 앱 | Vite + React SPA · Vercel Serverless · Supabase PostgreSQL  
> 마지막 업데이트: 2026-05-09

---

## 서비스 정보

| 항목 | 내용 |
|------|------|
| 프로덕션 URL | https://cooking-master-tau.vercel.app |
| GitHub | https://github.com/teleb98/cooking-master |
| 배포 플랫폼 | Vercel Hobby (Serverless Functions **11개 / 한도 12개**, 슬롯 1개 여유) |
| 데이터베이스 | Supabase PostgreSQL |
| 인증 방식 | 커스텀 JWT (30일 만료) + SNS OAuth 2.0 직접 연동 |

---

## 기술 스택

```
Frontend  : Vite + React 18 + React Router 6
Backend   : Vercel Serverless Functions (api/)
Database  : Supabase PostgreSQL
Auth      : JWT (jsonwebtoken) + 소셜 OAuth 2.0 (4종)
AI        : Gemini 2.5 Flash (Google AI) — 식단 생성
            Claude Haiku (Anthropic) — AI 채팅 (크레딧 필요)
Deploy    : vercel --prod
Icon gen  : Python Pillow (scripts/restore-icons.py)
```

---

## 구현 현황

### ✅ Phase 0 — 인프라 / 인증 (완료)

| 항목 | 내용 |
|------|------|
| Vercel 배포 | 클라우드 전용, 로컬 서버 의존 없음 |
| 소셜 로그인 4종 | Google / 카카오 / 네이버 / Facebook |
| OAuth 통합 아키텍처 | `oauth.js` → `callback.js` → JWT 발급 |
| CSRF 방어 | nonce → base64url state, HttpOnly 쿠키 검증 |
| 법적 페이지 | `/privacy`, `/data-deletion`, `/api/auth/facebook-deletion` |

### ✅ Phase 1 — 핵심 데이터 DB 연동 (완료)

| 항목 | 내용 |
|------|------|
| DB 스키마 | `recipes`, `meal_plans`, `grocery_items` 테이블 |
| 레시피 시드 | 20개 기본 레시피 |
| 식단 캘린더 | `/api/meals` 실시간 연동, 첫 로그인 자동 14일 시드 |
| 메뉴 저장 | MealPicker → DB upsert → 낙관적 업데이트 |
| 레시피 시트 | DB 재료 표시, 메뉴 교체 버튼 연동 |
| 장보기 목록 | `/api/grocery` 연동, 식단에서 자동 생성 |

### ✅ Phase 2 — AI 식단 생성 + 채팅 (완료, 일부 블로커)

| 항목 | 내용 |
|------|------|
| `api/ai/generate-plan.js` | Gemini 2.5 Flash — 2주 식단 자동 생성 |
| `api/ai/chat.js` | Claude Haiku — 멀티턴 식단 수정 채팅 |
| 온보딩 식단 생성 | 취향 설문 → AI 2주 플랜 → 프리뷰 → /calendar |
| **블로커** | Anthropic 크레딧 잔액 0 → console.anthropic.com 충전 필요 |

### ✅ Phase 3 — PWA 아이콘 + 온보딩 UX (완료)

| 항목 | 내용 |
|------|------|
| 온보딩 웰컴 오버레이 | 식단 확정 후 2초 환영 메시지 → /calendar 이동 |
| 앱 아이콘 시스템 | cm icon.jpg 원본 기반, 17 사이즈 + favicon.ico + maskable |
| PWA manifest.json | standalone 모드, theme_color #C8654A |
| 아이콘 복원 스크립트 | `scripts/restore-icons.py` (Python Pillow) |

### ✅ Phase 4 — 가족 그룹 초대 + 연결 (2026-05-09 완료)

| 항목 | 내용 |
|------|------|
| `api/invite/index.js` | GET(검증) / POST(링크 생성) / PUT(수락 + 식단 마이그레이션) |
| `/join` 라우트 | JoinScreen — 초대 수락 UI (로딩→확인→완료 상태) |
| 미로그인 수락 플로우 | localStorage pendingInvite → 로그인 후 자동 수락 |
| 가족 그룹 DB | `family_groups`, `family_members` 테이블 |
| pending/active 상태 | 파트너 등록 → pending, 초대 수락 → active |
| 식단 마이그레이션 | 연결 시 양쪽 식단 자동 병합 (충돌 시 초대자 우선) |
| 공유 식단 | family_group_id 기준 GET/PUT — 연결된 가족은 동일 식단 조회/편집 |
| ProfileScreen 초대 | 멤버별 pending/active 상태 표시 + 초대 링크 생성·복사·공유 |
| CalendarScreen | 파트너 연결 시 헤더 아바타 추가, 파트너 식단에 회색 점 표시 |

### ✅ 보안 — Supabase RLS 강화 (2026-05-09 완료)

| 항목 | 내용 |
|------|------|
| 위험 정책 제거 | `allow_all_users`, `allow_all_user_profiles` DROP |
| 전체 테이블 RLS 활성화 | 8개 테이블 ENABLE ROW LEVEL SECURITY |
| 결과 | anon key 직접 접근 완전 차단, Service Role Key(백엔드)는 우회 유지 |

---

## Serverless Function 현황 (11/12)

```
api/
├── _auth.js                    # JWT 헬퍼 (함수 아님)
├── _db.js                      # Supabase 클라이언트 (함수 아님)
├── auth/
│   ├── oauth.js                # OAuth 시작                  [1]
│   ├── callback.js             # OAuth 콜백                  [2]
│   ├── providers.js            # 공급자 상태                  [3]
│   ├── logout.js               # 로그아웃                    [4]
│   └── facebook-deletion.js    # FB 삭제 콜백                [5]
├── user/
│   └── profile.js              # 유저+프로필 조회/수정/탈퇴   [6]
├── meals/
│   └── index.js                # 식단 조회/저장 (공유 포함)   [7]
├── recipes/
│   └── index.js                # 레시피 목록/단건             [8]
├── grocery/
│   └── index.js                # 장보기 CRUD + 자동 생성     [9]
├── ai/
│   ├── chat.js                 # Claude Haiku AI 채팅        [10]
│   └── generate-plan.js        # Gemini 2.5 식단 생성        [11]
└── invite/
    └── index.js                # 초대 생성/검증/수락          [12] ← 슬롯 1개 여유
```

> 슬롯 1개 여유 (grocery/generate.js를 index.js POST로 병합해 확보)

---

## DB 마이그레이션 현황

| 파일 | 내용 | 상태 |
|------|------|------|
| `scripts/supabase-schema-v4.sql` | invite_tokens + food_likes/allergies + recipes 상세 컬럼 | ✅ 실행 완료 |
| `scripts/supabase-schema-v5.sql` | family_groups + family_members + family_group_id FK 3개 | ✅ 실행 완료 |
| Security Fix SQL | RLS 활성화 + 위험 정책 DROP | ✅ 실행 완료 |

---

## 진행 중 / 블로커

| 항목 | 상태 | 조치 |
|------|------|------|
| Anthropic 크레딧 | ❌ 잔액 0 | console.anthropic.com 충전 필요 |
| Facebook 앱 라이브 | 🔄 신원 인증 대기 | 인증 완료 후 게시 |
| Google OAuth 검수 | 🔄 미제출 | 현재 테스트 모드 (본인 계정만) |
| 잔재 테이블 정리 | ⚠️ 미완료 | grocery_lists / profiles / weekly_plans DROP 검토 |

---

## 다음 단계 할일 (우선순위 순)

### 🔴 즉시 (블로킹)
- [ ] **Anthropic 크레딧 충전** — AI 채팅 기능 복구 (console.anthropic.com/settings/billing)
- [ ] **잔재 테이블 확인 후 DROP** — grocery_lists / profiles / weekly_plans (Supabase Linter INFO 해소)

### 🟠 단기 기능 (이번 주)
- [ ] **메뉴 삭제 기능** — CalendarScreen 셀에서 메뉴 제거 (PUT menu_name=null)
- [ ] **AI 채팅 UX 개선** — 식단 적용 후 캘린더 자동 새로고침, 확인 토스트
- [ ] **가족 공유 식단 UI 개선** — 파트너가 동시 편집 중 표시, 실시간 반영

### 🟡 배포 확장 (다음 주)
- [ ] **Google OAuth 검수 제출** — 프로덕션 오픈 필수, 스크린샷 + 영상 준비
- [ ] **Facebook 앱 게시** — 신원 인증 완료 후 즉시
- [ ] **OG Image** — 소셜 공유 미리보기 1200×630 (scripts/restore-icons.py 확장)
- [ ] **PWA Service Worker** — 오프라인 캐싱, 홈 화면 추가 배너

### 🟢 중기 (2~3주)
- [ ] **레시피 상세 UI** — 조리 단계(steps), 영양 정보(nutrition) 카드
- [ ] **Push Notification** — 장보는 요일 쇼핑 알림 (Web Push API)
- [ ] **Android TWA 패키징** — Play Store 등록
- [ ] **iOS PWA 래퍼** — App Store 빌드 (PWABuilder 또는 Capacitor)
- [ ] **캘린더 월별 뷰** — 현재 2주 고정 → 월 단위 탐색
- [ ] **레시피 커스텀** — 유저 직접 레시피 추가/수정
- [ ] **다크 모드** — CSS 토큰 시스템 기반 전환

---

## 배포 방법

```bash
cd /Users/chiwon/workspace/cooking-master
npm run build            # 빌드 확인
git add -A && git commit -m "..."
git push origin main
npx vercel --prod
```

---

## Vercel 환경변수 현황

| 변수명 | 용도 | 상태 |
|--------|------|------|
| `APP_URL` | OAuth redirect_uri | ✅ |
| `JWT_SECRET` | 토큰 서명 | ✅ |
| `KAKAO_CLIENT_ID/SECRET` | 카카오 로그인 | ✅ |
| `NAVER_CLIENT_ID/SECRET` | 네이버 로그인 | ✅ |
| `GOOGLE_CLIENT_ID/SECRET` | Google 로그인 | ✅ |
| `FACEBOOK_APP_ID/SECRET` | Facebook 로그인 | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | DB URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | DB anon key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | DB 쓰기 (RLS 우회) | ✅ |
| `GEMINI_API_KEY` | Gemini AI 식단 생성 | ✅ |
| `ANTHROPIC_API_KEY` | Claude AI 채팅 | ✅ (크레딧 0) |
