// Service definitions for F3 Nation status monitoring

export type ServiceStatus = 'operational' | 'degraded' | 'down' | 'checking'

export type CheckType = 'text-match' | 'json' | 'http-ok' | 'slack-status-api'

export interface ServiceResult {
  status: ServiceStatus
  latencyMs: number | null
  detail: string
  checkedAt: Date
}

export interface ServiceDefinition {
  id: string
  name: string
  url: string
  checkType: CheckType
  /** For text-match: expected substring in response body */
  expectedText?: string
  /** Description shown in the UI */
  description: string
}

export const services: ServiceDefinition[] = [
  {
    id: 'slackbot',
    name: 'F3 Nation Slack App',
    url: 'https://slackbot.f3nation.com/',
    checkType: 'text-match',
    expectedText: 'Service is running',
    description: 'Manages F3 workouts, attendance, and Slack integrations.',
  },
  {
    id: 'slack',
    name: 'Slack',
    url: 'https://slack-status.com/api/v2.0.0/current',
    checkType: 'slack-status-api',
    description: 'Slack messaging platform used for F3 communication.',
  },
  {
    id: 'api',
    name: 'F3 Nation API',
    url: 'https://api.f3nation.com/v1/ping',
    checkType: 'json',
    description: 'Core API powering the F3 ecosystem.',
  },
  {
    id: 'map',
    name: 'F3 Nation Map',
    url: 'https://map.f3nation.com',
    checkType: 'http-ok',
    description: 'Interactive map of F3 workout locations worldwide.',
  },
]
