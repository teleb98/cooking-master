# Cooking Master — 프로젝트 진행 현황

> 한국 가족 식단 관리 앱 | Vite + React SPA · Vercel Serverless · Supabase PostgreSQL

---

## 서비스 정보

| 항목 | 내용 |
|------|------|
| 프로덕션 URL | https://cooking-master-tau.vercel.app |
| 배포 플랫폼 | Vercel (Serverless Functions + Static) |
| 데이터베이스 | Supabase PostgreSQL (`public.users`, `public.user_profiles`) |
| 인증 방식 | 커스텀 JWT (30일 만료) + SNS OAuth 2.0 |

---

## 기술 스택

```
Frontend  : Vite + React 18 + React Router 6
Backend   : Vercel Serverless Functions (api/)
Database  : Supabase (PostgreSQL)
Auth      : JWT (jsonwebtoken) + 소셜 OAuth 2.0
Deploy    : Vercel CLI (vercel --prod)
```

---

## 완료된 작업

### ✅ 인프라 / 배포
- Vercel 프로젝트 연결 및 프로덕션 배포 자동화
- 로컬 서버 의존성 제거 → 클라우드 전용 운영 체계 구축
- `APP_URL` 환경변수 고정으로 OAuth redirect_uri 안정화

### ✅ SNS 소셜 로그인 (4종)
- **카카오** — 완료 (OAuth 2.0 직접 연동)
- **네이버** — 완료 (OAuth 2.0 직접 연동)
- **Google** — 완료 (Supabase Auth 제거 → 직접 OAuth 2.0 연동)
- **Facebook** — 완료 (OAuth 2.0 직접 연동)

### ✅ 공통 OAuth 아키텍처
```
사용자 클릭
  → /api/auth/oauth?provider=xxx        (oauth.js — 인증 URL 생성 + nonce 쿠키)
  → [Provider 로그인]
  → /api/auth/callback?code=&state=     (callback.js — 토큰 교환 + 사용자 upsert)
  → /login#token=JWT&name=&is_new=      (프론트엔드 — loginWithToken 처리)
```

### ✅ 보안
- CSRF nonce를 base64url state에 인코딩 (redirect_uri에 쿼리파라미터 없음)
- HttpOnly 쿠키로 nonce 검증
- Supabase Service Role Key로 RLS 우회 DB 쓰기

### ✅ 법적 페이지 (Facebook 검수 대응)
- `/privacy` — 개인정보처리방침
- `/data-deletion` — 데이터 삭제 안내
- `/api/auth/facebook-deletion` — Facebook 데이터 삭제 콜백 API

### ✅ UX
- 로그인 후 환영 토스트 (`🎉 환영해요 / 👋 반가워요`)
- 미설정 공급자 "준비 중" 뱃지 표시
- 에러 배너 인라인 표시

---

## Vercel 환경변수 현황

| 변수명 | 용도 | 상태 |
|--------|------|------|
| `APP_URL` | OAuth redirect_uri 고정 | ✅ 설정됨 |
| `KAKAO_CLIENT_ID` | 카카오 로그인 | ✅ 설정됨 |
| `KAKAO_CLIENT_SECRET` | 카카오 로그인 | ✅ 설정됨 |
| `NAVER_CLIENT_ID` | 네이버 로그인 | ✅ 설정됨 |
| `NAVER_CLIENT_SECRET` | 네이버 로그인 | ✅ 설정됨 |
| `GOOGLE_CLIENT_ID` | Google 로그인 | ✅ 설정됨 |
| `GOOGLE_CLIENT_SECRET` | Google 로그인 | ✅ 설정됨 |
| `FACEBOOK_APP_ID` | Facebook 로그인 | ✅ 설정됨 |
| `FACEBOOK_APP_SECRET` | Facebook 로그인 | ✅ 설정됨 |
| `SUPABASE_URL` | DB 연결 | ✅ 설정됨 |
| `SUPABASE_SERVICE_ROLE_KEY` | DB 쓰기 (RLS 우회) | ✅ 설정됨 |
| `JWT_SECRET` | 토큰 서명 | ✅ 설정됨 |

---

## 진행 중인 작업

### 🔄 Facebook 앱 검수 / 라이브 전환
- [x] 유효한 OAuth 리디렉션 URI 등록
- [x] 개인정보처리방침 URL 등록
- [x] 데이터 삭제 콜백 URL 등록
- [x] 비즈니스 포트폴리오 생성
- [ ] 비즈니스 인증 완료 (신원 확인 진행 중)
- [ ] 앱 라이브 모드 전환

---

## 다음 단계 업무

### 1순위 — Facebook 앱 라이브 전환
- 비즈니스 인증 완료 (신분증 또는 사업자 서류 제출)
- 게시 버튼 클릭 → 라이브 모드 전환
- 일반 사용자 Facebook 로그인 테스트

### 2순위 — 핵심 기능 완성
- [ ] 식단 계획 저장/불러오기 (Supabase DB 연동)
- [ ] 장보기 목록 동기화
- [ ] 가족 그룹 초대 기능
- [ ] AI 식단 추천 (ChatSheet) 완성

### 3순위 — 서비스 안정화
- [ ] Google OAuth 앱 검수 (현재 테스트 모드)
- [ ] 에러 모니터링 (Sentry 또는 Vercel Analytics)
- [ ] 모바일 PWA 설정 (manifest.json, 아이콘)
- [ ] 커스텀 도메인 연결

---

## 배포 방법

```bash
cd /Users/chiwon/workspace/cooking-master
vercel --prod
```

---

## 주요 파일 구조

```
cooking-master/
├── api/
│   ├── _db.js                    # Supabase DB 클라이언트
│   ├── _auth.js                  # JWT 서명/검증
│   └── auth/
│       ├── oauth.js              # OAuth 시작 (모든 공급자)
│       ├── callback.js           # OAuth 콜백 처리
│       ├── providers.js          # 공급자 설정 상태 API
│       ├── facebook-deletion.js  # Facebook 데이터 삭제 콜백
│       ├── me.js                 # 현재 사용자 조회
│       └── logout.js             # 로그아웃
├── src/
│   ├── context/
│   │   ├── AuthContext.jsx       # 인증 상태 관리
│   │   └── FamilyContext.jsx     # 가족 데이터 관리
│   └── screens/
│       ├── LoginScreen.jsx       # 소셜 로그인 화면
│       ├── PrivacyScreen.jsx     # 개인정보처리방침
│       └── DataDeletionScreen.jsx # 데이터 삭제 안내
└── scripts/
    └── supabase-schema.sql       # DB 스키마
```
