# Cooking Master — 프로젝트 진행 현황

> 한국 가족 식단 관리 앱 | Vite + React SPA · Vercel Serverless · Supabase PostgreSQL  
> 마지막 업데이트: 2026-05-03

---

## 서비스 정보

| 항목 | 내용 |
|------|------|
| 프로덕션 URL | https://cooking-master-tau.vercel.app |
| GitHub | https://github.com/teleb98/cooking-master |
| 배포 플랫폼 | Vercel Hobby (Serverless Functions 11개 / 한도 12개) |
| 데이터베이스 | Supabase PostgreSQL (프로젝트 ref: `njyqmwiyibzyxrrmopub`) |
| 인증 방식 | 커스텀 JWT (30일 만료) + SNS OAuth 2.0 직접 연동 |

---

## 기술 스택

```
Frontend  : Vite + React 18 + React Router 6
Backend   : Vercel Serverless Functions (api/)
Database  : Supabase PostgreSQL
Auth      : JWT (jsonwebtoken) + 소셜 OAuth 2.0 (4종)
Deploy    : Vercel CLI → vercel --prod
```

---

## 완료된 작업

### ✅ Phase 0 — 인프라 / 인증

| 항목 | 내용 |
|------|------|
| Vercel 배포 | 클라우드 전용, 로컬 서버 의존 없음 |
| OAuth 통합 아키텍처 | 4개 공급자 동일 플로우 (`oauth.js` → `callback.js`) |
| Google 로그인 | Supabase Auth 제거 → 직접 OAuth 2.0 연동 |
| 카카오 로그인 | OAuth 2.0 직접 연동 ✅ |
| 네이버 로그인 | OAuth 2.0 직접 연동 ✅ |
| Facebook 로그인 | OAuth 2.0 직접 연동 ✅ (scope: public_profile만) |
| CSRF 방어 | nonce → base64url state 인코딩, HttpOnly 쿠키 검증 |
| 법적 페이지 | `/privacy`, `/data-deletion`, `/api/auth/facebook-deletion` |
| Facebook 앱 검수 | 비즈니스 포트폴리오 생성 완료, 신원 인증 진행 중 |

### ✅ Phase 1 — 핵심 데이터 DB 연동 (2026-05-03 완료)

| 항목 | 내용 |
|------|------|
| DB 스키마 v2 | `recipes`, `meal_plans`, `grocery_items` 테이블 생성 |
| 레시피 시드 | 20개 기본 레시피 (한식/양식/이유식 포함) |
| 식단 캘린더 | mock 데이터 제거 → `/api/meals` 실시간 연동 |
| 자동 시드 | 첫 로그인 시 14일 기본 식단 자동 생성 |
| 메뉴 저장 | 캘린더 셀 클릭 → MealPicker → DB upsert |
| 장보기 목록 | mock 데이터 제거 → `/api/grocery` 실시간 연동 |
| 장보기 자동 생성 | `/api/grocery/generate` — 이번 주 식단에서 재료 추출 |
| 구매 체크 | 낙관적 업데이트 + API 동기화 |
| 재료 삭제 | DeleteWarning 확인 → API DELETE |
| Vercel 함수 수 | 15개 → 11개 (미사용 4개 제거, 한도 12개 준수) |

---

## Serverless Function 현황 (11/12)

```
api/
├── _auth.js              # JWT 헬퍼 (함수 아님)
├── _db.js                # Supabase 클라이언트 (함수 아님)
├── auth/
│   ├── oauth.js          # OAuth 시작
│   ├── callback.js       # OAuth 콜백
│   ├── providers.js      # 공급자 상태 조회
│   ├── me.js             # 현재 사용자
│   ├── logout.js         # 로그아웃
│   └── facebook-deletion.js  # Facebook 삭제 콜백
├── user/
│   └── profile.js        # 프로필 조회/수정
├── meals/
│   └── index.js          # 식단 조회/저장 + 자동 시드
├── recipes/
│   └── index.js          # 레시피 목록 조회
└── grocery/
    ├── index.js          # 장보기 목록 조회/체크/삭제
    └── generate.js       # 식단에서 장보기 자동 생성
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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | DB 읽기 | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | DB 쓰기 (RLS 우회) | ✅ |

---

## 진행 중

| 항목 | 상태 |
|------|------|
| Facebook 앱 라이브 모드 | 비즈니스 신원 인증 대기 중 |
| Google OAuth 앱 검수 | 미제출 (현재 테스트 모드 — 본인 계정만 로그인 가능) |

---

## 배포 방법

```bash
cd /Users/chiwon/workspace/cooking-master
git add -A && git commit -m "..."
git push origin main     # Vercel 자동 배포 트리거
# 또는 직접
vercel --prod
```
