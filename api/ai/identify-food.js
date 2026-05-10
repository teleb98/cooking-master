import { verifyToken } from '../_auth.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL   = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const { image_base64, mime_type = 'image/jpeg' } = req.body ?? {};
  if (!image_base64) return res.status(400).json({ error: 'image_base64 required' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI 서비스가 설정되지 않았습니다.' });

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inlineData: { mimeType: mime_type, data: image_base64 } },
            { text: '이 사진에 있는 음식의 이름을 한국어로 알려주세요. 음식 이름만 짧게(1~4단어) 대답하세요. 음식이 아닌 경우 "알 수 없음"으로만 답하세요.' },
          ],
        }],
        generationConfig: {
          maxOutputTokens: 30,
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 },
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    if (!geminiRes.ok) {
      const status = geminiRes.status;
      console.error('[identify-food] Gemini', status);
      if (status === 429) return res.status(429).json({ error: 'AI 요청이 너무 많습니다.' });
      return res.status(502).json({ error: `AI 오류 (${status})` });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

    if (!text || text === '알 수 없음') return res.json({ name: null });
    return res.json({ name: text });
  } catch (err) {
    console.error('[identify-food]', err.message);
    return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
  }
}
