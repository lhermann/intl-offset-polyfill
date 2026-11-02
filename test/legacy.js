// Makes this runtime behave like Chromium < 95: offset styles throw the RangeError old
// runtimes throw. Returns a function that restores the native implementation.
const OFFSET = ['longOffset', 'shortOffset']
const METHODS = ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']

const rangeError = (style) => new RangeError(`Value ${style} out of range for Intl.DateTimeFormat options property timeZoneName`)

export function simulateLegacyRuntime () {
  const Native = Intl.DateTimeFormat
  const nativeMethods = Object.fromEntries(METHODS.map((m) => [m, Date.prototype[m]]))

  const Legacy = function DateTimeFormat (locales, options) {
    if (OFFSET.includes(options?.timeZoneName)) throw rangeError(options.timeZoneName)
    return new Native(locales, options)
  }
  Legacy.prototype = Native.prototype
  Legacy.supportedLocalesOf = Native.supportedLocalesOf
  Intl.DateTimeFormat = Legacy

  for (const m of METHODS) {
    Date.prototype[m] = function (locales, options) {
      if (OFFSET.includes(options?.timeZoneName)) throw rangeError(options.timeZoneName)
      return nativeMethods[m].call(this, locales, options)
    }
  }

  return function restore () {
    Intl.DateTimeFormat = Native
    for (const m of METHODS) Date.prototype[m] = nativeMethods[m]
  }
}
