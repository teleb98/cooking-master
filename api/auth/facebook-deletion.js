import { createHmac } from 'crypto';
import { db } from '../_db.js';

function parseSignedRequest(signedRequest, appSecret) {
  const [encodedSig, payload] = signedRequest.split('.');
  const sig = Buffer.from(encodedSig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  const expected = createHmac('sha256', appSecret).update(payload).digest();
  if (!sig.equals(expected)) throw new Error('Invalid signature');
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { signed_request } = req.body ?? {};
    if (!signed_request) return res.status(400).json({ error: 'Missing signed_request' });

    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const data = parseSignedRequest(signed_request, appSecret);
    const facebookUserId = data.user_id;

    // Delete user with this Facebook provider_id
    if (facebookUserId) {
      const providerId = `fb_${facebookUserId}`;
      const user = await db.getOne('users', { provider: 'facebook', provider_id: providerId });
      if (user) {
        await db.supabase.from('users').delete().eq('id', user.id);
      }
    }

    const confirmationCode = `del_${facebookUserId}_${Date.now()}`;
    const appUrl = process.env.APP_URL ?? `https://${req.headers.host}`;

    res.json({
      url: `${appUrl}/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (err) {
    console.error('[facebook-deletion]', err.message);
    res.status(400).json({ error: 'Invalid request' });
  }
}
