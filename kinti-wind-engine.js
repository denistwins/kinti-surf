const KINTI_WIND_PROFILE = {
  timezone: 'America/Lima',
  daylight: { startHour: 7, endHour: 18.5 },
  goodDirection: { min: 180, max: 240 }, // S -> SW, typical side/side-on sector in Máncora
  acceptableDirection: { min: 160, max: 260 },
  windowThreshold: 70,
  fallbackThreshold: 55,
  minWindowHours: 2,
};

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const kmhToKt = (kmh) => kmh == null ? null : kmh / 1.852;
const circularDiff = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

export function windDirectionLabel(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return dirs[Math.round((((Number(deg) % 360) + 360) % 360) / 22.5) % 16];
}

export function directionQuality(deg) {
  if (deg == null) return { score: 0, key: 'unknown', label: 'Sin dato' };
  const d = ((Number(deg) % 360) + 360) % 360;
  if (d >= KINTI_WIND_PROFILE.goodDirection.min && d <= KINTI_WIND_PROFILE.goodDirection.max) {
    return { score: 25, key: 'favorable', label: 'Favorable · side/side-on' };
  }
  if (d >= KINTI_WIND_PROFILE.acceptableDirection.min && d <= KINTI_WIND_PROFILE.acceptableDirection.max) {
    return { score: 20, key: 'acceptable', label: 'Dirección aceptable' };
  }
  // Keep some partial credit for nearby sectors, but clearly lower it.
  const diff = Math.min(circularDiff(d, 180), circularDiff(d, 240));
  if (diff <= 35) return { score: 12, key: 'marginal', label: 'Dirección marginal' };
  return { score: 3, key: 'unfavorable', label: 'Dirección poco favorable' };
}

function speedScoreKite(knots) {
  if (knots == null) return 0;
  if (knots < 8) return 0;
  if (knots < 11) return 12;
  if (knots < 14) return 28;
  if (knots < 18) return 40;
  if (knots <= 25) return 45;
  if (knots <= 30) return 38;
  if (knots <= 35) return 25;
  return 10;
}

function speedScoreWindsurf(knots) {
  if (knots == null) return 0;
  if (knots < 10) return 0;
  if (knots < 14) return 18;
  if (knots < 18) return 32;
  if (knots <= 28) return 45;
  if (knots <= 35) return 38;
  return 22;
}

function gustScore(avgKt, gustKt) {
  if (avgKt == null) return 0;
  if (gustKt == null) return 13;
  const spread = Math.max(0, gustKt - avgKt);
  if (spread <= 3) return 20;
  if (spread <= 5) return 17;
  if (spread <= 8) return 12;
  if (spread <= 11) return 7;
  return 2;
}

function stabilityScore(current, previous) {
  if (!previous) return 7;
  const nowKt = kmhToKt(current.windSpeedKmh) ?? 0;
  const prevKt = kmhToKt(previous.windSpeedKmh) ?? 0;
  let score = 0;
  if (Math.abs(nowKt - prevKt) <= 2) score += 5;
  else if (Math.abs(nowKt - prevKt) <= 4) score += 3;
  if (circularDiff(current.windDirectionDeg ?? 0, previous.windDirectionDeg ?? 0) <= 20) score += 5;
  else if (circularDiff(current.windDirectionDeg ?? 0, previous.windDirectionDeg ?? 0) <= 40) score += 3;
  return clamp(score, 0, 10);
}

function freshnessPenalty(hours) {
  if (hours == null || hours <= 12) return 0;
  if (hours <= 18) return 4;
  if (hours <= 24) return 8;
  return 15;
}

export function labelForWindScore(score) {
  if (score >= 90) return { key: 'excellent', label: 'Excelente' };
  if (score >= 80) return { key: 'very-good', label: 'Muy bueno' };
  if (score >= 70) return { key: 'good', label: 'Bueno' };
  if (score >= 55) return { key: 'fair', label: 'Aceptable' };
  if (score >= 40) return { key: 'weak', label: 'Flojo' };
  return { key: 'poor', label: 'Poco favorable' };
}

export function scoreWindForecast(hours, sport = 'kite') {
  return hours.map((h, i) => {
    const windKt = kmhToKt(h.windSpeedKmh);
    const gustKt = kmhToKt(h.gustKmh);
    const dir = directionQuality(h.windDirectionDeg);
    const components = {
      speed: sport === 'windsurf' ? speedScoreWindsurf(windKt) : speedScoreKite(windKt),
      direction: dir.score,
      gustiness: gustScore(windKt, gustKt),
      stability: stabilityScore(h, hours[i - 1]),
    };
    const age = h.weatherDataAgeHours ?? 0;
    const score = Math.round(clamp(Object.values(components).reduce((a, b) => a + b, 0) - freshnessPenalty(age), 0, 100));
    return {
      ...h,
      windKnots: windKt,
      gustKnots: gustKt,
      directionQuality: dir,
      components,
      score,
      rating: labelForWindScore(score),
      sport,
    };
  });
}

function localParts(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KINTI_WIND_PROFILE.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
}

function localDateKey(iso) {
  const p = localParts(iso);
  const get = (type) => p.find(x => x.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function localHour(iso) {
  const p = localParts(iso);
  let hour = Number(p.find(x => x.type === 'hour')?.value ?? 0);
  if (hour === 24) hour = 0;
  const minute = Number(p.find(x => x.type === 'minute')?.value ?? 0);
  return hour + minute / 60;
}

function isDaylight(iso) {
  const h = localHour(iso);
  return h >= KINTI_WIND_PROFILE.daylight.startHour && h <= KINTI_WIND_PROFILE.daylight.endHour;
}

function areHourlyNeighbors(a, b) {
  const dt = new Date(b.timestamp) - new Date(a.timestamp);
  return dt > 0 && dt <= 90 * 60 * 1000;
}

function findContiguous(points, threshold) {
  const result = [];
  let current = [];
  for (const p of points) {
    const continues = !current.length || areHourlyNeighbors(current.at(-1), p);
    if (isDaylight(p.timestamp) && p.score >= threshold && continues) {
      current.push(p);
    } else {
      if (current.length >= KINTI_WIND_PROFILE.minWindowHours) result.push(current);
      current = (isDaylight(p.timestamp) && p.score >= threshold) ? [p] : [];
    }
  }
  if (current.length >= KINTI_WIND_PROFILE.minWindowHours) result.push(current);
  return result;
}

function relationForDate(dateKey, referenceDateKey, orderedDates) {
  if (dateKey === referenceDateKey) return 'today';
  const index = orderedDates.indexOf(dateKey);
  const refIndex = orderedDates.indexOf(referenceDateKey);
  if (refIndex >= 0 && index === refIndex + 1) return 'tomorrow';
  return 'later';
}

function toWindow(group, fallback, dayRelation) {
  const avg = Math.round(group.reduce((s, p) => s + p.score, 0) / group.length);
  const peak = group.reduce((a, b) => a.score > b.score ? a : b);
  const end = new Date(new Date(group.at(-1).timestamp).getTime() + 60 * 60 * 1000).toISOString();
  return {
    start: group[0].timestamp,
    end,
    localDate: localDateKey(group[0].timestamp),
    dayRelation,
    averageScore: avg,
    peakScore: peak.score,
    peakAt: peak.timestamp,
    rating: labelForWindScore(avg),
    fallback,
  };
}

function fallbackPair(points) {
  let best = null;
  for (let i = 0; i < points.length - 1; i++) {
    const pair = points.slice(i, i + 2);
    if (!areHourlyNeighbors(pair[0], pair[1])) continue;
    const avg = (pair[0].score + pair[1].score) / 2;
    if (avg >= KINTI_WIND_PROFILE.fallbackThreshold && (!best || avg > best.avg)) best = { pair, avg };
  }
  return best?.pair ?? null;
}

export function detectWindWindows(scoredHours, referenceIso = scoredHours[0]?.timestamp) {
  if (!scoredHours.length || !referenceIso) return [];
  const referenceMs = new Date(referenceIso).getTime();
  const future = scoredHours
    .filter(p => new Date(p.timestamp).getTime() >= referenceMs && isDaylight(p.timestamp))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  if (!future.length) return [];

  const referenceDateKey = localDateKey(referenceIso);
  const orderedDates = [...new Set([referenceDateKey, ...future.map(p => localDateKey(p.timestamp))])];
  const windows = [];

  for (const dateKey of orderedDates) {
    const points = future.filter(p => localDateKey(p.timestamp) === dateKey);
    if (!points.length) continue;
    const relation = relationForDate(dateKey, referenceDateKey, orderedDates);
    const goodGroups = findContiguous(points, KINTI_WIND_PROFILE.windowThreshold)
      .map(g => toWindow(g, false, relation))
      .sort((a, b) => b.averageScore - a.averageScore || b.peakScore - a.peakScore);

    if (goodGroups.length) windows.push(...goodGroups);
    else {
      const pair = fallbackPair(points);
      if (pair) windows.push(toWindow(pair, true, relation));
    }
    if (windows.length >= 2) break;
  }
  return windows.slice(0, 2);
}

function windTrend(scored, currentIndex) {
  if (currentIndex < 0) return 'steady';
  const now = scored[currentIndex]?.windKnots;
  const next = scored[currentIndex + 1]?.windKnots;
  if (now == null || next == null) return 'steady';
  const d = next - now;
  if (d >= 1.5) return 'rising';
  if (d <= -1.5) return 'falling';
  return 'steady';
}

export function buildWindSummary(payload, sport = 'kite', referenceIso = new Date().toISOString()) {
  const scored = scoreWindForecast(payload.hours || [], sport);
  if (!scored.length) return { ...payload, sport, referenceTime: referenceIso, hours: [], current: null, windows: [] };
  const ref = new Date(referenceIso);
  let currentIndex = 0;
  for (let i = 0; i < scored.length; i++) {
    if (new Date(scored[i].timestamp) <= ref) currentIndex = i;
  }
  const current = { ...scored[currentIndex], windTrend: windTrend(scored, currentIndex) };
  const windows = detectWindWindows(scored, referenceIso);
  return { ...payload, sport, referenceTime: referenceIso, hours: scored, current, windows };
}

export { KINTI_WIND_PROFILE, kmhToKt };
