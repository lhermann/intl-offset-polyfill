export type OffsetStyle = 'longOffset' | 'shortOffset'

/** The offset styles this runtime lacks. Empty when it has both. */
export function missingStyles (): OffsetStyle[]

/** True when the runtime lacks longOffset or shortOffset. */
export function shouldPolyfill (): boolean

/** Patches Intl.DateTimeFormat and Date.prototype.toLocale{,Date,Time}String. True if it patched. */
export function polyfill (): boolean
