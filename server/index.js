import { networkInterfaces } from 'os';
import { app, HAS_DIST } from './app.js';
import { startCron } from './cron.js';

const PORT = process.env.PORT || 3002;

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('\n  🍳 Cooking Master\n');
  console.log(`  Local:    http://localhost:${PORT}`);
  if (ip) console.log(`  Network:  http://${ip}:${PORT}`);
  console.log(`  Mode:     ${HAS_DIST ? 'production' : 'API-only (run npm run dev:web for HMR)'}\n`);
  startCron();
});

function getLocalIP() {
  for (const iface of Object.values(networkInterfaces())) {
    for (const net of iface) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}
