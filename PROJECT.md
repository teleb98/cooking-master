# Cooking Master — 프로젝트 진행 현황

> 한국 가족 식단 관리 앱 | Vite + React SPA · Vercel Serverless · Supabase PostgreSQL  
> 마지막 업데이트: 2026-05-04

---

## 서비스 정보

| 항목 | 내용 |
|------|------|
| 프로덕션 URL | https://cooking-master-tau.vercel.app |
| GitHub | https://github.com/teleb98/cooking-master |
| 배포 플랫폼 | Vercel Hobby (Serverless Functions 11개 / 한도 12개) |
| 데이터베이스 | Supabase PostgreSQL (ref: `njyqmwiyibzyxrrmopub`) |
| 인증 방식 | 커스텀 JWT (30일 만료) + SNS OAuth 2.0 직접 연동 |

---

## 기술 스택

```
Frontend  : Vite + React 18 + React Router 6
Backend   : Vercel Serverless Functions (api/)
Database  : Supabase PostgreSQL
Auth      : JWT (jsonwebtoken) + 소셜 OAuth 2.0 (4종)
AI        : Claude Haiku (Anthropic SDK)
Deploy    : Vercel CLI → vercel --prod
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
| 레시피 시트 | DB 재료 표시 (mock 제거), **메뉴 교체** 버튼 연동 |
| 장보기 목록 | `/api/grocery` 연동, 식단에서 자동 생성 |
| 구매 체크 / 삭제 | API 동기화 |
| 통합 TC | **14/14 PASS** (자동화 검증 완료) |

### ✅ Phase 2 — AI 채팅 (코드 완료, 크레딧 필요)

| 항목 | 내용 |
|------|------|
| `api/ai/chat.js` | Claude Haiku, 2주 식단 컨텍스트 포함 |
| 응답 방식 | JSON (Vercel 스트리밍 미지원으로 비스트리밍 전환) |
| 변경 적용 | AI 응답에서 JSON 파싱 → [식단에 적용하기] 버튼 |
| 멀티턴 | 최근 8개 메시지 히스토리 유지 |
| ChatSheet | 실제 유저명, 빠른 답변 버튼, 로딩 인디케이터 |
| **미해결** | Anthropic 계정 크레딧 충전 필요 → [billing](https://console.anthropic.com/settings/billing) |

---

## Serverless Function 현황 (11/12)

```
api/
├── _auth.js              # JWT 헬퍼
├── _db.js                # Supabase 클라이언트
├── auth/
│   ├── oauth.js          # OAuth 시작
│   ├── callback.js       # OAuth 콜백
│   ├── providers.js      # 공급자 상태
│   ├── logout.js         # 로그아웃
│   └── facebook-deletion.js
├── user/
│   └── profile.js        # 유저 + 프로필 조회/수정 (auth/me 통합)
├── meals/
│   └── index.js          # 식단 조회/저장 + 자동 시드
├── recipes/
│   └── index.js          # 레시피 목록 / 단건 조회
├── grocery/
│   ├── index.js          # 장보기 목록 GET/PUT/DELETE
│   └── generate.js       # 식단 → 장보기 자동 생성
└── ai/
    └── chat.js           # Claude Haiku AI 채팅
```

---

## Vercel 환경변수 현황

| 변수명 | 용도 | 상태 |
|--------|------|------|
| `APP_URL` | OAuth redirect_uri 고정 | ✅ |
| `JWT_SECRET` | 토큰 서명 | ✅ |
| `KAKAO_CLIENT_ID/SECRET` | 카카오 로그인 | ✅ |
| `NAVER_CLIENT_ID/SECRET` | 네이버 로그인 | ✅ |
| `GOOGLE_CLIENT_ID/SECRET` | Google 로그인 | ✅ |
| `FACEBOOK_APP_ID/SECRET` | Facebook 로그인 | ✅ |
| `NEXT_PUBLIC_SUPABASE_URL` | DB URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | DB anon key | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | DB 쓰기 (RLS 우회) | ✅ |
| `ANTHROPIC_API_KEY` | Claude AI | ✅ (크레딧 충전 필요) |

---

## 진행 중 / 블로커

| 항목 | 상태 | 조치 필요 |
|------|------|-----------|
| Anthropic 크레딧 | ❌ 잔액 0 | console.anthropic.com에서 충전 |
| Facebook 앱 라이브 | 🔄 신원 인증 대기 | 인증 완료 후 게시 버튼 클릭 |
| Google OAuth 검수 | 🔄 미제출 | 현재 테스트 모드 (본인 계정만 가능) |

---

## 배포 방법

```bash
cd /Users/chiwon/workspace/cooking-master
git add -A && git commit -m "..."
git push origin main
vercel --prod
```
