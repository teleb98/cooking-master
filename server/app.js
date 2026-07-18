import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import authRouter    from './routes/auth.js';
import oauthRouter   from './routes/oauth.js';
import profileRouter from './routes/profile.js';
import mealsRouter   from './routes/meals.js';
import recipesRouter from './routes/recipes.js';
import groceryRouter from './routes/grocery.js';
import fridgeRouter  from './routes/fridge.js';
import aiRouter      from './routes/ai.js';
import inviteRouter  from './routes/invite.js';
import lifestyleRouter from './routes/lifestyle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR   = join(__dirname, '..', 'dist');
export const HAS_DIST = existsSync(join(DIST_DIR, 'index.html'));

export const app = express();

if (!HAS_DIST) {
  // Dev mode: Vite runs on 5173, allow cross-origin API calls
  app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:4173'],
    credentials: true,
  }));
}

// rarebook 패밀리 간 라이프스타일 신호 교차 조회 — pkl(서재)·www(서점)가 브라우저에서
// rb_session 쿠키로 이 API를 직접 호출한다. 다른 API는 SPA 자체 호출만 쓰므로 CORS 불필요,
// 이 엔드포인트만 좁게 서브도메인에 허용한다.
const RAREBOOK_ORIGINS = [
  'https://rarebook.co.kr', 'https://www.rarebook.co.kr',
  'https://pkl.rarebook.co.kr', 'https://cooking.rarebook.co.kr',
  'http://localhost:5173', 'http://localhost:4173',
];
app.use('/api/lifestyle', cors({
  origin: (origin, cb) => cb(null, !origin || RAREBOOK_ORIGINS.includes(origin)),
  credentials: true,
}));

app.use(express.json({ limit: '20mb' }));

// ── API ─────────────────────────────────────────────────
app.use('/api/auth',    authRouter);
app.use('/api/auth',    oauthRouter);
app.use('/api/user/profile', profileRouter);
app.use('/api/meals',   mealsRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/grocery', groceryRouter);
app.use('/api/fridge',  fridgeRouter);
app.use('/api/ai',      aiRouter);
app.use('/api/invite',  inviteRouter);
app.use('/api/lifestyle', lifestyleRouter);
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, mode: HAS_DIST ? 'production' : 'dev', time: new Date().toISOString() }),
);

// ── Static frontend (production build) ─────────────────
if (HAS_DIST) {
  app.use(express.static(DIST_DIR));
  app.get('/{*path}', (req, res) => {
    if (!req.path.startsWith('/api')) res.sendFile(join(DIST_DIR, 'index.html'));
  });
}
