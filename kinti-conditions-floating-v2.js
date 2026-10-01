import { buildSurfSummary } from './surf-engine.js';
import { buildWindSummary } from './kinti-wind-engine.js';

const DEFAULT_DATA_SRC = 'https://raw.githubusercontent.com/denistwins/kinti-surf/main/data/surf-data.json';
const TZ = 'America/Lima';

const I18N = {
  es: {
    locale: 'es-PE',
    conditionsNow: 'Condiciones ahora',
    loading: 'Cargando mar y viento…',
    unavailableShort: 'Datos temporalmente no disponibles',
    unavailable: 'Las condiciones de mar y viento no están disponibles en este momento. Intenta nuevamente en unos minutos.',
    conditionsMancora: 'CONDICIONES · MÁNCORA',
    surfNow: 'SURF · AHORA',
    kiteNow: 'KITESURF · AHORA',
    windsurfNow: 'WINDSURF · AHORA',
    swell: 'Swell',
    wind: 'Viento',
    tide: 'Marea',
    direction: 'Dirección',
    gusts: 'Ráfagas',
    trend: 'Tendencia',
    totalWave: 'Ola total',
    falling: 'Bajando',
    rising: 'Subiendo',
    steady: 'Estable',
    favorable: 'Favorable · side/side-on',
    acceptableDirection: 'Dirección aceptable',
    marginalDirection: 'Dirección marginal',
    unfavorableDirection: 'Dirección poco favorable',
    noDirection: 'Sin dato',
    bestRemainingToday: 'Mejor ventana restante hoy',
    bestOptionToday: 'Mejor opción restante hoy',
    bestTomorrow: 'Mejor ventana mañana',
    bestOptionTomorrow: 'Mejor opción mañana',
    nextGoodWindow: 'Próxima buena ventana',
    nextOption: 'Próxima opción disponible',
    nextMoment: 'Próximo momento',
    tomorrow: 'Mañana',
    anotherWindow: 'Otra ventana',
    noClearWindow: 'Sin una ventana clara',
    updated: 'Actualizado',
    confidence: 'confianza',
    high: 'alta',
    normal: 'normal',
    reduced: 'reducida',
    disclaimer: 'Pronóstico orientativo basado en modelos oceanográficos y meteorológicos. Las condiciones locales reales pueden variar.',
    close: 'Cerrar',
    openConditions: 'Abrir condiciones',
    closeConditions: 'Cerrar condiciones',
    ratings: {
      excellent: 'Excelente',
      'very-good': 'Muy bueno',
      good: 'Bueno',
      fair: 'Aceptable',
      weak: 'Flojo',
      poor: 'Poco favorable'
    }
  },
  en: {
    locale: 'en-US',
    conditionsNow: 'Conditions now',
    loading: 'Loading sea and wind…',
    unavailableShort: 'Data temporarily unavailable',
    unavailable: 'Sea and wind conditions are not available right now. Please try again in a few minutes.',
    conditionsMancora: 'CONDITIONS · MÁNCORA',
    surfNow: 'SURF · NOW',
    kiteNow: 'KITESURF · NOW',
    windsurfNow: 'WINDSURF · NOW',
    swell: 'Swell',
    wind: 'Wind',
    tide: 'Tide',
    direction: 'Direction',
    gusts: 'Gusts',
    trend: 'Trend',
    totalWave: 'Total wave',
    falling: 'Falling',
    rising: 'Rising',
    steady: 'Steady',
    favorable: 'Favorable · side/side-on',
    acceptableDirection: 'Acceptable direction',
    marginalDirection: 'Marginal direction',
    unfavorableDirection: 'Unfavorable direction',
    noDirection: 'No data',
    bestRemainingToday: 'Best remaining window today',
    bestOptionToday: 'Best remaining option today',
    bestTomorrow: 'Best window tomorrow',
    bestOptionTomorrow: 'Best option tomorrow',
    nextGoodWindow: 'Next good window',
    nextOption: 'Next available option',
    nextMoment: 'Next opportunity',
    tomorrow: 'Tomorrow',
    anotherWindow: 'Another window',
    noClearWindow: 'No clear window',
    updated: 'Updated',
    confidence: 'confidence',
    high: 'high',
    normal: 'normal',
    reduced: 'reduced',
    disclaimer: 'Guidance forecast based on oceanographic and weather models. Actual local conditions may vary.',
    close: 'Close',
    openConditions: 'Open conditions',
    closeConditions: 'Close conditions',
    ratings: {
      excellent: 'Excellent',
      'very-good': 'Very good',
      good: 'Good',
      fair: 'Fair',
      weak: 'Weak',
      poor: 'Unfavorable'
    }
  }
};

const kmhToKt = (kmh) => kmh == null ? null : kmh / 1.852;

class KintiConditionsFloatingV2 extends HTMLElement {
  static get observedAttributes() { return ['lang', 'tab']; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._open = false;
    this._tab = ['surf','kite','windsurf'].includes(this.getAttribute('tab')) ? this.getAttribute('tab') : 'surf';
    this._lang = 'es';
    this._payload = null;
    this._surf = null;
    this._kite = null;
    this._windsurf = null;
    this._refreshTimer = null;
    this._languageObserver = null;
    this._languageEventHandler = (event) => {
      const lang = event?.detail?.lang || event?.detail?.language;
      if (lang) this.setLanguage(lang);
      else this.syncLanguageFromPage();
    };
  }

  connectedCallback() {
    this.syncLanguageFromPage();
    this.observePageLanguage();
    window.addEventListener('kinti-language-change', this._languageEventHandler);
    window.addEventListener('languagechange', this._languageEventHandler);
    this.renderLoading();
    this.load();
    this.scheduleHourlyRefresh();
  }

  disconnectedCallback() {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._languageObserver?.disconnect();
    window.removeEventListener('kinti-language-change', this._languageEventHandler);
    window.removeEventListener('languagechange', this._languageEventHandler);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || !this.isConnected) return;
    if (name === 'lang') {
      this._lang = this.normalizeLang(newValue);
      this.renderCurrentState();
    }
    if (name === 'tab' && ['surf','kite','windsurf'].includes(newValue)) {
      this._tab = newValue;
      this.renderCurrentState();
    }
  }

  normalizeLang(lang) {
    return String(lang || '').toLowerCase().startsWith('en') ? 'en' : 'es';
  }

  syncLanguageFromPage() {
    const explicit = this.getAttribute('lang');
    if (explicit) {
      this._lang = this.normalizeLang(explicit);
      return;
    }
    const pageLang = document.documentElement.getAttribute('lang') || document.documentElement.dataset.lang || document.body?.dataset?.lang || 'es';
    const next = this.normalizeLang(pageLang);
    if (next !== this._lang) {
      this._lang = next;
      if (this.isConnected) this.renderCurrentState();
    }
  }

  observePageLanguage() {
    this._languageObserver?.disconnect();
    this._languageObserver = new MutationObserver(() => this.syncLanguageFromPage());
    this._languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'data-lang'] });
  }

  setLanguage(lang) {
    const next = this.normalizeLang(lang);
    if (next === this._lang) return;
    this._lang = next;
    this.renderCurrentState();
  }

  get t() { return I18N[this._lang] || I18N.es; }
  get dataSrc() { return this.getAttribute('data-src') || DEFAULT_DATA_SRC; }

  fmtHour(iso) {
    return new Intl.DateTimeFormat(this.t.locale, { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  }

  dir16(deg) {
    if (deg == null || Number.isNaN(Number(deg))) return '—';
    const es = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
    const en = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const dirs = this._lang === 'en' ? en : es;
    return dirs[Math.round((((Number(deg) % 360) + 360) % 360) / 22.5) % 16];
  }

  translatedRating(rating) {
    return this.t.ratings[rating?.key] || rating?.label || '—';
  }

  tideLabel(trend) {
    return trend === 'falling' ? this.t.falling : trend === 'rising' ? this.t.rising : this.t.steady;
  }

  directionLabel(quality) {
    const key = quality?.key;
    if (key === 'favorable') return this.t.favorable;
    if (key === 'acceptable') return this.t.acceptableDirection;
    if (key === 'marginal') return this.t.marginalDirection;
    if (key === 'unfavorable') return this.t.unfavorableDirection;
    return this.t.noDirection;
  }

  windowLabel(w) {
    if (!w) return this.t.nextMoment;
    if (w.dayRelation === 'today') return w.fallback ? this.t.bestOptionToday : this.t.bestRemainingToday;
    if (w.dayRelation === 'tomorrow') return w.fallback ? this.t.bestOptionTomorrow : this.t.bestTomorrow;
    return w.fallback ? this.t.nextOption : this.t.nextGoodWindow;
  }

  secondWindowLabel(w) {
    if (!w) return '';
    return w.dayRelation === 'tomorrow' ? this.t.tomorrow : this.t.anotherWindow;
  }

  confidenceLabel(age) {
    return age <= 6 ? this.t.high : age <= 12 ? this.t.normal : this.t.reduced;
  }

  async load() {
    try {
      const bust = Math.floor(Date.now() / 3600000);
      const joiner = this.dataSrc.includes('?') ? '&' : '?';
      const response = await fetch(`${this.dataSrc}${joiner}h=${bust}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.hours) || !payload.hours.length) throw new Error('Empty forecast');
      this._payload = payload;
      this.rebuild();
    } catch (error) {
      console.warn('[Kinti Conditions] data unavailable:', error);
      this.renderUnavailable();
    }
  }

  rebuild() {
    if (!this._payload) return;
    const now = new Date().toISOString();
    this._surf = buildSurfSummary(this._payload, now);
    this._kite = buildWindSummary(this._payload, 'kite', now);
    this._windsurf = buildWindSummary(this._payload, 'windsurf', now);
    this.render();
  }

  scheduleHourlyRefresh() {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(60, 10, 0);
    this._refreshTimer = setTimeout(async () => {
      await this.load();
      this.scheduleHourlyRefresh();
    }, Math.max(1000, next - now));
  }

  renderCurrentState() {
    if (this._payload && this._surf) this.render();
    else this.renderLoading();
  }

  toggle(force) {
    this._open = typeof force === 'boolean' ? force : !this._open;
    this.renderCurrentState();
  }

  setTab(tab) {
    if (!['surf','kite','windsurf'].includes(tab)) return;
    this._tab = tab;
    this.render();
  }

  seaWindSvg() {
    return `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M5 31c5-10 13-15 23-13-4 1-7 4-8 7 4-1 8 0 12 3-6 0-10 2-12 6-3 5-9 6-15 3" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M28 11h11c4 0 4-5 0-5-2 0-3 1-3 3M30 16h13" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  }

  styles() {
    return `:host{--kcf-sea:#4a9f9b;--kcf-deep:#176b70;--kcf-ink:#172d2f;--kcf-muted:#6c7a77;--kcf-paper:#fffdf8;--kcf-sand:#f1ece1;--kcf-line:rgba(23,45,47,.12);--kcf-yellow:#f0cf72;--kcf-green:#dcefbf;--kcf-bottom:22px;--kcf-right:22px;position:fixed;right:var(--kcf-right);bottom:var(--kcf-bottom);z-index:2147483000;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--kcf-ink);line-height:1.25;-webkit-font-smoothing:antialiased}*,*::before,*::after{box-sizing:border-box}button{font:inherit}.wrap{display:grid;justify-items:end;gap:12px}.panel{width:min(410px,calc(100vw - 28px));max-height:min(690px,calc(100vh - 105px));overflow:auto;overscroll-behavior:contain;background:linear-gradient(145deg,var(--kcf-paper),var(--kcf-sand));border:1px solid rgba(255,255,255,.86);border-radius:27px;box-shadow:0 26px 70px rgba(28,45,43,.24);padding:20px;animation:pop .22s cubic-bezier(.2,.8,.2,1);transform-origin:right bottom}@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}.head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.eyebrow{display:flex;align-items:center;gap:8px;color:var(--kcf-muted);font-size:10px;font-weight:800;letter-spacing:.16em}.mark{width:28px;height:28px;color:var(--kcf-sea)}.mark svg{width:100%;height:100%}.head h2{margin:5px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:500;letter-spacing:-.025em}.close{border:0;background:transparent;padding:4px;color:var(--kcf-muted);cursor:pointer;font-size:21px;line-height:1}.tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:15px;padding:4px;background:rgba(23,107,112,.07);border-radius:999px}.tab{border:0;background:transparent;color:var(--kcf-muted);border-radius:999px;padding:9px 8px;font-size:10px;font-weight:850;cursor:pointer;white-space:nowrap}.tab.active{background:var(--kcf-paper);color:var(--kcf-deep);box-shadow:0 3px 12px rgba(23,45,47,.08)}.summary{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:13px;margin-top:13px}.score{width:70px;height:70px;border-radius:50%;display:grid;place-items:center;font-size:22px;font-weight:850;background:var(--kcf-yellow)}.score.wind{background:var(--kcf-green)}.score small{font-size:9px;margin-left:1px}.summary-copy span{display:block;color:var(--kcf-muted);font-size:10px;text-transform:uppercase;letter-spacing:.1em}.summary-copy strong{display:block;margin-top:3px;font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:500}.summary-copy small{display:block;margin-top:4px;color:var(--kcf-muted);font-size:10px}.window{margin-top:12px;padding:14px 16px;border-radius:18px;background:rgba(23,107,112,.06)}.window-label{display:block;color:var(--kcf-muted);font-size:10px;margin-bottom:4px}.window strong{display:block;font-size:21px;letter-spacing:-.03em}.window p{margin:5px 0 0;color:var(--kcf-muted);font-size:10px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:10px}.metric{padding:11px 9px;border:1px solid var(--kcf-line);border-radius:14px;min-width:0}.metric span{display:block;color:var(--kcf-muted);font-size:9px;margin-bottom:4px}.metric b{display:block;font-size:13px;white-space:nowrap}.metric small{display:block;margin-top:2px;color:var(--kcf-muted);font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.timeline{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;align-items:end;min-height:94px;margin-top:14px;padding:12px 0 10px;border-top:1px solid var(--kcf-line);border-bottom:1px solid var(--kcf-line)}.hour{display:grid;grid-template-rows:56px auto auto;gap:2px;text-align:center;align-items:end;color:var(--kcf-muted)}.barbox{height:56px;display:flex;align-items:flex-end;justify-content:center}.bar{width:55%;max-width:18px;min-width:8px;min-height:7px;border-radius:10px 10px 4px 4px;background:rgba(74,159,155,.27)}.hour.now .bar{background:var(--kcf-sea)}.hour b,.hour small{font-size:9px}.hour.now b,.hour.now small{color:var(--kcf-deep);font-weight:850}.foot{display:flex;justify-content:space-between;gap:10px;margin-top:11px;color:var(--kcf-muted);font-size:9px}.disclaimer{margin:7px 0 0;color:var(--kcf-muted);font-size:9px;line-height:1.45}.trigger{border:1px solid rgba(255,255,255,.72);background:linear-gradient(135deg,var(--kcf-sea),var(--kcf-deep));color:#fff;min-height:56px;border-radius:999px;padding:9px 17px 9px 11px;display:flex;align-items:center;gap:10px;cursor:pointer;box-shadow:0 14px 38px rgba(21,74,75,.28);transition:transform .18s ease,box-shadow .18s ease}.trigger:hover{transform:translateY(-2px);box-shadow:0 18px 44px rgba(21,74,75,.34)}.trigger-icon{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12)}.trigger-icon svg{width:25px;height:25px}.trigger-copy{display:flex;flex-direction:column;align-items:flex-start;line-height:1.05}.trigger-copy b{font-size:13px}.trigger-copy small{margin-top:4px;font-size:9px;opacity:.85}.chev{font-size:12px;opacity:.8;margin-left:2px}.unavailable{width:min(350px,calc(100vw - 28px));padding:14px 16px;background:var(--kcf-paper);border-radius:18px;box-shadow:0 18px 50px rgba(28,45,43,.18);font-size:12px;color:var(--kcf-muted)}.trigger:focus-visible,.close:focus-visible,.tab:focus-visible{outline:3px solid rgba(240,207,114,.85);outline-offset:3px}@media(max-width:640px){:host{--kcf-right:14px;--kcf-bottom:14px}.panel{width:calc(100vw - 28px);border-radius:22px;padding:17px}.head h2{font-size:24px}.score{width:62px;height:62px;font-size:19px}.summary-copy strong{font-size:21px}.trigger{min-height:53px}.tab{font-size:9px;padding-inline:5px}}@media(prefers-reduced-motion:reduce){.panel{animation:none}.trigger{transition:none}}`;
  }

  renderLoading() {
    this.shadowRoot.innerHTML = `<style>${this.styles()}</style><div class="wrap"><button class="trigger" type="button"><span class="trigger-icon">${this.seaWindSvg()}</span><span class="trigger-copy"><b>${this.t.conditionsNow}</b><small>${this.t.loading}</small></span></button></div>`;
  }

  renderUnavailable() {
    this.shadowRoot.innerHTML = `<style>${this.styles()}</style><div class="wrap">${this._open ? `<div class="unavailable">${this.t.unavailable}</div>` : ''}<button class="trigger" type="button" aria-expanded="${this._open}"><span class="trigger-icon">${this.seaWindSvg()}</span><span class="trigger-copy"><b>${this.t.conditionsNow}</b><small>${this.t.unavailableShort}</small></span><span class="chev">${this._open ? '⌄' : '⌃'}</span></button></div>`;
    this.shadowRoot.querySelector('.trigger')?.addEventListener('click', () => { this._open = !this._open; this.renderUnavailable(); });
  }

  timeline(hours, referenceTime) {
    const nowMs = new Date(referenceTime).getTime();
    const visible = hours.filter(h => new Date(h.timestamp).getTime() >= nowMs - 30*60*1000).slice(0,7);
    const max = Math.max(1, ...visible.map(h => h.score));
    return `<div class="timeline">${visible.map((h,i)=>`<div class="hour ${i===0?'now':''}"><div class="barbox"><i class="bar" style="height:${Math.max(10,Math.round(h.score/max*100))}%"></i></div><b>${h.score}</b><small>${this.fmtHour(h.timestamp).replace(':00','')}</small></div>`).join('')}</div>`;
  }

  windowBlock(data) {
    const best = data.windows?.[0];
    const second = data.windows?.[1];
    return `<div class="window"><span class="window-label">${this.windowLabel(best)}</span><strong>${best ? `${this.fmtHour(best.start)} — ${this.fmtHour(best.end)}` : this.t.noClearWindow}</strong>${second ? `<p>${this.secondWindowLabel(second)} ${this.fmtHour(second.start)}–${this.fmtHour(second.end)}</p>` : ''}</div>`;
  }

  panelSurf() {
    const data = this._surf;
    const c = data.current;
    const age = Math.max(c.waveDataAgeHours ?? 0, c.weatherDataAgeHours ?? 0);
    return `<div class="summary"><div class="score">${c.score}<small>/100</small></div><div class="summary-copy"><span>${this.t.surfNow}</span><strong>${this.translatedRating(c.rating)}</strong><small>${c.swellHeightM?.toFixed(2) ?? '—'} m · ${c.swellPeriodS?.toFixed(1) ?? '—'} s · ${this.dir16(c.swellDirectionDeg)}</small></div></div>${this.windowBlock(data)}<div class="metrics"><div class="metric"><span>${this.t.swell}</span><b>${c.swellHeightM?.toFixed(2) ?? '—'} m</b><small>${c.swellPeriodS?.toFixed(1) ?? '—'} s · ${this.dir16(c.swellDirectionDeg)}</small></div><div class="metric"><span>${this.t.wind}</span><b>${Math.round(c.windSpeedKmh ?? 0)} km/h</b><small>${this.dir16(c.windDirectionDeg)}</small></div><div class="metric"><span>${this.t.tide}</span><b>${this.tideLabel(c.tideTrend)}</b><small>${c.tideLevelNorm != null ? Math.round(c.tideLevelNorm*100)+'%' : '—'}</small></div></div>${this.timeline(data.hours,data.referenceTime)}<div class="foot"><span>Copernicus + NOAA · ${this.t.confidence} ${this.confidenceLabel(age)}</span><span>${this.t.updated} ${this.fmtHour(data.generatedAt)}</span></div><p class="disclaimer">${this.t.disclaimer}</p>`;
  }

  panelWind(data, kind) {
    const c = data.current;
    const age = c.weatherDataAgeHours ?? 0;
    const gustKt = Math.max(c.windKnots ?? 0, c.gustKnots ?? 0);
    const nowLabel = kind === 'kite' ? this.t.kiteNow : this.t.windsurfNow;
    return `<div class="summary"><div class="score wind">${c.score}<small>/100</small></div><div class="summary-copy"><span>${nowLabel}</span><strong>${this.translatedRating(c.rating)}</strong><small>${c.windKnots?.toFixed(1) ?? '—'} kt · ${this.dir16(c.windDirectionDeg)} · ${Math.round(c.windDirectionDeg ?? 0)}°</small></div></div>${this.windowBlock(data)}<div class="metrics"><div class="metric"><span>${this.t.wind}</span><b>${c.windKnots?.toFixed(1) ?? '—'} kt</b><small>${Math.round(c.windSpeedKmh ?? 0)} km/h</small></div><div class="metric"><span>${this.t.direction}</span><b>${this.dir16(c.windDirectionDeg)}</b><small>${this.directionLabel(c.directionQuality)}</small></div><div class="metric"><span>${this.t.gusts}</span><b>${gustKt.toFixed(1)} kt</b><small>${this.t.trend}: ${this.tideLabel(c.windTrend)}</small></div></div>${this.timeline(data.hours,data.referenceTime)}<div class="foot"><span>NOAA GFS · ${this.t.confidence} ${this.confidenceLabel(age)}</span><span>${this.t.updated} ${this.fmtHour(data.generatedAt)}</span></div><p class="disclaimer">${this.t.disclaimer}</p>`;
  }

  render() {
    if (!this._surf?.current || !this._kite?.current || !this._windsurf?.current) return this.renderUnavailable();
    const surfCurrent = this._surf.current;
    const windCurrent = this._kite.current;
    const panelBody = this._tab === 'surf' ? this.panelSurf() : this._tab === 'kite' ? this.panelWind(this._kite,'kite') : this.panelWind(this._windsurf,'windsurf');
    const panel = this._open ? `<section class="panel" role="dialog" aria-label="${this.t.conditionsNow}"><div class="head"><div><div class="eyebrow"><span class="mark">${this.seaWindSvg()}</span>${this.t.conditionsMancora}</div><h2>${this.t.conditionsNow}</h2></div><button class="close" type="button" aria-label="${this.t.close}">×</button></div><div class="tabs"><button class="tab ${this._tab==='surf'?'active':''}" data-tab="surf" type="button">SURF</button><button class="tab ${this._tab==='kite'?'active':''}" data-tab="kite" type="button">KITESURF</button><button class="tab ${this._tab==='windsurf'?'active':''}" data-tab="windsurf" type="button">WINDSURF</button></div>${panelBody}</section>` : '';
    const summary = `Surf ${surfCurrent.score}/100 · ${this.t.wind} ${kmhToKt(windCurrent.windSpeedKmh)?.toFixed(0) ?? '—'} kt`;
    this.shadowRoot.innerHTML = `<style>${this.styles()}</style><div class="wrap">${panel}<button class="trigger" type="button" aria-expanded="${this._open}" aria-label="${this._open ? this.t.closeConditions : this.t.openConditions}"><span class="trigger-icon">${this.seaWindSvg()}</span><span class="trigger-copy"><b>${this.t.conditionsNow}</b><small>${summary}</small></span><span class="chev">${this._open ? '⌄' : '⌃'}</span></button></div>`;
    this.shadowRoot.querySelector('.trigger')?.addEventListener('click',()=>this.toggle());
    this.shadowRoot.querySelector('.close')?.addEventListener('click',()=>this.toggle(false));
    this.shadowRoot.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>this.setTab(btn.dataset.tab)));
  }
}

if (!customElements.get('kinti-conditions-floating-v2')) {
  customElements.define('kinti-conditions-floating-v2', KintiConditionsFloatingV2);
}
