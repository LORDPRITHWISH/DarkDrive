// Run with `pnpm test`. Plain asserts, like packages/sync-core's decide.test.ts.
import assert from "node:assert"
import { inHours, isTime, tomorrow, wanted } from "./schedule.js"

const at = (h: number, m = 0) => new Date(2026, 0, 15, h, m)
const day = { from: "09:00", to: "18:00" }
const night = { from: "22:00", to: "06:00" }
assert(inHours(day, at(9)) && inHours(day, at(17, 59)))
assert(!inHours(day, at(8, 59)) && !inHours(day, at(18)))
assert(inHours(night, at(23)) && inHours(night, at(0)) && inHours(night, at(5, 59)))
assert(!inHours(night, at(6)) && !inHours(night, at(12)) && !inHours(night, at(21, 59)))
assert(inHours({ from: "08:00", to: "08:00" }, at(3)))
assert(wanted({ pausedUntil: 0, hours: null }, at(3)))
assert(!wanted({ pausedUntil: at(4).getTime(), hours: null }, at(3)))
assert(wanted({ pausedUntil: at(2).getTime(), hours: day }, at(10)))
assert(!wanted({ pausedUntil: 0, hours: day }, at(20)))
assert(tomorrow(at(23, 59)) === new Date(2026, 0, 16).getTime())
assert(isTime("09:30") && isTime("23:59") && !isTime("24:00") && !isTime("9:30") && !isTime(930))
console.log("schedule ok")
