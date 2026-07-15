# @wynaxa/scheduling

Pure interval logic for padel scheduling. Shared between PPA (poll engine, match scheduling) and VM (court availability, booking conflicts).

All functions are pure — no I/O, no DB, no framework dependencies.

## Functions

- `timeToMinutes(time: string): number` — Convert "HH:MM" or "HH:MM:SS" to minutes since midnight
- `minutesToHHMM(minutes: number): string` — Convert minutes since midnight to "HH:MM"
- `tsToMinutes(ts: string): number` — Extract minutes-since-midnight-UTC from a timestamptz string
- `overlaps(aStart, aEnd, bStart, bEnd): boolean` — Half-open interval overlap with wrap-past-midnight
- `fitsInWindow(windowStart, windowEnd, durationMin): boolean` — Can a duration fit within a window?
- `candidateStarts(windowStart, windowEnd, durationMin, intervalMin): number[]` — Generate candidate slot starts

## Usage

```ts
import { overlaps, timeToMinutes } from "jsr:@wynaxa/scheduling@1.0.0";

const start = timeToMinutes("09:00"); // 540
const end = timeToMinutes("10:30");   // 630
console.log(overlaps(start, end, 600, 660)); // true (09:00-10:30 overlaps 10:00-11:00)
```
