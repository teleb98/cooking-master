import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes, randomUUID, createHmac } from 'crypto';
import db from '../db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'cooking-master-dev-secret-change-in-prod';

const PROVIDERS = {
  google: {
    authUrl:  'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl:  'https://www.googleapis.com/oauth2/v3/userinfo',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientId:     () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    scope: 'openid email profile',
    parseUser: (d) => ({
      provider_id: `google_${d.sub}`,
      name: d.name ?? d.email?.split('@')[0] ?? 'Google User',
      email: d.email ?? null,
      avatar_url: d.picture ?? null,
    }),
  },
  kakao: {
    authUrl:  'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    userUrl:  'https://kapi.kakao.com/v2/user/me',
    clientIdEnv: 'KAKAO_CLIENT_ID',
    clientId:     () => process.env.KAKAO_CLIENT_ID,
    clientSecret: () => process.env.KAKAO_CLIENT_SECRET,
    scope: 'profile_nickname profile_image',
    parseUser: (d) => ({
      provider_id: `kakao_${d.id}`,
      name: d.kakao_account?.profile?.nickname ?? d.properties?.nickname ?? '카카오 사용자',
      email: d.kakao_account?.email ?? null,
      avatar_url: d.kakao_account?.profile?.profile_image_url ?? d.properties?.profile_image ?? null,
    }),
  },
  naver: {
    authUrl:  'https://nid.naver.com/oauth2.0/authorize',
    tokenUrl: 'https://nid.naver.com/oauth2.0/token',
    userUrl:  'https://openapi.naver.com/v1/nid/me',
    clientIdEnv: 'NAVER_CLIENT_ID',
    clientId:     () => process.env.NAVER_CLIENT_ID,
    clientSecret: () => process.env.NAVER_CLIENT_SECRET,
    scope: '',
    parseUser: (d) => ({
      provider_id: `naver_${d.response.id}`,
      name: d.response.name ?? d.response.nickname ?? '네이버 사용자',
      email: d.response.email ?? null,
      avatar_url: d.response.profile_image ?? null,
    }),
  },
  facebook: {
    authUrl:  'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    userUrl:  null,
    clientIdEnv: 'FACEBOOK_APP_ID',
    clientId:     () => process.env.FACEBOOK_APP_ID,
    clientSecret: () => process.env.FACEBOOK_APP_SECRET,
    scope: 'public_profile',
    parseUser: (d) => ({
      provider_id: `fb_${d.id}`,
      name: d.name ?? 'Facebook User',
      email: d.email ?? null,
      avatar_url: d.picture?.data?.url ?? null,
    }),
  },
};

function appUrl(req) {
  return process.env.APP_URL ?? `https://${req.headers.host}`;
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((c) => {
      const i = c.indexOf('=');
      return i < 0 ? [c.trim(), ''] : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    }),
  );
}

function decodeState(raw) {
  try { return JSON.parse(Buffer.from(raw, 'base64url').toString()); }
  catch { return null; }
}

// GET /api/auth/providers
router.get('/providers', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    configured: {
      google:   !!process.env.GOOGLE_CLIENT_ID,
      kakao:    !!process.env.KAKAO_CLIENT_ID,
      naver:    !!process.env.NAVER_CLIENT_ID,
      facebook: !!process.env.FACEBOOK_APP_ID,
    },
  });
});

// GET /api/auth/oauth?provider=...
router.get('/oauth', (req, res) => {
  const { provider } = req.query;
  const cfg = PROVIDERS[provider];
  if (!cfg) return res.redirect('/login?error=unknown_provider');

  const clientId = cfg.clientId();
  if (!clientId) return res.redirect(`/login?error=not_configured&provider=${provider}`);

  const nonce = randomBytes(16).toString('hex');
  const state = Buffer.from(JSON.stringify({ provider, nonce })).toString('base64url');
  const redirectUri = `${appUrl(req)}/api/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    ...(cfg.scope ? { scope: cfg.scope } : {}),
  });

  res.setHeader('Set-Cookie', `oauth_nonce=${nonce}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`);
  res.redirect(`${cfg.authUrl}?${params}`);
});

// GET /api/auth/callback
router.get('/callback', async (req, res) => {
  const { code, state: rawState, error: oauthError } = req.query;
  const base = appUrl(req);
  const go = (path) => res.redirect(`${base}${path}`);

  if (oauthError) return go(`/login?error=${encodeURIComponent(oauthError)}`);
  if (!code || !rawState) return go('/login?error=invalid_request');

  const stateData = decodeState(rawState);
  if (!stateData?.provider) return go('/login?error=invalid_state');

  const { provider, nonce } = stateData;
  const cfg = PROVIDERS[provider];
  if (!cfg) return go('/login?error=unknown_provider');

  const cookies = parseCookies(req.headers.cookie);
  if (cookies.oauth_nonce && cookies.oauth_nonce !== nonce) return go('/login?error=state_mismatch');

  res.setHeader('Set-Cookie', 'oauth_nonce=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');

  try {
    const redirectUri = `${base}/api/auth/callback`;

    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: cfg.clientId(),
        client_secret: cfg.clientSecret(),
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error(`[callback/${provider}] token error`, tokenData);
      throw new Error(tokenData.error_description ?? tokenData.error_message ?? tokenData.error ?? 'token_failed');
    }

    const userInfoUrl = provider === 'facebook'
      ? `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${tokenData.access_token}`
      : cfg.userUrl;

    const userRes = await fetch(userInfoUrl, { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const userData = await userRes.json();
    if (!userRes.ok) {
      console.error(`[callback/${provider}] user info error`, userData);
      throw new Error('user_info_failed');
    }

    const { provider_id, name, email, avatar_url } = cfg.parseUser(userData);
    const pid = String(provider_id);

    const existing = await db.getOne('SELECT * FROM users WHERE provider = $1 AND provider_id = $2', [provider, pid]);
    let user;
    if (existing) {
      await db.run(
        'UPDATE users SET name = $1, email = $2, avatar_url = $3, last_login_at = $4 WHERE id = $5',
        [name, email ?? null, avatar_url ?? existing.avatar_url, new Date().toISOString(), existing.id],
      );
      user = await db.getOne('SELECT * FROM users WHERE id = $1', [existing.id]);
    } else {
      const id = randomUUID();
      await db.run(
        'INSERT INTO users (id, provider, provider_id, name, email, avatar_url) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, provider, pid, name, email ?? null, avatar_url ?? null],
      );
      await db.run('INSERT INTO user_profiles (user_id) VALUES ($1)', [id]);
      user = await db.getOne('SELECT * FROM users WHERE id = $1', [id]);
    }

    const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });
    const hashParams = new URLSearchParams({ token: jwtToken, is_new: String(!existing), name });
    go(`/login#${hashParams.toString()}`);
  } catch (err) {
    console.error(`[auth/callback/${provider}]`, err.message);
    go('/login?error=auth_failed');
  }
});

// POST /api/auth/facebook-deletion
router.post('/facebook-deletion', async (req, res) => {
  try {
    const { signed_request } = req.body ?? {};
    if (!signed_request) return res.status(400).json({ error: 'Missing signed_request' });

    const [encodedSig, payload] = signed_request.split('.');
    const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    const expected = createHmac('sha256', process.env.FACEBOOK_APP_SECRET).update(payload).digest();
    if (!sig.equals(expected)) throw new Error('Invalid signature');

    const facebookUserId = data.user_id;
    if (facebookUserId) {
      const providerId = `fb_${facebookUserId}`;
      const user = await db.getOne('SELECT * FROM users WHERE provider = $1 AND provider_id = $2', ['facebook', providerId]);
      if (user) await db.run('DELETE FROM users WHERE id = $1', [user.id]);
    }

    const confirmationCode = `del_${facebookUserId}_${Date.now()}`;
    res.json({ url: `${appUrl(req)}/data-deletion?code=${confirmationCode}`, confirmation_code: confirmationCode });
  } catch (err) {
    console.error('[facebook-deletion]', err.message);
    res.status(400).json({ error: 'Invalid request' });
  }
});

export default router;
