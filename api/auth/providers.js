export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    configured: {
      google:   !!process.env.GOOGLE_CLIENT_ID,
      kakao:    !!process.env.KAKAO_CLIENT_ID,
      naver:    !!process.env.NAVER_CLIENT_ID,
      facebook: !!process.env.FACEBOOK_APP_ID,
    },
  });
}
