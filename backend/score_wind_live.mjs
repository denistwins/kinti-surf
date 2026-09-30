import fs from 'node:fs';
import { buildWindSummary, windDirectionLabel } from '../kinti-wind-engine.js';

const raw = JSON.parse(fs.readFileSync(new URL('../data/surf-data.json', import.meta.url), 'utf8'));
const now = new Date().toISOString();

const fmt = (iso) => new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false
}).format(new Date(iso));

for (const sport of ['kite', 'windsurf']) {
  const s = buildWindSummary(raw, sport, now);
  const c = s.current;
  console.log(`\n🌬️ ${sport.toUpperCase()} — KINTI WIND LIVE`);
  if (!c) {
    console.log('Sin datos');
    continue;
  }
  console.log(`Actual ${fmt(c.timestamp)} | ${c.score}/100 ${c.rating.label}`);
  console.log(`Viento ${c.windKnots?.toFixed(1)} kt (${c.windSpeedKmh?.toFixed(1)} km/h) ${windDirectionLabel(c.windDirectionDeg)} ${c.windDirectionDeg?.toFixed(0)}°`);
  console.log(`Ráfagas ${c.gustKnots?.toFixed(1) ?? '—'} kt | tendencia ${c.windTrend}`);
  console.log(`Dirección: ${c.directionQuality.label}`);
  console.log(`Componentes:`, c.components);
  for (const [i, w] of s.windows.entries()) {
    console.log(`VENTANA ${i + 1}: ${w.dayRelation} ${fmt(w.start)}–${fmt(w.end)} | ${w.averageScore}/100 ${w.rating.label}${w.fallback ? ' | fallback' : ''}`);
  }
}
