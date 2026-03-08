// Health-check logic for each service type

import type { ServiceDefinition, ServiceResult, ServiceStatus } from './services'

const CHECK_TIMEOUT_MS = 15_000

/**
 * Run a health check for a single service.
 * Returns the result including status, latency, and detail text.
 */
export async function checkService(service: ServiceDefinition): Promise<ServiceResult> {
  const start = performance.now()
  try {
    switch (service.checkType) {
      case 'text-match':
        return await checkTextMatch(service, start)
      case 'json':
        return await checkJson(service, start)
      case 'http-ok':
        return await checkHttpOk(service, start)
      case 'slack-status-api':
        return await checkSlackStatus(service, start)
      default:
        return result('down', null, 'Unknown check type.', start)
    }
  } catch (err) {
    const latency = Math.round(performance.now() - start)
    const message = err instanceof Error ? err.message : String(err)

    // If the error is a CORS / network error, try a no-cors fallback for
    // connectivity checks so we can at least say "reachable".
    if (service.checkType === 'http-ok' || service.checkType === 'text-match') {
      try {
        const fallback = await fetchWithTimeout(service.url, { mode: 'no-cors' })
        if (fallback.type === 'opaque') {
          const fbLatency = Math.round(performance.now() - start)
          if (service.checkType === 'text-match') {
            return result('degraded', fbLatency, 'Reachable but response could not be verified (CORS).', start)
          }
          return result('operational', fbLatency, 'Reachable (HTTP response received).', start)
        }
      } catch {
        // fallback also failed — truly down
      }
    }

    return result('down', latency, `Error: ${message}`, start)
  }
}

// ─── Check implementations ────────────────────────────────────────────

async function checkTextMatch(
  service: ServiceDefinition,
  start: number,
): Promise<ServiceResult> {
  const res = await fetchWithTimeout(service.url)
  const latency = Math.round(performance.now() - start)
  const text = await res.text()

  if (!res.ok) {
    return result('down', latency, `HTTP ${res.status} ${res.statusText}`, start)
  }
  if (service.expectedText && text.includes(service.expectedText)) {
    return result('operational', latency, service.expectedText, start)
  }
  return result('degraded', latency, `Response did not contain expected text.`, start)
}

async function checkJson(
  service: ServiceDefinition,
  start: number,
): Promise<ServiceResult> {
  const res = await fetchWithTimeout(service.url)
  const latency = Math.round(performance.now() - start)

  if (!res.ok) {
    return result('down', latency, `HTTP ${res.status} ${res.statusText}`, start)
  }

  const json = await res.json()
  // API /ping should return { status: "alive", timestamp: "..." }
  if (json && (json.status === 'alive' || json.status === 'ok')) {
    const ts = json.timestamp ? ` @ ${json.timestamp}` : ''
    return result('operational', latency, `${json.status}${ts}`, start)
  }

  return result('degraded', latency, `Unexpected JSON response: ${JSON.stringify(json).slice(0, 120)}`, start)
}

async function checkHttpOk(
  service: ServiceDefinition,
  start: number,
): Promise<ServiceResult> {
  const res = await fetchWithTimeout(service.url)
  const latency = Math.round(performance.now() - start)

  if (res.ok) {
    return result('operational', latency, `HTTP ${res.status} OK`, start)
  }
  if (res.status >= 500) {
    return result('down', latency, `HTTP ${res.status} ${res.statusText}`, start)
  }
  return result('degraded', latency, `HTTP ${res.status} ${res.statusText}`, start)
}

interface SlackCurrentStatus {
  status: string
  date_created: string
  date_updated: string
  active_incidents: Array<{
    title?: string
    type?: string
    status?: string
    date_created?: string
    services?: string[]
    notes?: Array<{ body?: string }>
  }>
}

async function checkSlackStatus(
  service: ServiceDefinition,
  start: number,
): Promise<ServiceResult> {
  const res = await fetchWithTimeout(service.url)
  const latency = Math.round(performance.now() - start)

  if (!res.ok) {
    return result('down', latency, `HTTP ${res.status} ${res.statusText}`, start)
  }

  const json: SlackCurrentStatus = await res.json()

  if (json.status === 'ok' && (!json.active_incidents || json.active_incidents.length === 0)) {
    return result('operational', latency, 'All Slack services operational.', start)
  }

  if (json.status === 'ok' && json.active_incidents && json.active_incidents.length > 0) {
    const summary = json.active_incidents
      .map((inc) => `${inc.title ?? 'Incident'} (${inc.status ?? 'active'})`)
      .join('; ')
    return result('degraded', latency, summary, start)
  }

  if (json.active_incidents && json.active_incidents.length > 0) {
    const hasOutage = json.active_incidents.some((inc) => inc.type === 'outage')
    const summary = json.active_incidents
      .map((inc) => `${inc.title ?? 'Incident'} (${inc.type ?? 'unknown'})`)
      .join('; ')
    return result(hasOutage ? 'down' : 'degraded', latency, summary, start)
  }

  return result('operational', latency, `Slack status: ${json.status}`, start)
}

// ─── Helpers ──────────────────────────────────────────────────────────

function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

function result(
  status: ServiceStatus,
  latencyMs: number | null,
  detail: string,
  _start: number,
): ServiceResult {
  return { status, latencyMs, detail, checkedAt: new Date() }
}

/**
 * Compute an overall aggregate status from individual results.
 */
export function aggregateStatus(results: Map<string, ServiceResult>): ServiceStatus {
  let hasDown = false
  let hasDegraded = false
  let hasChecking = false

  for (const r of results.values()) {
    if (r.status === 'down') hasDown = true
    if (r.status === 'degraded') hasDegraded = true
    if (r.status === 'checking') hasChecking = true
  }

  if (hasDown) return 'down'
  if (hasDegraded) return 'degraded'
  if (hasChecking) return 'checking'
  return 'operational'
}
