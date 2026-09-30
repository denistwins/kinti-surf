import { buildSurfSummary } from './surf-engine.js';

const fmtHour = (iso) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
const fmtShortHour = (iso) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', hour12: false }).format(new Date(iso));
const dir16 = (deg) => {
  if (deg == null) return '—';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return dirs[Math.round((((deg%360)+360)%360)/22.5)%16];
};

class KintiSurfWidget extends HTMLElement {
  async connectedCallback() {
    this.innerHTML = `<div class="ksw-shell ksw-loading">Cargando condiciones de surf…</div>`;
    let raw;
    try {
      const src = this.getAttribute('data-src') || './data/surf-data.json';
      const r = await fetch(src, { cache: 'no-store' });
      if (!r.ok) throw new Error('No se pudo cargar surf-data.json');
      raw = await r.json();
    } catch (e) {
      raw = window.KINTI_SURF_DEMO;
    }
    if (!raw) {
      this.innerHTML = `<div class="ksw-shell">No hay datos disponibles.</div>`;
      return;
    }
    this.render(buildSurfSummary(raw));
  }

  render(data) {
    const best = data.windows[0];
    const second = data.windows[1];
    const current = data.current;
    const visibleHours = data.hours.filter(h => {
      const local = Number(fmtShortHour(h.timestamp));
      return local >= 6 && local <= 18;
    });
    const max = Math.max(...visibleHours.map(h=>h.score), 1);
    const sourceLabel = data.source?.mode === 'demo' ? 'Datos de demostración' : 'Copernicus Marine + NOAA GFS';
    const freshest = Math.max(current?.waveDataAgeHours ?? 0, current?.weatherDataAgeHours ?? 0);
    const freshness = freshest <= 6 ? 'alta' : freshest <= 12 ? 'normal' : 'reducida';

    this.innerHTML = `
      <article class="ksw-shell" aria-label="Condiciones de surf en Máncora">
        <header class="ksw-header">
          <div>
            <div class="ksw-eyebrow"><span class="ksw-dot"></span> SURF · MÁNCORA</div>
            <h2>${best ? best.rating.label : current.rating.label}</h2>
          </div>
          <div class="ksw-score" title="Kinti Surf Score actual">${current.score}<small>/100</small></div>
        </header>

        <section class="ksw-hero">
          <span class="ksw-caption">${best?.fallback ? 'Mejor momento disponible' : 'Mejor ventana de hoy'}</span>
          <strong>${best ? `${fmtHour(best.start)} — ${fmtHour(best.end)}` : 'Sin una ventana clara'}</strong>
          ${second ? `<p>Otra buena ventana: <b>${fmtHour(second.start)} — ${fmtHour(second.end)}</b></p>` : ''}
        </section>

        <section class="ksw-metrics">
          <div><span>🌊</span><b>${current.swellHeightM?.toFixed(1) ?? '—'} m</b><small>${current.swellPeriodS?.toFixed(0) ?? '—'} s · ${dir16(current.swellDirectionDeg)}</small></div>
          <div><span>💨</span><b>${Math.round(current.windSpeedKmh ?? 0)} km/h</b><small>${dir16(current.windDirectionDeg)}${current.gustKmh ? ` · rachas ${Math.round(current.gustKmh)}` : ''}</small></div>
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
          <span>Consulta Kinti: ${fmtHour(data.generatedAt)}</span>
        </footer>
        <p class="ksw-disclaimer">Pronóstico orientativo basado en modelos oceanográficos y meteorológicos; las condiciones locales reales pueden variar.</p>
      </article>`;
  }
}

customElements.define('kinti-surf-widget', KintiSurfWidget);
