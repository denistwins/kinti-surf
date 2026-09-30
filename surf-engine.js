const KINTI_PROFILE = {
  spot: 'Máncora',
  timezone: 'America/Lima',
  daylight: { startHour: 5.5, endHour: 18.5 },
  windowThreshold: 70,
  fallbackThreshold: 55,
  minWindowHours: 2,
  idealWindDeg: 112.5, // ESE, wind FROM direction
  idealPrimarySwellDeg: 315, // NW
  idealSecondarySwellDeg: 225 // SW
};

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const circularDiff = (a, b) => {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d;
};

function scoreByDiff(diff, max, stops) {
  for (const [limit, fraction] of stops) {
    if (diff <= limit) return max * fraction;
  }
  return 0;
}

function scoreSwellDirection(deg) {
  if (deg == null) return 0;
  const nw = scoreByDiff(circularDiff(deg, KINTI_PROFILE.idealPrimarySwellDeg), 15, [
    [20, 1], [40, .82], [65, .52], [90, .22]
  ]);
  const sw = scoreByDiff(circularDiff(deg, KINTI_PROFILE.idealSecondarySwellDeg), 11, [
    [20, 1], [40, .75], [65, .45]
  ]);
  return Math.max(nw, sw);
}

function scoreSwellPeriod(s) {
  if (s == null) return 0;
  if (s < 6) return 1;
  if (s < 8) return 5;
  if (s < 10) return 9;
  if (s < 12) return 12;
  if (s <= 15) return 15;
  if (s <= 18) return 14;
  return 12;
}

function scoreSwellHeight(m) {
  if (m == null) return 0;
  if (m < .4) return 2;
  if (m < .7) return 5;
  if (m < 1.0) return 8;
  if (m <= 1.8) return 10;
  if (m <= 2.4) return 8;
  if (m <= 3.0) return 5;
  return 2;
}

function scoreWindDirection(deg) {
  if (deg == null) return 0;
  return scoreByDiff(circularDiff(deg, KINTI_PROFILE.idealWindDeg), 20, [
    [22.5, 1], [45, .85], [67.5, .6], [90, .35], [135, .15]
  ]);
}

function scoreWindSpeed(kmh) {
  if (kmh == null) return 0;
  if (kmh <= 5) return 10;
  if (kmh <= 10) return 9;
  if (kmh <= 15) return 7;
  if (kmh <= 20) return 5;
  if (kmh <= 25) return 2;
  return 0;
}

function scoreTide(norm, trend) {
  if (norm == null) return 6; // neutral if unavailable
  let s = norm <= .30 ? 9 : norm <= .65 ? 7 : 5;
  if (trend === 'falling') s += 1;
  if (trend === 'rising' && norm > .75) s -= 1;
  return clamp(s, 0, 10);
}

function scoreCurrent(ms) {
  if (ms == null) return 6;
  if (ms <= .15) return 10;
  if (ms <= .30) return 8;
  if (ms <= .50) return 5;
  if (ms <= .75) return 2;
  return 0;
}

function stabilityScore(current, previous) {
  if (!previous) return 7;
  let s = 0;
  if (circularDiff(current.swellDirectionDeg ?? 0, previous.swellDirectionDeg ?? 0) <= 12) s += 3;
  if (Math.abs((current.swellPeriodS ?? 0) - (previous.swellPeriodS ?? 0)) <= 1.0) s += 2;
  if (circularDiff(current.windDirectionDeg ?? 0, previous.windDirectionDeg ?? 0) <= 25) s += 2;
  if (Math.abs((current.windSpeedKmh ?? 0) - (previous.windSpeedKmh ?? 0)) <= 5) s += 2;
  if (((current.gustKmh ?? current.windSpeedKmh ?? 0) - (current.windSpeedKmh ?? 0)) <= 10) s += 1;
  return clamp(s, 0, 10);
}

function freshnessPenalty(h) {
  if (h == null || h <= 12) return 0;
  if (h <= 24) return 5;
  return 15;
}

export function labelForScore(score) {
  if (score >= 90) return { key: 'excellent', label: 'Excelente' };
  if (score >= 80) return { key: 'very-good', label: 'Muy bueno' };
  if (score >= 70) return { key: 'good', label: 'Bueno' };
  if (score >= 55) return { key: 'fair', label: 'Aceptable' };
  if (score >= 40) return { key: 'weak', label: 'Flojo' };
  return { key: 'poor', label: 'Poco favorable' };
}

export function scoreForecast(hours) {
  return hours.map((h, i) => {
    const components = {
      swellDirection: scoreSwellDirection(h.swellDirectionDeg),
      swellPeriod: scoreSwellPeriod(h.swellPeriodS),
      swellHeight: scoreSwellHeight(h.swellHeightM),
      windDirection: scoreWindDirection(h.windDirectionDeg),
      windSpeed: scoreWindSpeed(h.windSpeedKmh),
      tide: scoreTide(h.tideLevelNorm, h.tideTrend),
      current: scoreCurrent(h.currentSpeedMs),
      stability: stabilityScore(h, hours[i - 1])
    };
    const stale = Math.max(h.waveDataAgeHours ?? 0, h.weatherDataAgeHours ?? 0);
    const score = Math.round(clamp(Object.values(components).reduce((a,b)=>a+b,0) - freshnessPenalty(stale), 0, 100));
    return { ...h, score, rating: labelForScore(score), components };
  });
}

function localHour(iso) {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: KINTI_PROFILE.timezone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const hour = Number(parts.find(p=>p.type==='hour')?.value ?? 0);
  const minute = Number(parts.find(p=>p.type==='minute')?.value ?? 0);
  return hour + minute / 60;
}

function isDaylight(iso) {
  const h = localHour(iso);
  return h >= KINTI_PROFILE.daylight.startHour && h <= KINTI_PROFILE.daylight.endHour;
}

function findContiguous(points, threshold) {
  const result = [];
  let current = [];
  for (const p of points) {
    if (isDaylight(p.timestamp) && p.score >= threshold) current.push(p);
    else {
      if (current.length >= KINTI_PROFILE.minWindowHours) result.push(current);
      current = [];
    }
  }
  if (current.length >= KINTI_PROFILE.minWindowHours) result.push(current);
  return result;
}

function toWindow(group, fallback = false) {
  const avg = Math.round(group.reduce((s,p)=>s+p.score,0) / group.length);
  const peak = group.reduce((a,b)=>a.score>b.score?a:b);
  const end = new Date(new Date(group.at(-1).timestamp).getTime() + 60*60*1000).toISOString();
  return {
    start: group[0].timestamp,
    end,
    averageScore: avg,
    peakScore: peak.score,
    peakAt: peak.timestamp,
    rating: labelForScore(avg),
    fallback
  };
}

export function detectWindows(scoredHours) {
  let groups = findContiguous(scoredHours, KINTI_PROFILE.windowThreshold);
  let fallback = false;

  if (!groups.length) {
    fallback = true;
    const daylight = scoredHours.filter(h => isDaylight(h.timestamp));
    let best = null;
    for (let i=0; i<daylight.length-1; i++) {
      const pair = daylight.slice(i, i+2);
      const avg = (pair[0].score + pair[1].score) / 2;
      if (avg >= KINTI_PROFILE.fallbackThreshold && (!best || avg > best.avg)) best = { pair, avg };
    }
    groups = best ? [best.pair] : [];
  }

  return groups.map(g => toWindow(g, fallback))
    .sort((a,b) => b.averageScore - a.averageScore || b.peakScore - a.peakScore)
    .slice(0,2);
}

export function buildSurfSummary(payload) {
  const scored = scoreForecast(payload.hours);
  const windows = detectWindows(scored);
  const now = new Date(payload.generatedAt);
  let current = scored[0];
  for (const point of scored) {
    if (new Date(point.timestamp) <= now) current = point;
  }
  return { ...payload, hours: scored, current, windows };
}

export { KINTI_PROFILE };
