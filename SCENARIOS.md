# Cooking Master — 시나리오 & 다음 단계

> 마지막 업데이트: 2026-05-04  
> Phase 1 + Phase 2(코드) 완료 기준

---

## 구현 현황 요약

| 화면 / 기능 | 상태 | 비고 |
|-------------|------|------|
| 소셜 로그인 (4종) | ✅ 완료 | Google / 카카오 / 네이버 / Facebook |
| 온보딩 | ✅ 완료 | 가족 유형·장보는 요일·아기 정보 DB 저장 |
| 식단 캘린더 | ✅ DB 연동 | 조회·저장·자동 시드 |
| 레시피 시트 | ✅ DB 연동 | 재료 표시, 메뉴 교체 버튼 |
| 장보기 목록 | ✅ DB 연동 | 자동 생성·체크·삭제 |
| AI 채팅 | ✅ 코드 완료 | 크레딧 충전 후 활성화 |
| 파트너 초대 | ❌ 미구현 | |
| 이유식 단계 자동 분기 | ⚠️ 부분 | 태그 표시만, 월령 자동 전환 없음 |
| 프로필 수정 저장 | ⚠️ 부분 | GET 됨, PUT 미연결 화면 있음 |

---

## 내일 우선 진행 목록

### 🔴 1순위 — Anthropic 크레딧 충전 (즉시)

- [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing) 접속
- $5~$10 크레딧 충전
- 충전 직후 AI 채팅 자동 활성화 (재배포 불필요)

---

### 🟠 2순위 — 프로필 수정 화면 완전 연동

**현재 문제:** `ProfileScreen.jsx`의 수정 버튼이 API를 호출하지 않음

**구현 작업:**
- [ ] ProfileScreen.jsx → 저장 버튼 `PUT /api/user/profile` 연결
- [ ] 변경 후 FamilyContext 즉시 갱신
- [ ] 아기 정보(이름·생일) 수정 시 월령 자동 재계산

**시나리오:**
```
장보는 요일 변경 (예: 토 → 일)
  → PUT /api/user/profile { shopping_day: 0 }
  → FamilyContext 갱신
  → 캘린더·장보기 D-X 즉시 업데이트
```

---

### 🟠 3순위 — 메뉴 삭제 기능 추가

**현재 문제:** 캘린더에서 기존 메뉴를 삭제하는 방법이 없음  
(교체는 가능하지만 빈 셀로 되돌리기 불가)

**구현 작업:**
- [ ] RecipeSheet에 "삭제" 버튼 추가
- [ ] `DELETE /api/meals` 엔드포인트 추가 (현재 PUT으로 menu_name=null 처리 가능)
- [ ] 캘린더 낙관적 업데이트

---

### 🟡 4순위 — AI 채팅 UX 개선 (크레딧 충전 후)

**테스트 시나리오:**
```
"이번 주 고기 요리 줄여줘"
  → AI: 현재 식단 분석 + 대안 제안
  → [식단에 적용하기] 클릭
  → 캘린더 새로고침 확인

"아기 이번 주 이유식 추천해줘"
  → AI: baby=true 레시피만 필터링해서 제안

"수요일 저녁 바꿔줘"
  → AI: 특정 날짜 교체 JSON 반환
  → 캘린더 자동 반영
```

**개선 가능 항목:**
- [ ] 채팅 후 캘린더 자동 새로고침 (현재 수동)
- [ ] [식단에 적용하기] 후 확인 토스트
- [ ] AI 응답 내 이유식 분기 자동 안내 (아기 있는 경우)

---

### 🟢 5순위 — 파트너 초대 기능

**시나리오:**
```
ProfileScreen → [파트너 초대] 버튼
  → POST /api/invite → 24시간 토큰 생성
  → https://cooking-master-tau.vercel.app/join?token=xxx
  → 카카오톡 / 클립보드 공유

파트너가 링크 접속
  → 소셜 로그인
  → 토큰 검증 → 가족 그룹 연결
```

**필요한 작업:**
- [ ] DB: `families`, `family_members`, `invite_tokens` 테이블
- [ ] `api/invite/index.js` (생성/수락)
- [ ] `/join` 라우트 + JoinScreen.jsx
- [ ] ⚠️ 함수 1개 추가 → 12/12 한도 꽉 참 → 기존 함수 병합 필요

---

## 함수 한도 관리 계획 (현재 11/12)

| 추가 예정 | 처리 방법 |
|----------|-----------|
| `api/invite/index.js` (+1) | `api/grocery/index.js`와 `generate.js` 병합해서 슬롯 확보 |

병합 예시:
```js
// api/grocery/index.js 에 generate 기능 통합
// POST /api/grocery → generate 트리거
// GET/PUT/DELETE /api/grocery → 기존 기능
```

---

## 전체 API 목록

| Method | Path | 설명 | 상태 |
|--------|------|------|------|
| GET/POST | `/api/auth/oauth` → `/api/auth/callback` | OAuth 플로우 | ✅ |
| POST | `/api/auth/facebook-deletion` | FB 삭제 콜백 | ✅ |
| GET | `/api/auth/providers` | 공급자 상태 | ✅ |
| POST | `/api/auth/logout` | 로그아웃 | ✅ |
| GET/PUT | `/api/user/profile` | 유저+프로필 조회/수정 | ✅ |
| GET/PUT | `/api/meals` | 식단 조회/저장 | ✅ |
| GET | `/api/recipes` | 레시피 목록/단건 | ✅ |
| GET/PUT/DELETE | `/api/grocery` | 장보기 목록 | ✅ |
| POST | `/api/grocery/generate` | 식단→장보기 생성 | ✅ |
| POST | `/api/ai/chat` | AI 채팅 | ✅ (크레딧 필요) |
| POST/GET | `/api/invite` | 초대 생성/수락 | ❌ 미구현 |
