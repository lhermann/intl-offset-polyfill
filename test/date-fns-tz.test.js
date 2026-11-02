// The bug that started this: @date-fns/tz reads every zone offset from longOffset, so on
// old runtimes all its zoned math is NaN. A file of its own: @date-fns/tz caches one
// formatter per zone, so the legacy runtime must be in place before it first runs.
import { describe, test, expect, afterAll } from 'vitest'
import { simulateLegacyRuntime } from './legacy.js'

const restore = simulateLegacyRuntime()
const { tzOffset, TZDate } = await import('@date-fns/tz')

describe('@date-fns/tz', () => {
  afterAll(() => restore())

  test('is broken on a legacy runtime', () => {
    expect(tzOffset('Asia/Kolkata', new Date('2026-01-15T12:00:00Z'))).toBeNaN()
  })

  test('works once polyfilled', async () => {
    const { polyfill } = await import('../src/index.js')
    expect(polyfill()).toBe(true)
    // Fresh zones: the broken lookup above may be cached for Asia/Kolkata
    expect(tzOffset('America/St_Johns', new Date('2026-01-15T12:00:00Z'))).toBe(-210)
    expect(tzOffset('Europe/Berlin', new Date('2026-07-15T12:00:00Z'))).toBe(120)
    expect(new TZDate(2026, 0, 15, 9, 0, 'Asia/Tokyo').toISOString()).toBe('2026-01-15T09:00:00.000+09:00')
  })
})
