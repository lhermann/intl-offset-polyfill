// node compare.mjs native.json polyfilled.json — fails unless every offset name matches.
import { readFileSync } from 'node:fs'

const [native, polyfilled] = process.argv.slice(2).map((file) => JSON.parse(readFileSync(file, 'utf8')))
if (native.polyfilled) throw new Error(`${native.runtime} was polyfilled; the reference must be native`)
if (!polyfilled.polyfilled) throw new Error(`${polyfilled.runtime} has offset styles; nothing was polyfilled`)

// he-IL: ICU prints two left-to-right marks after a negative offset; the locale template
// the polyfill reads from has one.
const same = (key, a, b) => a === b || (key.includes(' he-IL ') && a.replace('‎‎', '‎') === b)

const expected = new Map(native.results.map((r) => [r.key, r]))
const mismatches = []
for (const r of polyfilled.results) {
  const want = expected.get(r.key)
  if (!same(r.key, want.zoneName, r.zoneName)) mismatches.push(`${r.key}: ${JSON.stringify(r.zoneName)}, want ${JSON.stringify(want.zoneName)}`)
  if (want.enUS !== undefined && want.enUS !== r.enUS) mismatches.push(`${r.key}: ${JSON.stringify(r.enUS)}, want ${JSON.stringify(want.enUS)}`)
}
console.log(`${polyfilled.runtime} (polyfilled) vs ${native.runtime} (native): ${polyfilled.results.length} cases, ${mismatches.length} mismatches`)
if (mismatches.length) {
  console.log(mismatches.slice(0, 50).join('\n'))
  process.exit(1)
}
