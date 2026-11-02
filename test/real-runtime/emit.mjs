// Prints offset names as JSON, polyfilled where the runtime needs it. Run it in an old
// runtime (Node 14/16: V8 8.4/9.4, no offset styles) and in a current one, then compare.mjs.
// Plain Node, no vitest: it has to run where vitest doesn't.
import { polyfill } from '../../src/index.js'

const polyfilled = polyfill()

const STYLES = ['longOffset', 'shortOffset']
// No zone whose rules changed after tzdata 2022f, which Node 14 and 16 ship
const ZONES = [
  'UTC', 'Europe/Berlin', 'America/Los_Angeles', 'America/St_Johns', 'Asia/Kolkata', 'Asia/Kathmandu',
  'Australia/Lord_Howe', 'Pacific/Chatham', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Africa/Monrovia',
]
const DATES = [
  '2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z', '2026-11-01T09:30:00Z', '2026-01-15T23:59:59.999Z',
  '1969-07-20T20:17:00.500Z', '1970-01-01T12:00:00Z', '1800-06-01T12:00:00Z', '2100-12-31T12:00:00Z',
].map((s) => new Date(s))
const LOCALES = ['en-US', 'de-DE', 'fr-FR', 'ja-JP', 'zh-CN', 'ru-RU', 'hi-IN', 'ar-EG', 'fa-IR', 'th-TH-u-nu-thai', 'he-IL']

const results = []
for (const timeZoneName of STYLES) for (const locale of LOCALES) for (const timeZone of ZONES) {
  const format = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName })
  for (const date of DATES) {
    results.push({
      key: `${timeZoneName} ${locale} ${timeZone} ${date.toISOString()}`,
      zoneName: format.formatToParts(date).find((p) => p.type === 'timeZoneName').value,
      // The shape @date-fns/tz and friends parse
      enUS: locale === 'en-US' ? format.format(date) : undefined,
    })
  }
}
process.stdout.write(JSON.stringify({ runtime: `${process.version} V8 ${process.versions.v8} ICU ${process.versions.icu}`, polyfilled, results }))
