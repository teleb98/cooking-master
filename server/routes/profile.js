import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// GET /api/user/profile
router.get('/', requireAuth, async (req, res) => {
  try {
    const profile = await db.getOne(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [req.userId],
    );
    res.json({ profile: profile ?? {} });
  } catch (err) {
    console.error('[profile/get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/user/profile
router.put('/', requireAuth, async (req, res) => {
  try {
    const {
      family_type  = 'couple',
      baby_birthday = null,
      shopping_day = 6,
      partner_name = null,
    } = req.body ?? {};

    const now = new Date().toISOString();
    const existing = await db.getOne(
      'SELECT user_id FROM user_profiles WHERE user_id = $1',
      [req.userId],
    );

    if (existing) {
      await db.run(
        `UPDATE user_profiles
         SET family_type = $1, baby_birthday = $2, shopping_day = $3,
             partner_name = $4, updated_at = $5
         WHERE user_id = $6`,
        [family_type, baby_birthday, shopping_day, partner_name, now, req.userId],
      );
    } else {
      await db.run(
        `INSERT INTO user_profiles
           (user_id, family_type, baby_birthday, shopping_day, partner_name, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.userId, family_type, baby_birthday, shopping_day, partner_name, now],
      );
    }

    const profile = await db.getOne(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [req.userId],
    );
    res.json({ profile });
  } catch (err) {
    console.error('[profile/put]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
