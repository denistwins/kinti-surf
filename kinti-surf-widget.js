import { buildSurfSummary } from './surf-engine.js';

const fmtHour = (iso) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const fmtShortHour = (iso) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', hour12: false }).format(new Date(iso));
const localDateKey = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(iso));
const dir16 = (deg) => {
  if (deg == null) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return dirs[Math.round((((deg%360)+360)%360)/22.5)%16];
};

function windowCaption(window) {
  if (!window) return 'Sin una ventana clara';
  if (window.dayRelation === 'today') return window.fallback ? 'Mejor momento restante hoy' : 'Mejor ventana de hoy';
  if (window.dayRelation === 'tomorrow') return window.fallback ? 'Mejor momento disponible mañana' : 'Mejor ventana de mañana';
  return window.fallback ? 'Próximo momento favorable' : 'Próxima buena ventana';
}

function secondWindowLabel(window) {
  if (!window) return '';
  if (window.dayRelation === 'today') return 'Otra ventana hoy';
  if (window.dayRelation === 'tomorrow') return 'Mañana';
  return 'Más adelante';
}

class KintiSurfWidget extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="ksw-shell ksw-loading">Cargando condiciones de surf…</div>`;
    this.loadAndRender(true);
    // The data source may only be rebuilt every ~3 hours, but the widget
    // re-reads it every hour and recalculates which forecast hour is "now".
    this._refreshTimer = setInterval(() => this.loadAndRender(false), 60 * 60 * 1000);
  }

  disconnectedCallback() {
    if (this._refreshTimer) clearInterval(this._refreshTimer);
  }

  async loadAndRender(initial = false) {
    let raw;
    try {
      const src = this.getAttribute('data-src') || './data/surf-data.json';
      const url = new URL(src, document.baseURI);
      url.searchParams.set('_ksw', Date.now().toString());
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error('No se pudo cargar surf-data.json');
      raw = await r.json();
      this._lastRaw = raw;
      this._lastFetchedAt = new Date().toISOString();
    } catch (e) {
      if (this._lastRaw) {
        raw = this._lastRaw;
      } else {
        raw = window.KINTI_SURF_DEMO;
      }
    }

    if (!raw) {
      if (initial) this.innerHTML = `<div class="ksw-shell">No hay datos disponibles.</div>`;
      return;
    }

    // Important: use the visitor's current clock, not generatedAt, so the
    // hourly widget refresh advances through an older but still valid forecast.
    this.render(buildSurfSummary(raw, new Date().toISOString()));
  }

  render(data) {
    const best = data.windows[0];
    const second = data.windows[1];
    const current = data.current;
    const currentDate = localDateKey(current.timestamp);
    let visibleHours = data.hours.filter(h => {
      const local = Number(fmtShortHour(h.timestamp));
      return localDateKey(h.timestamp) === currentDate && local >= 6 && local <= 18;
    });
    if (!visibleHours.length) {
      const nextDayPoint = data.hours.find(h => {
        const local = Number(fmtShortHour(h.timestamp));
        return new Date(h.timestamp) > new Date(data.referenceTime) && local >= 6 && local <= 18;
      });
      if (nextDayPoint) {
        const nextDate = localDateKey(nextDayPoint.timestamp);
        visibleHours = data.hours.filter(h => {
          const local = Number(fmtShortHour(h.timestamp));
          return localDateKey(h.timestamp) === nextDate && local >= 6 && local <= 18;
        });
      }
    }
    const max = Math.max(...visibleHours.map(h=>h.score), 1);
    const sourceLabel = data.source?.mode === 'demo' ? 'Datos de demostración' : 'Copernicus Marine + NOAA GFS';
    const knownAges = [current?.waveDataAgeHours, current?.weatherDataAgeHours].filter(v => Number.isFinite(v));
    const freshest = knownAges.length ? Math.max(...knownAges) : null;
    const freshness = freshest == null ? 'antigüedad no informada' : freshest <= 6 ? 'alta' : freshest <= 12 ? 'normal' : 'reducida';
    const gustText = Number.isFinite(current.gustKmh) && current.gustKmh > (current.windSpeedKmh ?? 0)
      ? ` · rachas ${Math.round(current.gustKmh)}` : '';

    this.innerHTML = `
      <article class="ksw-shell" aria-label="Condiciones de surf en Máncora">
        <header class="ksw-header">
          <div>
            <div class="ksw-eyebrow"><span class="ksw-dot"></span> SURF · MÁNCORA</div>
            <h2>${current.rating.label}</h2>
          </div>
          <div class="ksw-score" title="Kinti Surf Score actual">${current.score}<small>/100</small></div>
        </header>

        <section class="ksw-hero">
          <span class="ksw-caption">${windowCaption(best)}</span>
          <strong>${best ? `${fmtHour(best.start)} — ${fmtHour(best.end)}` : 'Sin una ventana clara'}</strong>
          ${best ? `<p>${best.rating.label} · promedio ${best.averageScore}/100${best.fallback ? ' · mejor opción disponible' : ''}</p>` : ''}
          ${second ? `<p>${secondWindowLabel(second)}: <b>${fmtHour(second.start)} — ${fmtHour(second.end)}</b></p>` : ''}
        </section>

        <section class="ksw-metrics">
          <div><span>🌊</span><b>${current.swellHeightM?.toFixed(1) ?? '—'} m</b><small>${current.swellPeriodS?.toFixed(0) ?? '—'} s · ${dir16(current.swellDirectionDeg)}</small></div>
          <div><span>💨</span><b>${Math.round(current.windSpeedKmh ?? 0)} km/h</b><small>${dir16(current.windDirectionDeg)}${gustText}</small></div>
          <div><span>◒</span><b>${current.tideTrend === 'falling' ? 'Bajando' : current.tideTrend === 'rising' ? 'Subiendo' : 'Estable'}</b><small>Marea</small></div>
        </section>

        <section class="ksw-timeline" aria-label="Puntuación por hora">
          ${visibleHours.map(h=>`<div class="ksw-hour ${h.timestamp===current.timestamp?'is-now':''}">
              <div class="ksw-barwrap"><i style="height:${Math.max(8, Math.round((h.score/max)*100))}%"></i></div>
              <b>${h.score}</b><small>${fmtShortHour(h.timestamp)}</small>
            </div>`).join('')}
        </section>

        <details class="ksw-details">
          <summary>Ver cómo se calcula</summary>
          <div class="ksw-detail-grid">
            <span>Swell</span><b>${Math.round(current.components.swellDirection + current.components.swellPeriod + current.components.swellHeight)}/40</b>
            <span>Viento</span><b>${Math.round(current.components.windDirection + current.components.windSpeed)}/30</b>
            <span>Marea + corriente</span><b>${Math.round(current.components.tide + current.components.current)}/20</b>
            <span>Estabilidad</span><b>${Math.round(current.components.stability)}/10</b>
          </div>
        </details>

        <footer class="ksw-footer">
          <span>${sourceLabel} · confianza ${freshness}</span>
          <span>Datos ${fmtHour(data.generatedAt)} · widget ${fmtHour(this._lastFetchedAt || data.referenceTime)}</span>
        </footer>
        <p class="ksw-disclaimer">Pronóstico orientativo basado en modelos oceanográficos y meteorológicos; las condiciones locales reales pueden variar.</p>
      </article>`;
  }
}

customElements.define('kinti-surf-widget', KintiSurfWidget);
