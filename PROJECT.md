# Cooking Master — 프로젝트 진행 현황

> 한국 가족 식단 관리 앱 | Vite + React SPA · Vercel Serverless · Supabase PostgreSQL  
> 마지막 업데이트: 2026-05-08

---

## 서비스 정보

| 항목 | 내용 |
|------|------|
| 프로덕션 URL | https://cooking-master-tau.vercel.app |
| GitHub | https://github.com/teleb98/cooking-master |
| 배포 플랫폼 | Vercel Hobby (Serverless Functions **12개 / 한도 12개**, 꽉 참) |
| 데이터베이스 | Supabase PostgreSQL (ref: `njyqmwiyibzyxrrmopub`) |
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
Icon gen  : Python Pillow (scripts/generate-icons.py)
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
| Facebook 앱 검수 | 비즈니스 포트폴리오 생성 완료, 신원 인증 진행 중 |

### ✅ Phase 1 — 핵심 데이터 DB 연동 (완료)

| 항목 | 내용 |
|------|------|
| DB 스키마 v2 | `recipes`, `meal_plans`, `grocery_items` 테이블 |
| 레시피 시드 | 20개 기본 레시피 |
| 식단 캘린더 | `/api/meals` 실시간 연동, 첫 로그인 자동 14일 시드 |
| 메뉴 저장 | MealPicker → DB upsert → 낙관적 업데이트 |
| 레시피 시트 | DB 재료 표시 (mock 제거), 메뉴 교체 버튼 연동 |
| 장보기 목록 | `/api/grocery` 연동, 식단에서 자동 생성 |
| 구매 체크 / 삭제 | API 동기화 |

### ✅ Phase 2 — AI 식단 생성 + 채팅 (완료, 일부 블로커)

| 항목 | 내용 |
|------|------|
| `api/ai/generate-plan.js` | Gemini 2.5 Flash — 2주 식단 자동 생성 |
| `api/ai/chat.js` | Claude Haiku — 멀티턴 식단 수정 채팅 |
| 온보딩 식단 생성 | 취향 설문 → AI 2주 플랜 → MiniCalendar 프리뷰 |
| 변경 적용 | AI 응답 JSON 파싱 → [식단에 적용하기] 버튼 |
| **블로커** | Anthropic 크레딧 잔액 0 → console.anthropic.com 충전 필요 |

### ✅ Phase 3 — 온보딩 UX + PWA 아이콘 (2026-05-08 완료)

| 항목 | 내용 |
|------|------|
| 온보딩 웰컴 오버레이 | 식단 확정 후 2초 환영 메시지 → /calendar 이동 |
| 앱 아이콘 시스템 | 17 사이즈 PNG + favicon.ico + apple-touch-icon |
| Android maskable | safe-zone 적용 maskable 192/512px |
| PWA manifest.json | standalone 모드, theme_color #C8654A |
| index.html 메타태그 | apple-touch-icon, manifest, favicon, description |
| 아이콘 생성 스크립트 | `scripts/generate-icons.py` (Python Pillow, 재실행 가능) |

---

## Serverless Function 현황 (12/12 — 한도 꽉 참)

```
api/
├── _auth.js              # JWT 헬퍼 (헬퍼, 함수 아님)
├── _db.js                # Supabase 클라이언트 (헬퍼, 함수 아님)
├── auth/
│   ├── oauth.js          # OAuth 시작               [1]
│   ├── callback.js       # OAuth 콜백               [2]
│   ├── providers.js      # 공급자 상태               [3]
│   ├── logout.js         # 로그아웃                  [4]
│   └── facebook-deletion.js                         [5]
├── user/
│   └── profile.js        # 유저 + 프로필 조회/수정   [6]
├── meals/
│   └── index.js          # 식단 조회/저장 + 자동 시드 [7]
├── recipes/
│   └── index.js          # 레시피 목록 / 단건 조회   [8]
├── grocery/
│   ├── index.js          # 장보기 목록 CRUD          [9]
│   └── generate.js       # 식단 → 장보기 자동 생성  [10]
└── ai/
    ├── chat.js           # Claude Haiku AI 채팅      [11]
    └── generate-plan.js  # Gemini 2.5 식단 생성      [12]
```

> ⚠️ 새 API 파일 추가 불가. 기존 파일에 메서드 분기로 기능 확장할 것.

---

## DB 마이그레이션 현황

### ✅ 완료
```sql
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS baby_name TEXT;
```

### ⏳ 미실행 (Supabase SQL 에디터에서 실행 필요)
```sql
-- user_profiles 취향 컬럼 (온보딩 preferences 스텝에서 사용)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS food_likes JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS allergies  JSONB DEFAULT '[]';

-- recipes 상세 컬럼 (레시피 상세 화면에서 사용)
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS steps     JSONB    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS prep_time INTEGER,
  ADD COLUMN IF NOT EXISTS cook_time INTEGER,
  ADD COLUMN IF NOT EXISTS serving   INTEGER,
  ADD COLUMN IF NOT EXISTS tips      TEXT,
  ADD COLUMN IF NOT EXISTS nutrition JSONB;
```

---

## 진행 중 / 블로커

| 항목 | 상태 | 조치 필요 |
|------|------|-----------|
| Anthropic 크레딧 | ❌ 잔액 0 | console.anthropic.com 충전 |
| Supabase 마이그레이션 | ❌ 미실행 | SQL 에디터에서 위 쿼리 실행 |
| Facebook 앱 라이브 | 🔄 신원 인증 대기 | 인증 완료 후 게시 버튼 클릭 |
| Google OAuth 검수 | 🔄 미제출 | 현재 테스트 모드 (본인 계정만) |

---

## 내일부터 할일 (우선순위 순)

### 🔴 즉시 (블로킹)
- [ ] **Supabase DB 마이그레이션 실행** — food_likes, allergies, recipes 상세 컬럼
- [ ] **Anthropic 크레딧 충전** — AI 채팅 기능 복구

### 🟠 단기 (이번 주)
- [ ] **OG Image** — 소셜 공유 미리보기 1200×630 (Python Pillow, `scripts/generate-icons.py` 확장)
- [ ] **PWA Service Worker** — 오프라인 캐싱, `beforeinstallprompt` 홈 화면 추가 배너
- [ ] **Google OAuth 검수 제출** — 프로덕션 오픈 필수
- [ ] **Facebook 앱 게시** — 신원 인증 완료 후 즉시

### 🟡 중기 (다음 주)
- [ ] **Android TWA 패키징** — Play Store 등록용 Trusted Web Activity 빌드
- [ ] **iOS PWA 래퍼** — PWABuilder 또는 Capacitor로 App Store 빌드
- [ ] **레시피 상세 UI** — 조리 단계(steps), 영양 정보(nutrition) 카드 표시
- [ ] **Push Notification** — 장보는 요일 쇼핑 알림 (Web Push API)
- [ ] **캘린더 월별 뷰** — 현재 2주 고정 → 월 단위 탐색 추가

### 🟢 장기
- [ ] **다크 모드** — CSS 토큰 + 아이콘 다크 변형
- [ ] **가족 공유** — 파트너와 실시간 식단 동기화 (Supabase Realtime)
- [ ] **레시피 커스텀** — 유저 직접 레시피 추가/수정

---

## 배포 방법

```bash
cd /Users/chiwon/workspace/cooking-master

# 아이콘 재생성 (디자인 변경 시)
python3 scripts/generate-icons.py

# 빌드 확인
npm run build

# 커밋 + GitHub 푸시 + Vercel 배포
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
