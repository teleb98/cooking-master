import cron from 'node-cron';
import webpush from 'web-push';
import db from './db.js';

const TOSS_SECRET_KEY = process.env.TOSS_SECRET_KEY ?? '';
const TOSS_API_BASE   = 'https://api.tosspayments.com/v1';
const PLAN_PRICE_KRW  = 2900;

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails('mailto:chiwon@gmail.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
}

function tossAuthHeader() {
  return `Basic ${Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64')}`;
}

async function tossCharge({ billingKey, customerKey, customerEmail, orderId }) {
  const res = await fetch(`${TOSS_API_BASE}/billing/${billingKey}`, {
    method: 'POST',
    headers: { Authorization: tossAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerKey, amount: PLAN_PRICE_KRW, orderId, orderName: 'Cooking Master Premium 월 구독', customerEmail: customerEmail ?? undefined }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `Toss charge failed (${res.status})`);
  }
  return res.json();
}

function nextMonthExpiry() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export async function runDailyJob() {
  // ── 1. Push 알림 발송 ────────────────────────────────────────
  const profiles = await db.getMany(
    'SELECT user_id, push_subscription FROM user_profiles WHERE push_subscription IS NOT NULL',
  );

  const expiredIds = [];
  let sent = 0, failed = 0;
  for (const p of profiles) {
    try {
      const sub = JSON.parse(p.push_subscription);
      await webpush.sendNotification(sub, JSON.stringify({ title: 'Cooking Master', body: '오늘의 식단을 확인해보세요 🍱', url: '/calendar' }));
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) expiredIds.push(p.user_id);
      else failed++;
    }
  }

  for (const userId of expiredIds) {
    await db.run('UPDATE user_profiles SET push_subscription = NULL WHERE user_id = $1', [userId]);
  }

  // ── 2. 만료 예정 프리미엄 구독 자동 결제 갱신 ───────────────
  const renewBefore = new Date();
  renewBefore.setDate(renewBefore.getDate() + 2);

  const toRenew = await db.getMany(
    `SELECT user_id, billing_key, billing_customer_key, plan_expires_at, plan_cancelled_at FROM user_profiles
     WHERE plan = 'premium' AND billing_key IS NOT NULL AND plan_cancelled_at IS NULL AND plan_expires_at <= $1`,
    [renewBefore.toISOString()],
  );

  let renewed = 0, renewFailed = 0;
  if (TOSS_SECRET_KEY && toRenew.length > 0) {
    for (const r of toRenew) {
      try {
        const user = await db.getOne('SELECT email FROM users WHERE id = $1', [r.user_id]);
        const orderId = `cm_renew_${r.user_id}_${Date.now()}`;
        await tossCharge({ billingKey: r.billing_key, customerKey: r.billing_customer_key ?? `cm_${r.user_id}`, customerEmail: user?.email, orderId });
        const now = new Date().toISOString();
        await db.run('UPDATE user_profiles SET plan_expires_at = $1, plan_renewed_at = $2, updated_at = $3 WHERE user_id = $4',
          [nextMonthExpiry(), now, now, r.user_id]);
        renewed++;
      } catch (err) {
        console.error(`[cron billing] renew failed for ${r.user_id}:`, err.message);
        renewFailed++;
      }
    }
  }

  // ── 3. 해지된 구독 플랜 다운그레이드 ───────────────────────
  const cancelled = await db.getMany(
    `SELECT user_id FROM user_profiles WHERE plan = 'premium' AND plan_cancelled_at IS NOT NULL AND plan_expires_at <= $1`,
    [new Date().toISOString()],
  );
  for (const c of cancelled) {
    await db.run('UPDATE user_profiles SET plan = $1, billing_key = NULL, updated_at = $2 WHERE user_id = $3',
      ['free', new Date().toISOString(), c.user_id]);
  }

  console.log(`[cron] push sent=${sent} expired=${expiredIds.length} failed=${failed} renewed=${renewed} renewFailed=${renewFailed} downgraded=${cancelled.length}`);
}

export function startCron() {
  // 매일 한국시간(KST=UTC+9) 오전 8시 = UTC 23:00 (Vercel cron이 쓰던 UTC 11:00=KST 20:00과 동일 시각으로 맞춤)
  cron.schedule('0 11 * * *', () => {
    runDailyJob().catch(err => console.error('[cron] daily job failed:', err.message));
  }, { timezone: 'UTC' });
  console.log('[cron] daily job scheduled (11:00 UTC / 20:00 KST)');
}
