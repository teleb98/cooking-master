const CACHE = 'cm-v2';

// 정적 자산만 사전 캐시 — HTML은 절대 포함하지 않음 (스테일 캐시 문제 방지)
const PRECACHE = [
  '/manifest.json',
  '/og.png',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// ── 설치 ──────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ── 활성화: 구 캐시 정리 ──────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch 전략 ────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // ① API: 네트워크 우선, 오프라인 시 503 JSON
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: '오프라인 상태입니다. 연결을 확인해주세요.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // ② HTML 내비게이션: 항상 네트워크 우선 (배포 후 구버전 HTML 서빙 방지)
  //    오프라인일 때만 캐시 폴백
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          // 응답 캐시 저장 (오프라인 폴백용)
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then(cached => cached ?? caches.match('/')))
    );
    return;
  }

  // ③ 외부 리소스(폰트 등): 네트워크 우선, 캐시 폴백
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ④ 정적 자산(JS · CSS · 이미지 등): 캐시 우선 (해시 URL이므로 안전)
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return res;
      });
    })
  );
});
