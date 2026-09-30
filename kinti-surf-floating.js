import { buildSurfSummary } from './surf-engine.js';

const DEFAULT_DATA_SRC = 'https://raw.githubusercontent.com/denistwins/kinti-surf/main/data/surf-data.json';
const TZ = 'America/Lima';

const dir16 = (deg) => {
  if (deg == null || Number.isNaN(Number(deg))) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return dirs[Math.round((((Number(deg) % 360) + 360) % 360) / 22.5) % 16];
};

const fmtHour = (iso) => new Intl.DateTimeFormat('es-PE', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit'
}).format(new Date(iso));

const localNowIso = () => new Date().toISOString();

const tideLabel = (trend) => trend === 'falling' ? 'Bajando' : trend === 'rising' ? 'Subiendo' : 'Estable';

const dayLabel = (window) => {
  if (!window) return 'Próximo momento';
  if (window.dayRelation === 'today') return window.fallback ? 'Mejor opción restante hoy' : 'Mejor ventana restante hoy';
  if (window.dayRelation === 'tomorrow') return window.fallback ? 'Mejor opción mañana' : 'Mejor ventana mañana';
  return window.fallback ? 'Próxima opción disponible' : 'Próxima buena ventana';
};

class KintiSurfFloating extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._open = false;
    this._summary = null;
    this._refreshTimer = null;
  }

  connectedCallback() {
    this.renderLoading();
    this.load();
    this.scheduleHourlyRefresh();
  }

  disconnectedCallback() {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
  }

  get dataSrc() {
    return this.getAttribute('data-src') || DEFAULT_DATA_SRC;
  }

  async load() {
    try {
      const bust = Math.floor(Date.now() / 3600000);
      const joiner = this.dataSrc.includes('?') ? '&' : '?';
      const response = await fetch(`${this.dataSrc}${joiner}h=${bust}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.hours) || !payload.hours.length) throw new Error('Forecast vacío');
      this._summary = buildSurfSummary(payload, localNowIso());
      this.render();
    } catch (error) {
      console.warn('[Kinti Surf] No se pudieron cargar los datos:', error);
      this.renderUnavailable();
    }
  }

  scheduleHourlyRefresh() {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(60, 5, 0); // 5 s after the hour boundary
    const delay = Math.max(1000, next - now);
    this._refreshTimer = setTimeout(async () => {
      await this.load();
      this.scheduleHourlyRefresh();
    }, delay);
  }

  toggle(force) {
    this._open = typeof force === 'boolean' ? force : !this._open;
    this.render();
  }

  baseStyles() {
    return `
      :host {
        --ksf-sea: #4d9f9c;
        --ksf-sea-deep: #176c70;
        --ksf-ink: #162d2f;
        --ksf-muted: #6e7b78;
        --ksf-paper: #fffdf8;
        --ksf-sand: #f2ede2;
        --ksf-line: rgba(22,45,47,.12);
        --ksf-accent: #f0cf72;
        --ksf-bottom: 22px;
        --ksf-right: 22px;
        position: fixed;
        right: var(--ksf-right);
        bottom: var(--ksf-bottom);
        z-index: 2147483000;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--ksf-ink);
        line-height: 1.25;
        -webkit-font-smoothing: antialiased;
      }
      *, *::before, *::after { box-sizing: border-box; }
      button { font: inherit; }
      .wrap { position: relative; display: grid; justify-items: end; gap: 12px; }
      .panel {
        width: min(370px, calc(100vw - 28px));
        max-height: min(650px, calc(100vh - 100px));
        overflow: auto;
        overscroll-behavior: contain;
        background: linear-gradient(145deg, var(--ksf-paper), var(--ksf-sand));
        border: 1px solid rgba(255,255,255,.86);
        border-radius: 26px;
        box-shadow: 0 26px 70px rgba(28,45,43,.24);
        padding: 20px;
        transform-origin: right bottom;
        animation: pop .22s cubic-bezier(.2,.8,.2,1);
      }
      @keyframes pop { from { opacity:0; transform: translateY(8px) scale(.97);} to {opacity:1; transform:none;} }
      .top { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
      .eyebrow { display:flex; align-items:center; gap:8px; color:var(--ksf-muted); font-size:10px; font-weight:800; letter-spacing:.16em; }
      .wave-mark { width:28px; height:28px; display:grid; place-items:center; color:var(--ksf-sea); }
      .wave-mark svg { width:100%; height:100%; }
      .title { margin:5px 0 0; font-family: Georgia, 'Times New Roman', serif; font-size:27px; font-weight:500; letter-spacing:-.025em; }
      .score { min-width:64px; height:64px; border-radius:50%; background:var(--ksf-accent); display:grid; place-items:center; font-weight:850; font-size:20px; }
      .score small { font-size:9px; margin-left:1px; }
      .window { margin-top:16px; padding:15px 16px; border-radius:18px; background:rgba(34,91,93,.065); border:1px solid rgba(34,91,93,.04); }
      .window-label { display:block; color:var(--ksf-muted); font-size:11px; margin-bottom:4px; }
      .window strong { display:block; font-size:22px; letter-spacing:-.03em; }
      .window-note { margin:6px 0 0; color:var(--ksf-muted); font-size:11px; }
      .metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; margin-top:10px; }
      .metric { padding:12px 10px; border-radius:15px; border:1px solid var(--ksf-line); min-width:0; }
      .metric .ico { display:block; font-size:16px; margin-bottom:6px; color:var(--ksf-sea-deep); }
      .metric b { display:block; font-size:14px; white-space:nowrap; }
      .metric small { display:block; margin-top:2px; color:var(--ksf-muted); font-size:9px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .timeline { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; align-items:end; min-height:92px; margin-top:15px; padding:12px 0 10px; border-top:1px solid var(--ksf-line); border-bottom:1px solid var(--ksf-line); }
      .hour { display:grid; grid-template-rows:56px auto auto; gap:2px; text-align:center; align-items:end; color:var(--ksf-muted); }
      .bar-box { height:56px; display:flex; align-items:flex-end; justify-content:center; }
      .bar { width:55%; max-width:18px; min-width:8px; min-height:7px; border-radius:10px 10px 4px 4px; background:rgba(77,159,156,.28); }
      .hour.now .bar { background:var(--ksf-sea); }
      .hour b { font-size:9px; }
      .hour small { font-size:9px; }
      .hour.now b, .hour.now small { color:var(--ksf-sea-deep); font-weight:850; }
      .foot { display:flex; justify-content:space-between; gap:10px; margin-top:12px; color:var(--ksf-muted); font-size:9px; }
      .disclaimer { margin:8px 0 0; color:var(--ksf-muted); font-size:9px; line-height:1.45; }
      .close { border:0; background:transparent; padding:3px; color:var(--ksf-muted); cursor:pointer; font-size:20px; line-height:1; }
      .trigger {
        border:1px solid rgba(255,255,255,.72);
        background:linear-gradient(135deg, var(--ksf-sea), var(--ksf-sea-deep));
        color:white;
        min-height:54px;
        border-radius:999px;
        padding:9px 16px 9px 11px;
        display:flex;
        align-items:center;
        gap:10px;
        cursor:pointer;
        box-shadow:0 14px 38px rgba(21,74,75,.28);
        transition:transform .18s ease, box-shadow .18s ease;
      }
      .trigger:hover { transform:translateY(-2px); box-shadow:0 18px 44px rgba(21,74,75,.34); }
      .trigger:focus-visible, .close:focus-visible { outline:3px solid rgba(240,207,114,.8); outline-offset:3px; }
      .trigger-wave { width:34px; height:34px; border-radius:50%; display:grid; place-items:center; background:rgba(255,255,255,.12); }
      .trigger-wave svg { width:24px; height:24px; }
      .trigger-copy { display:flex; flex-direction:column; align-items:flex-start; line-height:1.05; }
      .trigger-copy b { font-size:13px; }
      .trigger-copy small { margin-top:3px; font-size:9px; opacity:.82; }
      .chev { font-size:12px; opacity:.8; margin-left:2px; }
      .unavailable { width:min(330px,calc(100vw - 28px)); padding:14px 16px; background:var(--ksf-paper); border-radius:18px; box-shadow:0 18px 50px rgba(28,45,43,.18); font-size:12px; color:var(--ksf-muted); }
      @media (max-width: 640px) {
        :host { --ksf-right: 14px; --ksf-bottom: 14px; }
        .panel { width:calc(100vw - 28px); border-radius:22px; padding:17px; }
        .title { font-size:24px; }
        .score { width:58px; min-width:58px; height:58px; font-size:18px; }
        .trigger { min-height:52px; }
      }
      @media (prefers-reduced-motion: reduce) { .panel { animation:none; } .trigger { transition:none; } }
    `;
  }

  waveSvg() {
    return `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 29c6-14 17-20 29-15-5 1-8 4-9 8 5-2 10-1 16 3-8-1-13 1-16 6-4 7-13 8-20 5 5 0 9-2 12-6-4 2-8 2-12-1Z" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/></svg>`;
  }

  renderLoading() {
    this.shadowRoot.innerHTML = `<style>${this.baseStyles()}</style><div class="wrap"><button class="trigger" type="button" aria-label="Cargando condiciones de surf"><span class="trigger-wave">${this.waveSvg()}</span><span class="trigger-copy"><b>Surf ahora</b><small>Cargando condiciones…</small></span></button></div>`;
  }

  renderUnavailable() {
    this.shadowRoot.innerHTML = `<style>${this.baseStyles()}</style><div class="wrap">${this._open ? `<div class="unavailable">Las condiciones de surf no están disponibles en este momento. Intenta nuevamente en unos minutos.</div>` : ''}<button class="trigger" type="button" aria-expanded="${this._open}"><span class="trigger-wave">${this.waveSvg()}</span><span class="trigger-copy"><b>Surf ahora</b><small>Condiciones temporalmente no disponibles</small></span><span class="chev">${this._open ? '⌄' : '⌃'}</span></button></div>`;
    this.shadowRoot.querySelector('.trigger')?.addEventListener('click', () => { this._open = !this._open; this.renderUnavailable(); });
  }

  render() {
    if (!this._summary) return this.renderLoading();
    const data = this._summary;
    const current = data.current;
    const best = data.windows?.[0];
    const second = data.windows?.[1];
    const currentMs = new Date(data.referenceTime).getTime();
    const timeline = data.hours
      .filter(h => new Date(h.timestamp).getTime() >= currentMs - 30 * 60 * 1000)
      .slice(0, 7);
    const maxScore = Math.max(1, ...timeline.map(h => h.score));
    const sourceAge = Math.max(current?.waveDataAgeHours ?? 0, current?.weatherDataAgeHours ?? 0);
    const confidence = sourceAge <= 6 ? 'alta' : sourceAge <= 12 ? 'normal' : 'reducida';
    const secondary = second ? `${second.dayRelation === 'tomorrow' ? 'Mañana' : 'Otra ventana'} ${fmtHour(second.start)}–${fmtHour(second.end)}` : '';

    const panel = this._open ? `
      <section class="panel" role="dialog" aria-label="Condiciones de surf en Máncora">
        <div class="top">
          <div><div class="eyebrow"><span class="wave-mark">${this.waveSvg()}</span>SURF · MÁNCORA</div><h2 class="title">${current.rating.label}</h2></div>
          <div style="display:flex;align-items:flex-start;gap:5px"><div class="score">${current.score}<small>/100</small></div><button class="close" type="button" aria-label="Cerrar">×</button></div>
        </div>
        <div class="window">
          <span class="window-label">${dayLabel(best)}</span>
          <strong>${best ? `${fmtHour(best.start)} — ${fmtHour(best.end)}` : 'Sin una ventana clara'}</strong>
          ${secondary ? `<p class="window-note">${secondary}</p>` : ''}
        </div>
        <div class="metrics">
          <div class="metric"><span class="ico">≈</span><b>${current.swellHeightM?.toFixed(2) ?? '—'} m</b><small>${current.swellPeriodS?.toFixed(1) ?? '—'} s · ${dir16(current.swellDirectionDeg)}</small></div>
          <div class="metric"><span class="ico">≋</span><b>${Math.round(current.windSpeedKmh ?? 0)} km/h</b><small>${dir16(current.windDirectionDeg)}${current.gustKmh ? ` · rachas ${Math.round(current.gustKmh)}` : ''}</small></div>
          <div class="metric"><span class="ico">◒</span><b>${tideLabel(current.tideTrend)}</b><small>Marea</small></div>
        </div>
        <div class="timeline" aria-label="Kinti Surf Score próximas horas">${timeline.map((h, i) => `<div class="hour ${i === 0 ? 'now' : ''}"><div class="bar-box"><i class="bar" style="height:${Math.max(10, Math.round(h.score / maxScore * 100))}%"></i></div><b>${h.score}</b><small>${fmtHour(h.timestamp).replace(':00','')}</small></div>`).join('')}</div>
        <div class="foot"><span>Copernicus + NOAA · confianza ${confidence}</span><span>Actualizado ${fmtHour(data.generatedAt)}</span></div>
        <p class="disclaimer">Pronóstico orientativo basado en modelos oceanográficos y meteorológicos. Las condiciones locales reales pueden variar.</p>
      </section>` : '';

    this.shadowRoot.innerHTML = `<style>${this.baseStyles()}</style><div class="wrap">${panel}<button class="trigger" type="button" aria-expanded="${this._open}" aria-label="${this._open ? 'Cerrar condiciones de surf' : 'Abrir condiciones de surf'}"><span class="trigger-wave">${this.waveSvg()}</span><span class="trigger-copy"><b>Surf ahora</b><small>${current.score}/100 · ${current.rating.label}${best ? ` · ${fmtHour(best.start)}` : ''}</small></span><span class="chev">${this._open ? '⌄' : '⌃'}</span></button></div>`;

    this.shadowRoot.querySelector('.trigger')?.addEventListener('click', () => this.toggle());
    this.shadowRoot.querySelector('.close')?.addEventListener('click', () => this.toggle(false));
  }
}

if (!customElements.get('kinti-surf-floating')) {
  customElements.define('kinti-surf-floating', KintiSurfFloating);
}
