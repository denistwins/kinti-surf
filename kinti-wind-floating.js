import { buildWindSummary, windDirectionLabel } from './kinti-wind-engine.js';

const DEFAULT_DATA_SRC = 'https://raw.githubusercontent.com/denistwins/kinti-surf/main/data/surf-data.json';
const TZ = 'America/Lima';

const fmtHour = (iso) => new Intl.DateTimeFormat('es-PE', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit'
}).format(new Date(iso));

const fmtRun = (iso) => iso ? new Intl.DateTimeFormat('es-PE', {
  timeZone: TZ,
  hour: 'numeric', minute: '2-digit'
}).format(new Date(iso)) : '—';

const trendLabel = (trend) => trend === 'rising' ? 'Subiendo' : trend === 'falling' ? 'Bajando' : 'Estable';
const sportLabel = (sport) => sport === 'windsurf' ? 'Windsurf' : 'Kitesurf';

const windowLabel = (w) => {
  if (!w) return 'Próxima ventana';
  if (w.dayRelation === 'today') return w.fallback ? 'Mejor opción restante hoy' : 'Mejor ventana restante hoy';
  if (w.dayRelation === 'tomorrow') return w.fallback ? 'Mejor opción mañana' : 'Mejor ventana mañana';
  return w.fallback ? 'Próxima opción disponible' : 'Próxima buena ventana';
};

class KintiWindFloating extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._open = false;
    this._sport = this.getAttribute('sport') === 'windsurf' ? 'windsurf' : 'kite';
    this._payload = null;
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
      this._payload = payload;
      this.rebuild();
    } catch (error) {
      console.warn('[Kinti Wind] No se pudieron cargar los datos:', error);
      this.renderUnavailable();
    }
  }

  rebuild() {
    if (!this._payload) return;
    this._summary = buildWindSummary(this._payload, this._sport, new Date().toISOString());
    this.render();
  }

  scheduleHourlyRefresh() {
    const now = new Date();
    const next = new Date(now);
    next.setMinutes(60, 8, 0);
    const delay = Math.max(1000, next - now);
    this._refreshTimer = setTimeout(async () => {
      await this.load();
      this.scheduleHourlyRefresh();
    }, delay);
  }

  setSport(sport) {
    this._sport = sport === 'windsurf' ? 'windsurf' : 'kite';
    this.rebuild();
  }

  toggle(force) {
    this._open = typeof force === 'boolean' ? force : !this._open;
    this.render();
  }

  windSvg() {
    return `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M6 17h23c5 0 5-7 0-7-3 0-5 2-5 4M6 24h31c6 0 6 8 0 8-3 0-5-2-5-4M6 31h15" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>`;
  }

  styles() {
    return `
      :host{
        --kwf-sea:#3f9a98;--kwf-deep:#176b70;--kwf-ink:#172d2f;--kwf-muted:#6d7b78;
        --kwf-paper:#fffdf8;--kwf-sand:#f1ece1;--kwf-line:rgba(23,45,47,.12);--kwf-accent:#dcefbf;
        --kwf-bottom:88px;--kwf-right:22px;
        position:fixed;right:var(--kwf-right);bottom:var(--kwf-bottom);z-index:2147482999;
        font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        color:var(--kwf-ink);line-height:1.25;-webkit-font-smoothing:antialiased;
      }
      *,*::before,*::after{box-sizing:border-box}button{font:inherit}.wrap{display:grid;justify-items:end;gap:12px}
      .panel{width:min(390px,calc(100vw - 28px));max-height:min(670px,calc(100vh - 110px));overflow:auto;overscroll-behavior:contain;background:linear-gradient(145deg,var(--kwf-paper),var(--kwf-sand));border:1px solid rgba(255,255,255,.86);border-radius:26px;box-shadow:0 26px 70px rgba(28,45,43,.24);padding:20px;animation:pop .22s cubic-bezier(.2,.8,.2,1);transform-origin:right bottom}
      @keyframes pop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
      .top{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.eyebrow{display:flex;align-items:center;gap:8px;color:var(--kwf-muted);font-size:10px;font-weight:800;letter-spacing:.16em}.windmark{width:27px;height:27px;color:var(--kwf-sea)}.windmark svg{width:100%;height:100%}.title{margin:5px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:500;letter-spacing:-.025em}.score{min-width:64px;height:64px;border-radius:50%;background:var(--kwf-accent);display:grid;place-items:center;font-weight:850;font-size:20px}.score small{font-size:9px;margin-left:1px}.close{border:0;background:transparent;padding:3px;color:var(--kwf-muted);cursor:pointer;font-size:20px;line-height:1}
      .tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:14px;padding:4px;background:rgba(23,107,112,.07);border-radius:999px}.tab{border:0;background:transparent;color:var(--kwf-muted);border-radius:999px;padding:9px 12px;font-size:11px;font-weight:800;cursor:pointer}.tab.active{background:var(--kwf-paper);color:var(--kwf-deep);box-shadow:0 3px 12px rgba(23,45,47,.08)}
      .windhero{display:grid;grid-template-columns:1.15fr .85fr;gap:8px;margin-top:12px}.windnow,.direction{padding:16px;border-radius:18px;border:1px solid var(--kwf-line)}.windnow span,.direction span{display:block;font-size:10px;color:var(--kwf-muted);margin-bottom:4px}.windnow strong{font-size:31px;letter-spacing:-.04em}.windnow strong small{font-size:12px;letter-spacing:0}.windnow p,.direction p{margin:5px 0 0;color:var(--kwf-muted);font-size:10px}.direction strong{display:block;font-size:18px}.quality{margin-top:4px;font-size:9px!important;color:var(--kwf-deep)!important;font-weight:700}
      .window{margin-top:9px;padding:14px 16px;border-radius:18px;background:rgba(23,107,112,.065)}.window-label{display:block;color:var(--kwf-muted);font-size:10px;margin-bottom:3px}.window strong{display:block;font-size:21px;letter-spacing:-.03em}.window-note{margin:5px 0 0;color:var(--kwf-muted);font-size:10px}
      .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.metric{padding:11px 9px;border-radius:14px;border:1px solid var(--kwf-line);min-width:0}.metric span{display:block;color:var(--kwf-muted);font-size:9px;margin-bottom:4px}.metric b{display:block;font-size:13px;white-space:nowrap}.metric small{display:block;margin-top:2px;color:var(--kwf-muted);font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .timeline{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;align-items:end;min-height:93px;margin-top:14px;padding:12px 0 10px;border-top:1px solid var(--kwf-line);border-bottom:1px solid var(--kwf-line)}.hour{display:grid;grid-template-rows:56px auto auto;gap:2px;text-align:center;align-items:end;color:var(--kwf-muted)}.barbox{height:56px;display:flex;align-items:flex-end;justify-content:center}.bar{width:55%;max-width:18px;min-width:8px;min-height:7px;border-radius:10px 10px 4px 4px;background:rgba(63,154,152,.26)}.hour.now .bar{background:var(--kwf-sea)}.hour b,.hour small{font-size:9px}.hour.now b,.hour.now small{color:var(--kwf-deep);font-weight:850}
      .foot{display:flex;justify-content:space-between;gap:10px;margin-top:11px;color:var(--kwf-muted);font-size:9px}.disclaimer{margin:7px 0 0;color:var(--kwf-muted);font-size:9px;line-height:1.45}
      .trigger{border:1px solid rgba(255,255,255,.72);background:linear-gradient(135deg,#4ba9a4,var(--kwf-deep));color:white;min-height:54px;border-radius:999px;padding:9px 16px 9px 11px;display:flex;align-items:center;gap:10px;cursor:pointer;box-shadow:0 14px 38px rgba(21,74,75,.26);transition:transform .18s ease,box-shadow .18s ease}.trigger:hover{transform:translateY(-2px);box-shadow:0 18px 44px rgba(21,74,75,.33)}.trigger-icon{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12)}.trigger-icon svg{width:24px;height:24px}.trigger-copy{display:flex;flex-direction:column;align-items:flex-start;line-height:1.05}.trigger-copy b{font-size:13px}.trigger-copy small{margin-top:3px;font-size:9px;opacity:.84}.chev{font-size:12px;opacity:.8;margin-left:2px}.unavailable{width:min(330px,calc(100vw - 28px));padding:14px 16px;background:var(--kwf-paper);border-radius:18px;box-shadow:0 18px 50px rgba(28,45,43,.18);font-size:12px;color:var(--kwf-muted)}
      .trigger:focus-visible,.close:focus-visible,.tab:focus-visible{outline:3px solid rgba(220,239,191,.95);outline-offset:3px}
      @media(max-width:640px){:host{--kwf-right:14px;--kwf-bottom:80px}.panel{width:calc(100vw - 28px);border-radius:22px;padding:17px}.title{font-size:24px}.score{min-width:58px;height:58px;font-size:18px}.windnow strong{font-size:27px}.trigger{min-height:52px}}
      @media(prefers-reduced-motion:reduce){.panel{animation:none}.trigger{transition:none}}
    `;
  }

  renderLoading() {
    this.shadowRoot.innerHTML = `<style>${this.styles()}</style><div class="wrap"><button class="trigger" type="button"><span class="trigger-icon">${this.windSvg()}</span><span class="trigger-copy"><b>Viento ahora</b><small>Cargando condiciones…</small></span></button></div>`;
  }

  renderUnavailable() {
    this.shadowRoot.innerHTML = `<style>${this.styles()}</style><div class="wrap">${this._open ? `<div class="unavailable">El pronóstico de viento no está disponible en este momento. Intenta nuevamente en unos minutos.</div>` : ''}<button class="trigger" type="button" aria-expanded="${this._open}"><span class="trigger-icon">${this.windSvg()}</span><span class="trigger-copy"><b>Viento ahora</b><small>Datos temporalmente no disponibles</small></span><span class="chev">${this._open ? '⌄' : '⌃'}</span></button></div>`;
    this.shadowRoot.querySelector('.trigger')?.addEventListener('click', () => { this._open = !this._open; this.renderUnavailable(); });
  }

  render() {
    const data = this._summary;
    const current = data?.current;
    if (!current) return this.renderUnavailable();
    const best = data.windows?.[0];
    const second = data.windows?.[1];
    const currentMs = new Date(data.referenceTime).getTime();
    const timeline = data.hours.filter(h => new Date(h.timestamp).getTime() >= currentMs - 30 * 60 * 1000).slice(0, 7);
    const max = Math.max(1, ...timeline.map(h => h.score));
    const sourceAge = current.weatherDataAgeHours ?? 0;
    const confidence = sourceAge <= 6 ? 'alta' : sourceAge <= 12 ? 'normal' : 'reducida';
    const secondary = second ? `${second.dayRelation === 'tomorrow' ? 'Mañana' : 'Otra ventana'} ${fmtHour(second.start)}–${fmtHour(second.end)}` : '';
    const sourceRun = data.source?.weatherModelRun;

    const panel = this._open ? `
      <section class="panel" role="dialog" aria-label="Condiciones de viento en Máncora">
        <div class="top"><div><div class="eyebrow"><span class="windmark">${this.windSvg()}</span>VIENTO · MÁNCORA</div><h2 class="title">${current.rating.label}</h2></div><div style="display:flex;align-items:flex-start;gap:5px"><div class="score">${current.score}<small>/100</small></div><button class="close" type="button" aria-label="Cerrar">×</button></div></div>
        <div class="tabs"><button class="tab ${this._sport === 'kite' ? 'active' : ''}" data-sport="kite" type="button">KITESURF</button><button class="tab ${this._sport === 'windsurf' ? 'active' : ''}" data-sport="windsurf" type="button">WINDSURF</button></div>
        <div class="windhero">
          <div class="windnow"><span>Viento previsto ahora</span><strong>${current.windKnots?.toFixed(1) ?? '—'} <small>kt</small></strong><p>${current.windSpeedKmh?.toFixed(0) ?? '—'} km/h · rachas ${current.gustKnots?.toFixed(1) ?? '—'} kt</p></div>
          <div class="direction"><span>Dirección</span><strong>${windDirectionLabel(current.windDirectionDeg)} · ${Math.round(current.windDirectionDeg ?? 0)}°</strong><p class="quality">${current.directionQuality.label}</p></div>
        </div>
        <div class="window"><span class="window-label">${windowLabel(best)} · ${sportLabel(this._sport)}</span><strong>${best ? `${fmtHour(best.start)} — ${fmtHour(best.end)}` : 'Sin una ventana clara'}</strong>${secondary ? `<p class="window-note">${secondary}</p>` : ''}</div>
        <div class="metrics">
          <div class="metric"><span>Tendencia</span><b>${trendLabel(current.windTrend)}</b><small>próxima hora</small></div>
          <div class="metric"><span>Ráfagas</span><b>${current.gustKnots?.toFixed(1) ?? '—'} kt</b><small>modelo NOAA</small></div>
          <div class="metric"><span>Ola total</span><b>${current.waveHeightM?.toFixed(1) ?? '—'} m</b><small>Copernicus</small></div>
        </div>
        <div class="timeline" aria-label="Puntuación de viento próximas horas">${timeline.map((h, i) => `<div class="hour ${i === 0 ? 'now' : ''}"><div class="barbox"><i class="bar" style="height:${Math.max(10, Math.round(h.score / max * 100))}%"></i></div><b>${h.windKnots?.toFixed(0) ?? '—'}kt</b><small>${fmtHour(h.timestamp).replace(':00','')}</small></div>`).join('')}</div>
        <div class="foot"><span>NOAA GFS · confianza ${confidence}</span><span>Modelo ${fmtRun(sourceRun)}</span></div>
        <p class="disclaimer">Pronóstico orientativo de viento, no una medición de una estación en la playa. Antes de navegar, verifica las condiciones locales, tu nivel, el estado del mar y las indicaciones de escuelas o riders locales.</p>
      </section>` : '';

    this.shadowRoot.innerHTML = `<style>${this.styles()}</style><div class="wrap">${panel}<button class="trigger" type="button" aria-expanded="${this._open}"><span class="trigger-icon">${this.windSvg()}</span><span class="trigger-copy"><b>Viento ahora</b><small>${current.windKnots?.toFixed(0) ?? '—'} kt · ${windDirectionLabel(current.windDirectionDeg)} · ${current.rating.label}</small></span><span class="chev">${this._open ? '⌄' : '⌃'}</span></button></div>`;

    this.shadowRoot.querySelector('.trigger')?.addEventListener('click', () => this.toggle());
    this.shadowRoot.querySelector('.close')?.addEventListener('click', () => this.toggle(false));
    this.shadowRoot.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => this.setSport(btn.dataset.sport)));
  }
}

if (!customElements.get('kinti-wind-floating')) customElements.define('kinti-wind-floating', KintiWindFloating);
