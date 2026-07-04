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

      const prompt = `이것은 마트 또는 배달 영수증 사진입니다.
영수증에서 식재료(음식, 식품류)만 추출하세요. 비식품(생활용품 등)은 제외합니다.
각 항목을 다음 JSON 형식으로 반환하세요:
{"items":[{"name":"재료명","qty":"수량(예: 1개, 500g)","category":"육류|생선|해산물|채소|과일|유제품|곡물·기타|기타"}]}
재료명은 한국어로 짧고 명확하게. 배열만 반환하고 설명 없이.`;

      const visionRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType: mime_type, data: image_base64 } },
            { text: prompt },
          ]}],
          generationConfig: { maxOutputTokens: 1024, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      });

      if (!visionRes.ok) return res.status(502).json({ error: `AI 오류 (${visionRes.status})` });

      const vdata = await visionRes.json();
      const rawText = vdata.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return res.status(422).json({ error: '영수증에서 식재료를 인식하지 못했습니다.' });

      const parsed = JSON.parse(jsonMatch[0]);
      const items = (parsed.items ?? []).map(it => ({
        ...it,
        expires_at: defaultExpiresAt(it.category ?? '기타'),
      }));
      return res.json({ items });
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
