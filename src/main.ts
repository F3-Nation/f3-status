import './style.css'
import { services, type ServiceResult, type ServiceStatus } from './services'
import { checkService, aggregateStatus } from './checker'

// ─── Constants ──────────────────────────────────────────────────────

const AUTO_REFRESH_MS = 60_000 // re-check every 60 seconds

// ─── State ──────────────────────────────────────────────────────────

const results = new Map<string, ServiceResult>()
let isChecking = false
let refreshTimer: ReturnType<typeof setInterval> | null = null

// ─── Bootstrap DOM ──────────────────────────────────────────────────

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app container')

app.innerHTML = `
  <div class="app">
    <header class="top-bar">
      <div class="brand">
        <svg class="brand-logo" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <rect width="40" height="40" rx="8" fill="#B70D06"/>
          <text x="20" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="20" fill="#fff">F3</text>
        </svg>
        <div class="brand-text">
          <div class="brand-title">F3 Nation Status</div>
          <div class="brand-subtitle">status.f3nation.com</div>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn-refresh" id="btn-refresh" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          Refresh
        </button>
      </div>
    </header>

    <main class="content">
      <div class="status-banner is-checking" id="status-banner">
        <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="status-icon">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <div id="status-text">Checking services…</div>
          <div class="status-banner-sub" id="status-sub"></div>
        </div>
      </div>

      <div class="services-heading">Services</div>
      <div class="service-list" id="service-list"></div>

      <div class="last-checked" id="last-checked"></div>

      <section class="help-section">
        <h2 class="help-title">Need Help?</h2>

        <div class="help-item">
          <div class="help-q">What does this page show?</div>
          <div class="help-a">
            This page performs real-time health checks on F3 Nation's core services every 60 seconds.
            When you load the page, your browser directly pings each service and reports back the result.
          </div>
        </div>

        <div class="help-item">
          <div class="help-q">A service shows "Degraded" — what does that mean?</div>
          <div class="help-a">
            The service responded but something was unexpected — it might be slow, returning partial data,
            or a CORS restriction prevented full verification. The service is likely still functional.
          </div>
        </div>

        <div class="help-item">
          <div class="help-q">A service shows "Down" — what should I do?</div>
          <div class="help-a">
            Wait a minute and hit <strong>Refresh</strong>. If the issue persists, reach out in the
            <strong>#tech</strong> channel on F3 Nation Slack or email
            <a href="mailto:it@f3nation.com">it@f3nation.com</a>.
          </div>
        </div>

        <div class="help-item">
          <div class="help-q">How are checks performed?</div>
          <div class="help-a">
            Each check runs directly from your browser. The Slack App endpoint is checked for
            a "Service is running" response; the API is pinged for a JSON alive status;
            Slack's public status API is queried; and the Map is verified for an HTTP 200 response.
          </div>
        </div>

        <div class="help-item">
          <div class="help-q">Where can I find F3 resources?</div>
          <div class="help-a">
            <a href="https://f3nation.com" target="_blank" rel="noopener">f3nation.com</a> ·
            <a href="https://map.f3nation.com" target="_blank" rel="noopener">Workout Map</a> ·
            <a href="https://f3nation.com/about" target="_blank" rel="noopener">About F3</a>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div>
        <a href="https://f3nation.com" target="_blank" rel="noopener">F3 Nation</a> ·
        <a href="https://map.f3nation.com" target="_blank" rel="noopener">Map</a> ·
        <a href="https://github.com/F3-Nation" target="_blank" rel="noopener">GitHub</a>
      </div>
      <div>F3 — Fitness, Fellowship, Faith. Free to all men. Peer-led. Held outdoors. Open to all.</div>
    </footer>
  </div>
`

// ─── Element references ─────────────────────────────────────────────

const serviceListEl = document.querySelector<HTMLDivElement>('#service-list')!
const statusBannerEl = document.querySelector<HTMLDivElement>('#status-banner')!
const statusTextEl = document.querySelector<HTMLDivElement>('#status-text')!
const statusSubEl = document.querySelector<HTMLDivElement>('#status-sub')!
const statusIconEl = document.querySelector<SVGElement>('#status-icon')!
const lastCheckedEl = document.querySelector<HTMLDivElement>('#last-checked')!
const btnRefresh = document.querySelector<HTMLButtonElement>('#btn-refresh')!

// ─── Render functions ───────────────────────────────────────────────

function renderServiceList() {
  serviceListEl.innerHTML = services
    .map((svc) => {
      const res = results.get(svc.id)
      const status: ServiceStatus = res?.status ?? 'checking'
      const latency = res?.latencyMs != null ? `${res.latencyMs}ms` : '—'
      const detail = res?.detail ?? 'Waiting…'
      const displayUrl = svc.url.replace(/^https?:\/\//, '')

      return `
        <div class="service-card" data-service="${svc.id}">
          <div class="service-indicator is-${status}" title="${status}"></div>
          <div class="service-info">
            <div class="service-name">${svc.name}</div>
            <a class="service-url" href="${svc.url}" target="_blank" rel="noopener">${displayUrl}</a>
            <div class="service-detail" title="${escapeAttr(detail)}">${escapeHtml(detail)}</div>
          </div>
          <div class="service-meta">
            <div class="service-status-label is-${status}">${formatStatus(status)}</div>
            <div class="service-latency">${latency}</div>
          </div>
        </div>
      `
    })
    .join('')
}

function renderBanner() {
  const overall = results.size > 0 ? aggregateStatus(results) : 'checking' as ServiceStatus

  // Remove old state class
  statusBannerEl.className = 'status-banner'
  statusBannerEl.classList.add(`is-${overall}`)

  statusTextEl.textContent = bannerText(overall)
  statusSubEl.textContent = bannerSub(overall)
  statusIconEl.innerHTML = statusSvgInner(overall)
}

function renderLastChecked() {
  const dates = [...results.values()].map((r) => r.checkedAt.getTime())
  if (dates.length === 0) {
    lastCheckedEl.textContent = ''
    return
  }
  const latest = new Date(Math.max(...dates))
  lastCheckedEl.textContent = `Last checked: ${latest.toLocaleTimeString()} — auto-refreshes every 60s`
}

// ─── Check orchestration ────────────────────────────────────────────

async function runAllChecks() {
  if (isChecking) return
  isChecking = true
  btnRefresh.disabled = true
  btnRefresh.classList.add('is-spinning')

  // Set all to "checking" first
  for (const svc of services) {
    if (!results.has(svc.id)) {
      results.set(svc.id, { status: 'checking', latencyMs: null, detail: 'Checking…', checkedAt: new Date() })
    }
  }
  renderServiceList()
  renderBanner()

  // Run all checks concurrently
  const promises = services.map(async (svc) => {
    const res = await checkService(svc)
    results.set(svc.id, res)
    // Re-render incrementally as each completes
    renderServiceList()
    renderBanner()
    renderLastChecked()
  })

  await Promise.allSettled(promises)

  isChecking = false
  btnRefresh.disabled = false
  btnRefresh.classList.remove('is-spinning')
}

// ─── Event handlers ─────────────────────────────────────────────────

btnRefresh.addEventListener('click', () => {
  runAllChecks()
})

// ─── Init ───────────────────────────────────────────────────────────

renderServiceList()
runAllChecks()

refreshTimer = setInterval(() => {
  runAllChecks()
}, AUTO_REFRESH_MS)

// Cleanup on page hide (not strictly needed for a status page but good hygiene)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  } else if (!document.hidden && !refreshTimer) {
    runAllChecks()
    refreshTimer = setInterval(() => runAllChecks(), AUTO_REFRESH_MS)
  }
})

// ─── Utilities ──────────────────────────────────────────────────────

function formatStatus(s: ServiceStatus): string {
  switch (s) {
    case 'operational': return 'Operational'
    case 'degraded':    return 'Degraded'
    case 'down':        return 'Down'
    case 'checking':    return 'Checking…'
  }
}

function bannerText(s: ServiceStatus): string {
  switch (s) {
    case 'operational': return 'All Systems Operational'
    case 'degraded':    return 'Some Systems Degraded'
    case 'down':        return 'Service Disruption Detected'
    case 'checking':    return 'Checking services…'
  }
}

function bannerSub(s: ServiceStatus): string {
  const count = results.size
  const ok = [...results.values()].filter((r) => r.status === 'operational').length
  if (s === 'checking') return ''
  return `${ok} of ${count} services operational`
}

function statusSvgInner(s: ServiceStatus): string {
  switch (s) {
    case 'operational':
      return '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
    case 'degraded':
      return '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
    case 'down':
      return '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
    case 'checking':
      return '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>'
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Expose for testing
export { runAllChecks, results, formatStatus }
