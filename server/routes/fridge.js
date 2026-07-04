import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// 카테고리별 기본 유통기한 (일)
const DEFAULT_EXPIRY_DAYS = {
  '육류': 3, '생선': 2, '해산물': 2,
  '채소': 5, '과일': 5,
  '유제품': 7, '곡물·기타': 30, '기타': 7,
};

function defaultExpiresAt(category) {
  const days = DEFAULT_EXPIRY_DAYS[category] ?? 7;
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 0);
  return d.toISOString().slice(0, 10);
}

// 가족그룹 정보 조회 헬퍼
async function getFamilyGroupId(userId) {
  const p = await db.getOne('SELECT family_group_id FROM user_profiles WHERE user_id = $1', [userId]);
  return p?.family_group_id ?? null;
}

// ── GET /api/fridge ─────────────────────────────────────
// 현재 재고 목록 (소비하지 않은 항목, 유통기한 오름차순)
router.get('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  try {
    const groupId = await getFamilyGroupId(userId);
    let items;
    if (groupId) {
      items = await db.getMany(
        `SELECT * FROM fridge_items
         WHERE family_group_id = $1 AND consumed_at IS NULL
         ORDER BY expires_at ASC NULLS LAST, added_at DESC`,
        [groupId],
      );
    } else {
      items = await db.getMany(
        `SELECT * FROM fridge_items
         WHERE user_id = $1 AND family_group_id IS NULL AND consumed_at IS NULL
         ORDER BY expires_at ASC NULLS LAST, added_at DESC`,
        [userId],
      );
    }
    res.json({ items });
  } catch (err) {
    console.error('[fridge GET]', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── POST /api/fridge ─────────────────────────────────────
// 1) 단일 추가: { name, qty, category, expires_at }
// 2) 일괄 추가: { items: [{name, qty, category, expires_at}...] }
// 3) 영수증 OCR: { scan_receipt: true, image_base64, mime_type } → 파싱 결과 반환(저장 안함)
router.post('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  const apiKey = process.env.GEMINI_API_KEY;
  const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  try {
    // ── 영수증 OCR 모드 ──────────────────────────────────
    if (req.body?.scan_receipt) {
      if (!apiKey) return res.status(503).json({ error: 'AI 서비스가 설정되지 않았습니다.' });
      const { image_base64, mime_type = 'image/jpeg' } = req.body;
      if (!image_base64) return res.status(400).json({ error: 'image_base64 required' });

      const prompt = `당신은 한국 대형마트(이마트·롯데마트·홈플러스 등) 영수증 전문 OCR 분석가입니다.
이미지가 회전되어 있어도 반드시 텍스트를 읽어 식재료·식품을 최대한 많이 추출하세요.

[한국 마트 영수증 형식 특성]
- 행 앞에 "001", "002" 같은 줄 번호가 있음 → 무시
- 상품명 앞에 "P", "P(", "P ("가 붙는 경우가 많음 → 제거 후 식품명만 사용
- "*8801234567890" 같은 바코드 번호 행 → 무시
- 상품명 뒤에 "/국산", "/수입", "(냉", "(과" 등 원산지·보관 표시가 올 수 있음 → 제거
- 수량 열, 단가 열, 금액 열이 별도로 있음 → 수량 열 값을 qty로 사용, 없으면 상품명 내 숫자+단위 추출
- 영수증이 두 열로 나뉘는 경우 양쪽 모두 읽을 것
- 이미지가 90°·180°·270° 회전되어 있을 수 있음 → 어느 방향이든 텍스트를 읽을 것

[필수 추출 대상 - 식재료·식품류]
육류(목살/삼겹살/갈비 등), 어류, 해산물, 채소, 과일, 달걀, 두부, 유제품, 음료, 조미료·소스·오일, 가공식품, 냉동식품, 면·빵·쌀·잡곡, 통조림 등

[제외 대상 - 비식품]
화장품, 세제·생활용품, 종이류, 의류, 가전, 영수증 합계·할인·포인트·할인쿠폰 행

[추출 규칙]
1. "P(한우)아이포크목살 551.00g" → 이름: "한우 목살", qty: "551g"
2. "P브로콜리/개/국산 200g/국산" → 이름: "브로콜리", qty: "200g"
3. "P(진천경)감자/1kg/봉" → 이름: "감자", qty: "1kg"
4. "P냉동원 연두부 90g+4" → 이름: "연두부", qty: "360g" (90×4=360)
5. 상품명이 잘리거나 축약된 경우 완전한 식품명으로 복원
6. 수량 정보가 없으면 수량 열 숫자×단위 사용, 그것도 없으면 "1개"
7. 같은 재료가 중복되면 합산
8. 재료명은 간결한 한국어, 브랜드명 제거 (부위명은 유지)

[카테고리 기준]
- 육류: 소고기, 돼지고기, 닭고기, 오리, 양고기 등 (부위명 포함)
- 생선: 고등어, 연어, 갈치, 건어물 등
- 해산물: 새우, 오징어, 조개, 게, 낙지 등
- 채소: 채소·나물·버섯류 전체
- 과일: 과일류 전체
- 유제품: 우유, 치즈, 버터, 요거트, 크림
- 곡물·기타: 쌀·밀가루·빵·면, 오일·소스·조미료, 통조림·가공식품·음료·두부
- 기타: 위에 해당 없는 식품

[출력 - JSON만 출력, 마크다운·설명 없이]
{"items":[{"name":"재료명","qty":"수량","category":"카테고리"}]}

식품이 전혀 없거나 인식 불가: {"items":[]}`;

      const visionRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: mime_type, data: image_base64 } },
            { text: prompt },
          ]}],
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0,
            thinkingConfig: { thinkingBudget: 1024 },
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });

      if (!visionRes.ok) {
        const errBody = await visionRes.json().catch(() => ({}));
        console.error('[fridge OCR] Gemini error:', errBody);
        return res.status(502).json({ error: `AI 오류 (${visionRes.status})` });
      }

      const vdata = await visionRes.json();
      // thinking 모드에서는 parts[0]가 thinking 토큰일 수 있으므로 text part 탐색
      const rawText = vdata.candidates?.[0]?.content?.parts
        ?.find(p => p.text !== undefined)?.text ?? '';

      // JSON 파싱 — 여러 패턴 순서대로 시도
      let items = [];
      const strategies = [
        // 1) ```json ... ``` 코드블록
        () => { const m = rawText.match(/```(?:json)?\s*([\s\S]*?)```/); return m && JSON.parse(m[1]); },
        // 2) { "items": [...] } 오브젝트
        () => { const m = rawText.match(/\{[\s\S]*"items"[\s\S]*\}/); return m && JSON.parse(m[0]); },
        // 3) 첫 번째 [ ... ] 배열
        () => { const m = rawText.match(/\[[\s\S]*\]/); return m && { items: JSON.parse(m[0]) }; },
        // 4) 전체 텍스트를 직접 파싱
        () => JSON.parse(rawText),
      ];

      for (const fn of strategies) {
        try {
          const parsed = fn();
          if (parsed?.items) { items = parsed.items; break; }
        } catch { /* 다음 전략 시도 */ }
      }

      const result = items
        .filter(it => it?.name)
        .map(it => ({
          name:       it.name.trim(),
          qty:        it.qty?.trim() || '1개',
          category:   it.category ?? '기타',
          expires_at: defaultExpiresAt(it.category ?? '기타'),
        }));

      return res.json({ items: result });
    }

    // ── 일괄 저장 모드 ──────────────────────────────────
    const groupId = await getFamilyGroupId(userId);
    const rawItems = req.body?.items
      ? req.body.items
      : [{ name: req.body?.name, qty: req.body?.qty, category: req.body?.category, expires_at: req.body?.expires_at }];

    if (!rawItems.length || !rawItems[0]?.name) {
      return res.status(400).json({ error: 'name required' });
    }

    const saved = [];
    for (const it of rawItems) {
      if (!it?.name?.trim()) continue;
      const id = randomUUID();
      const expiresAt = it.expires_at || defaultExpiresAt(it.category ?? '기타');
      await db.run(
        `INSERT INTO fridge_items (id, user_id, family_group_id, name, qty, category, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, userId, groupId, it.name.trim(), it.qty ?? '1개', it.category ?? '기타', expiresAt],
      );
      saved.push({ id, name: it.name.trim(), qty: it.qty ?? '1개', category: it.category ?? '기타', expires_at: expiresAt });
    }

    res.json({ saved, count: saved.length });
  } catch (err) {
    console.error('[fridge POST]', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── PUT /api/fridge ──────────────────────────────────────
// { id, qty?, expires_at?, consumed_at? }
router.put('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id, qty, expires_at, consumed_at } = req.body ?? {};
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const item = await db.getOne('SELECT * FROM fridge_items WHERE id = $1', [id]);
    if (!item) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
    if (item.user_id !== userId) {
      const groupId = await getFamilyGroupId(userId);
      if (!groupId || item.family_group_id !== groupId) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }
    }

    const sets = [];
    const vals = [];
    let idx = 1;
    if (qty !== undefined)         { sets.push(`qty = $${idx++}`);         vals.push(qty); }
    if (expires_at !== undefined)  { sets.push(`expires_at = $${idx++}`);  vals.push(expires_at); }
    if (consumed_at !== undefined) { sets.push(`consumed_at = $${idx++}`); vals.push(consumed_at); }
    if (!sets.length) return res.status(400).json({ error: '변경할 항목이 없습니다.' });

    vals.push(id);
    await db.run(`UPDATE fridge_items SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
    res.json({ ok: true });
  } catch (err) {
    console.error('[fridge PUT]', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

// ── DELETE /api/fridge ───────────────────────────────────
router.delete('/', requireAuth, async (req, res) => {
  const userId = req.userId;
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ error: 'id required' });

  try {
    const item = await db.getOne('SELECT * FROM fridge_items WHERE id = $1', [id]);
    if (!item) return res.status(404).json({ error: '항목을 찾을 수 없습니다.' });
    if (item.user_id !== userId) {
      const groupId = await getFamilyGroupId(userId);
      if (!groupId || item.family_group_id !== groupId) {
        return res.status(403).json({ error: '권한이 없습니다.' });
      }
    }
    await db.run('DELETE FROM fridge_items WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[fridge DELETE]', err.message);
    res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
});

export default router;
