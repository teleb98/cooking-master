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

app.use(express.json());

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
