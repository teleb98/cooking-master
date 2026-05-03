import { randomUUID } from 'crypto';
import { db } from '../_db.js';
import { signToken } from '../_auth.js';

const PROVIDERS = {
  google: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    parseUser: (d) => ({
      provider_id: `google_${d.sub}`,
      name: d.name ?? d.email?.split('@')[0] ?? 'Google User',
      email: d.email ?? null,
      avatar_url: d.picture ?? null,
    }),
  },
  kakao: {
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    userUrl: 'https://kapi.kakao.com/v2/user/me',
    clientId: () => process.env.KAKAO_CLIENT_ID,
    clientSecret: () => process.env.KAKAO_CLIENT_SECRET,
    parseUser: (d) => ({
      provider_id: `kakao_${d.id}`,
      name: d.kakao_account?.profile?.nickname ?? d.properties?.nickname ?? '카카오 사용자',
      email: d.kakao_account?.email ?? null,
      avatar_url:
        d.kakao_account?.profile?.profile_image_url ??
        d.properties?.profile_image ??
        null,
    }),
  },
  naver: {
    tokenUrl: 'https://nid.naver.com/oauth2.0/token',
    userUrl: 'https://openapi.naver.com/v1/nid/me',
    clientId: () => process.env.NAVER_CLIENT_ID,
    clientSecret: () => process.env.NAVER_CLIENT_SECRET,
    parseUser: (d) => ({
      provider_id: `naver_${d.response.id}`,
      name: d.response.name ?? d.response.nickname ?? '네이버 사용자',
      email: d.response.email ?? null,
      avatar_url: d.response.profile_image ?? null,
    }),
  },
  facebook: {
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    userUrl: null, // built dynamically with access_token
    clientId: () => process.env.FACEBOOK_APP_ID,
    clientSecret: () => process.env.FACEBOOK_APP_SECRET,
    parseUser: (d) => ({
      provider_id: `fb_${d.id}`,
      name: d.name ?? 'Facebook User',
      email: d.email ?? null,
      avatar_url: d.picture?.data?.url ?? null,
    }),
  },
};

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((c) => {
      const i = c.indexOf('=');
      return i < 0
        ? [c.trim(), '']
        : [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    }),
  );
}

function decodeState(raw) {
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString());
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const { code, state: rawState, error: oauthError } = req.query;
  const appUrl = process.env.APP_URL ?? `https://${req.headers.host}`;

  const go = (path) => {
    res.writeHead(302, { Location: `${appUrl}${path}` });
    res.end();
  };

  if (oauthError) return go(`/login?error=${encodeURIComponent(oauthError)}`);
  if (!code || !rawState) return go('/login?error=invalid_request');

  // Decode provider from state
  const stateData = decodeState(rawState);
  if (!stateData?.provider) return go('/login?error=invalid_state');

  const { provider, nonce } = stateData;
  const cfg = PROVIDERS[provider];
  if (!cfg) return go('/login?error=unknown_provider');

  // CSRF check — compare nonce from state vs. cookie
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.oauth_nonce && cookies.oauth_nonce !== nonce) {
    return go('/login?error=state_mismatch');
  }

  // Clear nonce cookie
  res.setHeader(
    'Set-Cookie',
    'oauth_nonce=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
  );

  try {
    // Clean redirect URI — same as registered in each provider's console
    const redirectUri = `${appUrl}/api/auth/callback`;

    // ── 1. Exchange code → access token ───────────────────────────────────
    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
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
      throw new Error(
        tokenData.error_description ??
          tokenData.error_message ??
          tokenData.error ??
          'token_failed',
      );
    }

    // ── 2. Fetch user profile ──────────────────────────────────────────────
    const userInfoUrl =
      provider === 'facebook'
        ? `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${tokenData.access_token}`
        : cfg.userUrl;

    const userRes = await fetch(userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();
    if (!userRes.ok) {
      console.error(`[callback/${provider}] user info error`, userData);
      throw new Error('user_info_failed');
    }

    const { provider_id, name, email, avatar_url } = cfg.parseUser(userData);
    const pid = String(provider_id);

    // ── 3. Upsert user in DB ───────────────────────────────────────────────
    const existing = await db.getOne('users', { provider, provider_id: pid });
    let user;
    if (existing) {
      await db.update('users', { id: existing.id }, {
        name,
        email: email ?? null,
        avatar_url: avatar_url ?? existing.avatar_url,
        last_login_at: new Date().toISOString(),
      });
      user = await db.getOne('users', { id: existing.id });
    } else {
      user = await db.insert('users', {
        id: randomUUID(),
        provider,
        provider_id: pid,
        name,
        email: email ?? null,
        avatar_url: avatar_url ?? null,
      });
    }

    // ── 4. Redirect to SPA — token in hash fragment (not in server logs) ──
    const jwtToken = signToken(user.id);
    const hashParams = new URLSearchParams({
      token: jwtToken,
      is_new: String(!existing),
      name,
    });

    go(`/login#${hashParams.toString()}`);
  } catch (err) {
    console.error(`[auth/callback/${provider}]`, err.message);
    go('/login?error=auth_failed');
  }
}
