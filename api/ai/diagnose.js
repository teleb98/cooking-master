// Temporary diagnostic endpoint — remove after confirming Gemini works
// Call: POST /api/ai/diagnose  with header  x-diag-secret: cm-diag-2026
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-diag-secret'] !== 'cm-diag-2026') return res.status(403).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.json({ error: 'GEMINI_API_KEY is not set', apiKeyPresent: false });

  const model = req.body?.model ?? 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: '당신은 식단 관리 AI입니다.' }] },
        contents: [{ role: 'user', parts: [{ text: '안녕이라고 답해줘' }] }],
        generationConfig: { maxOutputTokens: 50, temperature: 0.5 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    const body = await geminiRes.json();
    return res.json({
      apiKeyPresent:  true,
      apiKeyPrefix:   apiKey.slice(0, 8) + '...',
      model,
      httpStatus:     geminiRes.status,
      httpOk:         geminiRes.ok,
      geminiResponse: body,
    });
  } catch (err) {
    return res.json({ apiKeyPresent: true, error: err.message });
  }
}
