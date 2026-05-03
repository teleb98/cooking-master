import { randomBytes } from 'crypto';

const PROVIDERS = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    scope: 'openid email profile',
  },
  kakao: {
    authUrl: 'https://kauth.kakao.com/oauth/authorize',
    clientIdEnv: 'KAKAO_CLIENT_ID',
    scope: 'profile_nickname profile_image',
  },
  naver: {
    authUrl: 'https://nid.naver.com/oauth2.0/authorize',
    clientIdEnv: 'NAVER_CLIENT_ID',
    scope: '',
  },
  facebook: {
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    clientIdEnv: 'FACEBOOK_APP_ID',
    scope: 'public_profile',
  },
};

export default function handler(req, res) {
  const { provider } = req.query;
  const cfg = PROVIDERS[provider];

  if (!cfg) {
    res.writeHead(302, { Location: `/login?error=unknown_provider` });
    return res.end();
  }

  const clientId = process.env[cfg.clientIdEnv];
  if (!clientId) {
    res.writeHead(302, { Location: `/login?error=not_configured&provider=${provider}` });
    return res.end();
  }

  const appUrl = process.env.APP_URL ?? `https://${req.headers.host}`;

  // Encode provider + CSRF nonce into state — avoids query params in redirect URI
  const nonce = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ provider, nonce })).toString('base64url');

  // Clean redirect URI with no query params (universally accepted by all providers)
  const redirectUri = `${appUrl}/api/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    ...(cfg.scope ? { scope: cfg.scope } : {}),
  });

  res.setHeader(
    'Set-Cookie',
    `oauth_nonce=${nonce}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  );
  res.writeHead(302, { Location: `${cfg.authUrl}?${params}` });
  res.end();
}
