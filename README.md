# intl-offset-polyfill

Polyfills `Intl.DateTimeFormat` `timeZoneName: 'longOffset'` (`GMT+05:30`) and `'shortOffset'` (`GMT+5:30`) for runtimes that predate them. It is 1.6 KB gzipped, has no dependencies and no timezone data, and does nothing where the runtime already supports both.

```js
// First import of your app
import 'intl-offset-polyfill/auto'
```

## Why

[`@date-fns/tz`](https://github.com/date-fns/tz), `date-fns-tz` and other zone libraries read every UTC offset from `longOffset`. These runtimes throw `RangeError: Value longOffset out of range` instead:

- Chromium < 95: old ChromeOS, Android WebViews, smart TVs, BrightSign and other signage players
- Firefox < 91: KaiOS
- Safari < 15.4: iOS 15.3 and older

On those runtimes, all zoned date math ends up as `NaN` or an `Invalid Date`. The libraries catch the error and return `NaN`, so you only notice it later, for example when `format()` throws `RangeError: Invalid time value`. The full-Intl polyfill [`@formatjs/intl-datetimeformat`](https://formatjs.github.io/docs/polyfills/intl-datetimeformat) does support offsets, but it costs tens of KB plus timezone data. Its `shouldPolyfill()` also doesn't check for offset support, so it won't install on these runtimes.

## How

The wall-clock time in the zone comes from `formatToParts`, which every one of those runtimes supports. The offset is that wall-clock time read as UTC minus the instant. A native formatter with `timeZoneName: 'short'` lays out the rest of the string, and only its zone name is swapped for the offset. The locale's offset format (`GMT+5`, `UTC−5` in French, `غرينتش+٥` in Arabic, including its digits and bidi marks) is read off the `short` name of the fixed-offset zone `Etc/GMT-5`.

The polyfill patches `Intl.DateTimeFormat` and `Date.prototype.toLocaleString`, `toLocaleDateString` and `toLocaleTimeString`. Any call without an offset style goes straight to the native implementation.

## API

```js
import { polyfill, shouldPolyfill, missingStyles } from 'intl-offset-polyfill'

missingStyles() // ['longOffset', 'shortOffset'] on Chromium 94, [] on Chromium 95
shouldPolyfill() // true if any style is missing
polyfill() // patches; true if it did, false if there was nothing to do
```

`intl-offset-polyfill/auto` just calls `polyfill()`. Import it before anything that formats a zoned date. `@date-fns/tz` builds its formatters on first use, so importing it earlier is fine as long as nothing runs in between.

## What matches native, and what doesn't

- **The offset name matches exactly**, for every zone, date, locale and option. That includes zones whose offsets have seconds (`GMT-0:44:30` for Monrovia before 1972) and dates before 1970.
- **The full string matches** for the default fields and for `hour` + `minute`. These are the shapes the libraries format and parse.
- **Other field combinations can be laid out differently.** For some of them, ICU chooses a different pattern when the zone is an offset. For example, ja-JP prints `00時59分` instead of `00:59`, and de-DE prints `05:29:59` instead of `5:29:59`. The polyfill keeps the runtime's `short` layout there, because copying ICU's choice would mean shipping CLDR pattern data.
- `formatRange` and `formatRangeToParts` aren't polyfilled for offset styles.
- `shortGeneric` and `longGeneric` (`PT`, `Pacific Time`) need zone-name data and aren't covered.

## Tests

- `npm test` simulates a legacy runtime in current Node and compares the polyfill against native output: 2 styles × 12 locales × 11 zones × 8 dates × 4 option sets. It also tests `@date-fns/tz` before and after the polyfill.
- `test/real-runtime/` runs on real old runtimes. Node 14 and 16 (V8 8.4 and 9.4, the engines of Chromium 84 and 94) don't have offset styles. CI polyfills them and compares the output with native output from current Node, case by case.

## Written by a bot

An AI agent wrote and tested this package: Carl, Lukas Hermann's assistant, running on Anthropic's Claude Opus 5.5 (`claude-opus-5-5`) in Claude Code. That covers the code, the tests, the real-runtime comparison and this README. A human gave it the task and owns the repository.

## License

MIT
