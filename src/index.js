// Polyfills Intl.DateTimeFormat timeZoneName 'longOffset' ("GMT+05:30") and 'shortOffset'
// ("GMT+5:30") for runtimes that predate them: Chromium < 95, Firefox < 91, Safari < 15.4.
// Everything else goes to the native implementation untouched.

const STYLES = ['longOffset', 'shortOffset']
const DATE_FIELDS = ['weekday', 'year', 'month', 'day']
const TIME_FIELDS = ['dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits']

function supports (style) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZoneName: style })
    return true
  } catch (error) {
    return false
  }
}

// A decimal digit in any script. Built at runtime: a \p{} literal is a SyntaxError for the
// whole bundle on engines before Chromium 64; there we only know ASCII digits.
function anyDigit () {
  try {
    return new RegExp('\\p{Nd}', 'gu')
  } catch (error) {
    return /\d/g
  }
}

/** The offset styles this runtime lacks, e.g. ['longOffset', 'shortOffset']. Empty when none. */
export function missingStyles () {
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') return []
  return STYLES.filter((style) => !supports(style))
}

/** True when the runtime lacks longOffset or shortOffset. */
export function shouldPolyfill () {
  return missingStyles().length > 0
}

/**
 * Patches Intl.DateTimeFormat and Date.prototype.toLocale{,Date,Time}String.
 * Returns true if it patched, false if the runtime needs nothing (or is already patched).
 */
export function polyfill () {
  const missing = missingStyles()
  if (!missing.length) return false

  const Native = Intl.DateTimeFormat
  const wallClocks = new Map()
  const templates = new Map()

  // Offset in whole seconds: the zone's wall clock read as UTC, minus the instant.
  function offsetSeconds (timeZone, time) {
    let wallClock = wallClocks.get(timeZone)
    if (!wallClock) {
      // hour12: false, not hourCycle: older runtimes ignore hourCycle
      wallClock = new Native('en-US', { timeZone, hour12: false, era: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      wallClocks.set(timeZone, wallClock)
    }
    const p = {}
    for (const { type, value } of wallClock.formatToParts(time)) p[type] = value
    const year = p.era === 'BC' ? 1 - Number(p.year) : Number(p.year)
    const asUTC = new Date(0)
    // setUTCFullYear, not Date.UTC: Date.UTC maps years 0-99 to 1900-1999
    asUTC.setUTCFullYear(year, Number(p.month) - 1, Number(p.day))
    // Some Chromium builds show midnight as 24 with hour12: false
    asUTC.setUTCHours(Number(p.hour) % 24, Number(p.minute), Number(p.second))
    return Math.round((asUTC.getTime() - Math.floor(time / 1000) * 1000) / 1000)
  }

  // The locale's GMT format, read off the 'short' name of a fixed-offset zone, which every
  // runtime supports: "GMT+5", "UTC−5" (fr), "غرينتش+٥" (ar), "‎+۵ گرینویچ" (fa).
  function template (locale, numberingSystem) {
    const key = `${locale}|${numberingSystem}`
    let tpl = templates.get(key)
    if (tpl) return tpl
    const shortName = (timeZone) => {
      const part = new Native(locale, { timeZone, timeZoneName: 'short', numberingSystem }).formatToParts(0).find((p) => p.type === 'timeZoneName')
      return part ? part.value : ''
    }
    // Split "GMT+5" around its one digit, the 5 in the locale's script. Any other shape
    // (say "GMT+05:00") falls back to the English one.
    const split = (name, fallback) => {
      const digits = name.match(anyDigit())
      if (!digits || digits.length !== 1) return fallback
      const i = name.indexOf(digits[0])
      return { before: name.slice(0, i), after: name.slice(i + digits[0].length), zero: digits[0].codePointAt(0) - 5 }
    }
    tpl = {
      plus: split(shortName('Etc/GMT-5'), { before: 'GMT+', after: '', zero: 48 }),
      minus: split(shortName('Etc/GMT+5'), { before: 'GMT-', after: '', zero: 48 }),
    }
    templates.set(key, tpl)
    return tpl
  }

  function offsetName (seconds, style, tpl) {
    const { before, after, zero } = seconds < 0 ? tpl.minus : tpl.plus
    const abs = Math.abs(seconds)
    const h = Math.floor(abs / 3600)
    const m = Math.floor(abs / 60) % 60
    const s = abs % 60
    const pad = (n) => String(n).padStart(2, '0')
    let text = style === 'longOffset' ? `${pad(h)}:${pad(m)}` : `${h}${m || s ? `:${pad(m)}` : ''}`
    if (s) text += `:${pad(s)}`
    if (zero !== 48) text = text.replace(/\d/g, (d) => String.fromCodePoint(zero + Number(d)))
    return before + text + after
  }

  function createOffsetFormat (locales, options, style) {
    // A native 'short' formatter lays out everything else and throws the native errors
    // (unknown zone, dateStyle with timeZoneName). We only swap the timeZoneName part.
    const base = new Native(locales, { ...options, timeZoneName: 'short' })
    const resolved = base.resolvedOptions()
    const tpl = template(resolved.locale, resolved.numberingSystem)
    const toTime = (date) => (date === undefined ? Date.now() : Number(date))
    const nameAt = (time) => offsetName(offsetSeconds(resolved.timeZone, time), style, tpl)
    const formatToParts = (date) => {
      const time = toTime(date)
      const parts = base.formatToParts(time) // RangeError for an invalid date, like native
      const name = nameAt(time)
      return parts.map((p) => (p.type === 'timeZoneName' ? { type: 'timeZoneName', value: name } : p))
    }
    // Swaps the 'short' zone name in `text`, a string the runtime printed with timeZoneName
    // 'short'. Not parts.join(''): V8's format() and toLocaleString() print U+202F before AM/PM
    // as a plain space, and formatToParts() doesn't.
    const swapZoneName = (time, text) => {
      const parts = base.formatToParts(time) // RangeError for an invalid date, like native
      const short = parts.find((p) => p.type === 'timeZoneName')
      const name = nameAt(time)
      const i = short ? text.lastIndexOf(short.value) : -1
      if (i >= 0) return text.slice(0, i) + name + text.slice(i + short.value.length)
      return parts.map((p) => (p.type === 'timeZoneName' ? name : p.value)).join('')
    }
    const format = (date) => {
      const time = toTime(date)
      return swapZoneName(time, base.format(time))
    }
    const instance = Object.create(Native.prototype)
    // defineProperty: the native format is a getter, so plain assignment throws in strict mode
    Object.defineProperties(instance, {
      format: { get: () => format, configurable: true },
      formatToParts: { value: formatToParts, writable: true, configurable: true },
      resolvedOptions: { value: () => ({ ...base.resolvedOptions(), timeZoneName: style }), writable: true, configurable: true },
    })
    return { instance, swapZoneName }
  }

  function DateTimeFormat (locales, options) {
    if (options && missing.includes(options.timeZoneName)) return createOffsetFormat(locales, options, options.timeZoneName).instance
    return new Native(locales, options)
  }
  DateTimeFormat.prototype = Native.prototype
  DateTimeFormat.supportedLocalesOf = Native.supportedLocalesOf
  Intl.DateTimeFormat = DateTimeFormat

  // ECMA-402 ToDateTimeOptions: which fields each toLocale*String fills in when none are given
  function withDefaults (options, required, defaults) {
    const o = { ...options }
    let needDefaults = o.dateStyle === undefined && o.timeStyle === undefined
    if (required !== 'time' && DATE_FIELDS.some((k) => o[k] !== undefined)) needDefaults = false
    if (required !== 'date' && TIME_FIELDS.some((k) => o[k] !== undefined)) needDefaults = false
    if (needDefaults && defaults !== 'time') o.year = o.month = o.day = 'numeric'
    if (needDefaults && defaults !== 'date') o.hour = o.minute = o.second = 'numeric'
    return o
  }
  for (const [method, required, defaults] of [['toLocaleString', 'any', 'all'], ['toLocaleDateString', 'date', 'date'], ['toLocaleTimeString', 'time', 'time']]) {
    const native = Date.prototype[method]
    Object.defineProperty(Date.prototype, method, {
      value: function (locales, options) {
        if (!options || !missing.includes(options.timeZoneName)) return native.call(this, locales, options)
        const time = Date.prototype.getTime.call(this)
        if (Number.isNaN(time)) return 'Invalid Date'
        // The native method's own text, so its layout stays; only the zone name changes
        const text = native.call(this, locales, { ...options, timeZoneName: 'short' })
        return createOffsetFormat(locales, withDefaults(options, required, defaults), options.timeZoneName).swapZoneName(time, text)
      },
      writable: true,
      configurable: true,
    })
  }

  return true
}
