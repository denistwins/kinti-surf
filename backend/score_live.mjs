import fs from 'node:fs';
import { buildSurfSummary } from '../surf-engine.js';

const payload = JSON.parse(fs.readFileSync(new URL('../data/surf-data.json', import.meta.url), 'utf8'));
const summary = buildSurfSummary(payload);

const local = (iso) => new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(new Date(iso));

console.log('🏄 KINTI SURF SCORE — DATOS REALES');
console.log(`Actual: ${local(summary.current.timestamp)} | score=${summary.current.score}/100 | ${summary.current.rating.label}`);
console.log(`Swell: ${summary.current.swellHeightM} m @ ${summary.current.swellPeriodS} s | ${summary.current.swellDirectionDeg}°`);
console.log(`Viento: ${summary.current.windSpeedKmh} km/h | ${summary.current.windDirectionDeg}° | ráfaga=${summary.current.gustKmh ?? 'n/d'} km/h`);
console.log(`Marea: ${summary.current.tideTrend} | nivel normalizado=${summary.current.tideLevelNorm}`);
console.log(`Corriente: ${summary.current.currentSpeedMs} m/s | ${summary.current.currentDirectionDeg}°`);

if (!summary.windows.length) {
  console.log('VENTANAS: ninguna ventana >= umbral/fallback dentro de las horas de luz cubiertas.');
} else {
  summary.windows.forEach((w, i) => {
    console.log(`VENTANA ${i + 1}: ${local(w.start)}–${local(w.end)} | promedio=${w.averageScore} | pico=${w.peakScore} | ${w.rating.label}${w.fallback ? ' | fallback' : ''}`);
  });
}

console.log('\nHoras de luz puntuadas:');
for (const h of summary.hours) {
  const hour = Number(new Intl.DateTimeFormat('en-US', {timeZone:'America/Lima',hour:'2-digit',hour12:false}).format(new Date(h.timestamp)));
  if (hour >= 6 && hour <= 18) console.log(`${local(h.timestamp)}  ${h.score}/100  ${h.rating.label}`);
}
