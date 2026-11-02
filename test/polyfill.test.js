import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { polyfill, shouldPolyfill, missingStyles } from '../src/index.js'
import { simulateLegacyRuntime } from './legacy.js'

const Native = Intl.DateTimeFormat
const nativeToLocale = {
  toLocaleString: Date.prototype.toLocaleString,
  toLocaleDateString: Date.prototype.toLocaleDateString,
  toLocaleTimeString: Date.prototype.toLocaleTimeString,
}

const STYLES = ['longOffset', 'shortOffset']
const ZONES = [
  'UTC', 'Europe/Berlin', 'America/Los_Angeles', 'America/St_Johns', 'Asia/Kolkata', 'Asia/Kathmandu',
  'Australia/Lord_Howe', 'Pacific/Chatham', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Africa/Monrovia',
]
const DATES = [
  '2026-03-29T00:59:59Z', // the second before Berlin's DST change
  '2026-03-29T01:00:00Z',
  '2026-11-01T09:30:00Z', // Los Angeles' DST change
  '2026-01-15T23:59:59.999Z',
  '1969-07-20T20:17:00.500Z', // before the epoch
  '1970-01-01T12:00:00Z', // Monrovia at GMT-0:44:30
  '1800-06-01T12:00:00Z', // local mean time, offsets in seconds
  '2100-12-31T12:00:00Z',
].map((s) => new Date(s))
const LOCALES = ['en-US', 'de-DE', 'en-GB', 'fr-FR', 'ja-JP', 'zh-CN', 'ru-RU', 'hi-IN', 'ar-EG', 'fa-IR', 'th-TH-u-nu-thai', 'he-IL']
const OPTIONS = [
  {},
  { hour: 'numeric', minute: 'numeric' },
  { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
  { weekday: 'short', hour: 'numeric' },
]

// he-IL: ICU puts two left-to-right marks after a negative offset, but only one after the
// 'short' name of Etc/GMT+5 that the locale template is read from.
const knownDifference = (locale, actual, expected) => locale === 'he-IL' && actual === expected.replace('‎‎', '‎')

function* cases () {
  for (const timeZoneName of STYLES) for (const locale of LOCALES) for (const timeZone of ZONES) for (const extra of OPTIONS) {
    yield { locale, options: { ...extra, timeZone, timeZoneName } }
  }
}

describe('on a runtime with offset styles', () => {
  test('there is nothing to do', () => {
    expect(missingStyles()).toEqual([])
    expect(shouldPolyfill()).toBe(false)
    expect(polyfill()).toBe(false)
    expect(Intl.DateTimeFormat).toBe(Native)
  })
})

describe('on a runtime without offset styles', () => {
  let expected, restore
  beforeAll(() => {
    expected = [...cases()].map(({ locale, options }) => {
      const native = new Native(locale, options)
      return DATES.map((d) => ({ format: native.format(d), parts: native.formatToParts(d) }))
    })
    restore = simulateLegacyRuntime()
    expect(missingStyles()).toEqual(STYLES)
    expect(polyfill()).toBe(true)
  })
  afterAll(() => restore())

  // Compares every case; `pick` chooses which cases must match and what has to be equal.
  function compare (pick) {
    const mismatches = []
    let compared = 0
    ;[...cases()].forEach(({ locale, options }, i) => {
      if (!pick.when(locale, options)) return
      const format = new Intl.DateTimeFormat(locale, options)
      DATES.forEach((d, j) => {
        compared++
        for (const [got, want] of pick.values(format, d, expected[i][j])) {
          if (got !== want && !knownDifference(locale, got, want)) mismatches.push({ locale, options, date: d.toISOString(), got, want })
        }
      })
    })
    return { compared, mismatches }
  }
  const zoneName = (parts) => parts.find((p) => p.type === 'timeZoneName').value

  test('the zone name matches native, for every locale, zone, date and option', () => {
    const { compared, mismatches } = compare({
      when: () => true,
      values: (format, d, want) => [[zoneName(format.formatToParts(d)), zoneName(want.parts)]],
    })
    expect(compared).toBe(STYLES.length * LOCALES.length * ZONES.length * OPTIONS.length * DATES.length)
    expect(mismatches).toEqual([])
  })

  // The rest of the layout comes from the runtime's 'short' formatter. For some locales and
  // field mixes ICU picks a different pattern when the zone is an offset (ja-JP "00時59分"
  // instead of "00:59", de-DE "05:29:59" instead of "5:29:59"). Copying that would take
  // CLDR's pattern data, so only the shapes libraries use must match in full.
  test('the whole output matches native for the default fields and for hour and minute', () => {
    const { compared, mismatches } = compare({
      when: (locale, options) => Object.keys(options).length === 2 || (options.hour === 'numeric' && options.minute === 'numeric' && Object.keys(options).length === 4),
      values: (format, d, want) => [[format.format(d), want.format], [JSON.stringify(format.formatToParts(d)), JSON.stringify(want.parts)]],
    })
    expect(compared).toBe(STYLES.length * LOCALES.length * ZONES.length * 2 * DATES.length)
    expect(mismatches).toEqual([])
  })

  test('toLocaleString, toLocaleDateString and toLocaleTimeString: en-US in full, other locales by zone name', () => {
    for (const method of Object.keys(nativeToLocale)) {
      for (const timeZoneName of STYLES) for (const locale of ['en-US', 'en-GB', 'ar-EG', 'ja-JP']) for (const extra of [{}, { hour: 'numeric' }, { month: 'long' }]) {
        const options = { ...extra, timeZone: 'Asia/Kathmandu', timeZoneName }
        const d = DATES[0]
        const label = `${method} ${locale} ${JSON.stringify(options)}`
        const got = d[method](locale, options)
        if (locale === 'en-US') expect(got, label).toBe(nativeToLocale[method].call(d, locale, options))
        else expect(got, label).toContain(zoneName(new Native(locale, options).formatToParts(d)))
      }
    }
    expect(new Date(NaN).toLocaleString('en-US', { timeZoneName: 'longOffset' })).toBe('Invalid Date')
  })

  test('resolvedOptions reports the offset style', () => {
    const options = { timeZone: 'Asia/Kolkata', hour: 'numeric', timeZoneName: 'shortOffset' }
    expect(new Intl.DateTimeFormat('de-DE', options).resolvedOptions()).toEqual(new Native('de-DE', options).resolvedOptions())
  })

  test('formats now without an argument', () => {
    vi.useFakeTimers({ now: new Date('2026-06-01T12:00:00Z'), toFake: ['Date'] })
    try {
      expect(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' }).format()).toBe('6/1/2026, GMT+02:00')
    } finally {
      vi.useRealTimers()
    }
  })

  test('throws the native errors', () => {
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: 'Not/AZone', timeZoneName: 'longOffset' })).toThrow(RangeError)
    expect(() => new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeZoneName: 'longOffset' })).toThrow(TypeError)
    expect(() => new Intl.DateTimeFormat('en-US', { timeZoneName: 'longOffset' }).format(NaN)).toThrow(RangeError)
  })

  test('works without new and passes instanceof', () => {
    // eslint-disable-next-line new-cap
    const format = Intl.DateTimeFormat('en-US', { timeZone: 'UTC', timeZoneName: 'shortOffset' })
    expect(format.format(0)).toBe('1/1/1970, GMT+0')
    expect(format).toBeInstanceOf(Intl.DateTimeFormat)
    expect(format).toBeInstanceOf(Native)
  })

  test('hands every other option to the native implementation', () => {
    const options = { timeZone: 'Europe/Berlin', hour: 'numeric', minute: 'numeric', timeZoneName: 'short' }
    const format = new Intl.DateTimeFormat('en-US', options)
    expect(Object.getPrototypeOf(format)).toBe(Native.prototype)
    expect(format.format(DATES[3])).toBe(new Native('en-US', options).format(DATES[3]))
    expect(Intl.DateTimeFormat.supportedLocalesOf(['de-DE'])).toEqual(['de-DE'])
  })
})
