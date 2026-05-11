const CACHE = 'cm-v1';

const PRECACHE = [
  '/',
  '/manifest.json',
  '/og.png',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// ── 설치: 앱 셸 사전 캐시 ─────────────────────────────────
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

  // API 요청: 네트워크 우선, 실패 시 오프라인 응답
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: '오프라인 상태입니다. 연결을 확인해주세요.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // 외부 리소스(폰트 등): 네트워크 우선, 캐시 폴백
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (!res || res.status !== 200) return res;
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 정적 자산 / HTML: 캐시 우선, 없으면 네트워크 후 캐시 저장
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
        return res;
      }).catch(() => {
        // HTML 내비게이션 실패 시 캐시된 루트 반환 (SPA 오프라인)
        if (request.mode === 'navigate') return caches.match('/');
      });
    })
  );
});
