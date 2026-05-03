import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { networkInterfaces } from 'os';
import authRouter    from './routes/auth.js';
import profileRouter from './routes/profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR   = join(__dirname, '..', 'dist');
const PORT       = process.env.PORT || 3002;
const HAS_DIST   = existsSync(join(DIST_DIR, 'index.html'));

const app = express();

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
app.use('/api/user/profile', profileRouter);
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

// ── Start ───────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n  🍳 Cooking Master\n');
  console.log(`  Local:    http://localhost:${PORT}`);
  if (ip) console.log(`  Network:  http://${ip}:${PORT}`);
  console.log(`  Mode:     ${HAS_DIST ? 'production' : 'API-only (run npm run dev:web for HMR)'}\n`);
});

function getLocalIP() {
  for (const iface of Object.values(networkInterfaces())) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}
