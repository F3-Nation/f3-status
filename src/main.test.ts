import { describe, it, expect, vi, afterEach } from 'vitest'
import { services, type ServiceDefinition } from './services'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('services', () => {
  it('has all required services defined', () => {
    const ids = services.map((s) => s.id)
    expect(ids).toContain('slackbot')
    expect(ids).toContain('slack')
    expect(ids).toContain('api')
    expect(ids).toContain('map')
  })

  it('each service has valid fields', () => {
    for (const svc of services) {
      expect(svc.name).toBeTruthy()
      expect(svc.url).toMatch(/^https?:\/\//)
      expect(svc.checkType).toBeTruthy()
      expect(svc.description).toBeTruthy()
    }
  })
})

describe('aggregateStatus', () => {
  it('returns operational when all services are operational', async () => {
    const { aggregateStatus } = await import('./checker')
    const results = new Map([
      ['a', { status: 'operational' as const, latencyMs: 100, detail: 'ok', checkedAt: new Date() }],
      ['b', { status: 'operational' as const, latencyMs: 50, detail: 'ok', checkedAt: new Date() }],
    ])
    expect(aggregateStatus(results)).toBe('operational')
  })

  it('returns degraded when any service is degraded', async () => {
    const { aggregateStatus } = await import('./checker')
    const results = new Map([
      ['a', { status: 'operational' as const, latencyMs: 100, detail: 'ok', checkedAt: new Date() }],
      ['b', { status: 'degraded' as const, latencyMs: 50, detail: 'slow', checkedAt: new Date() }],
    ])
    expect(aggregateStatus(results)).toBe('degraded')
  })

  it('returns down when any service is down', async () => {
    const { aggregateStatus } = await import('./checker')
    const results = new Map([
      ['a', { status: 'down' as const, latencyMs: null, detail: 'timeout', checkedAt: new Date() }],
      ['b', { status: 'operational' as const, latencyMs: 50, detail: 'ok', checkedAt: new Date() }],
    ])
    expect(aggregateStatus(results)).toBe('down')
  })
})

describe('checkService json checks', () => {
  it('accepts { alive: true } API responses as operational', async () => {
    const { checkService } = await import('./checker')

    const service: ServiceDefinition = {
      id: 'api-test',
      name: 'API Test',
      url: 'https://api.example.com/ping',
      checkType: 'json',
      description: 'test service',
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ alive: true, timestamp: '2026-03-08T18:23:40.015Z' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await checkService(service)

    expect(result.status).toBe('operational')
    expect(result.detail).toContain('alive')
    expect(result.detail).toContain('2026-03-08T18:23:40.015Z')
  })
})
