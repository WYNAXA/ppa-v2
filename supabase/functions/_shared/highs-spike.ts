/**
 * Spike: HiGHS native WASM in Deno — no esm.sh, no Node fs.
 *
 * Run: deno run --allow-read --allow-net supabase/functions/_shared/highs-spike.ts
 */

// ── Step 1: Load the Emscripten glue as a module ─────────────────────────────

// The highs.js file ends with `module.exports = Module` (CJS).
// In Deno we can't use require(), so we read the source, strip the CJS export,
// and eval it to get the Module factory function.

const thisDir = new URL(".", import.meta.url).pathname;
const gluePath = thisDir + "highs-wasm/highs.js";
const wasmPath = thisDir + "highs-wasm/highs.wasm";

let glueSource = await Deno.readTextFile(gluePath);

// Strip CJS/AMD tail
glueSource = glueSource.replace(
  /if\s*\(\s*typeof\s+exports\s*===\s*'object'[\s\S]*$/,
  ""
);

// Patch: Deno has `process` global, making Emscripten think it's Node.
// Force the browser/worker path by neutralizing the Node detection.
// The var `m` is set to true when process.versions.node exists.
// We replace the Node-specific `require("fs")` block with a no-op.
glueSource = glueSource.replace(
  /if\(m\)\{var fs=require\("fs"\).*?\}else if/,
  "if(false){}else if"
);

// The glue source is: `var Module = (() => { ... })();`
// We need the value of Module. Eval it in a function scope.
const ModuleFactory = new Function(
  glueSource + "\nreturn Module;"
)();

console.log("Step 1: Module factory loaded, type:", typeof ModuleFactory);

// ── Step 2: Instantiate with locateFile pointing to local WASM ───────────────

const wasmBinary = await Deno.readFile(wasmPath);

const highs = await ModuleFactory({
  wasmBinary,
  print: (s: string) => {},     // suppress HiGHS stdout
  printErr: (s: string) => {},  // suppress HiGHS stderr
});

console.log("Step 2: HiGHS instantiated, solve type:", typeof highs.solve);

// ── Step 3: Solve a trivial LP ───────────────────────────────────────────────

const trivialLP = `Maximize
  obj: x + y
Subject To
  cap: x + y <= 4
  xmax: x <= 3
  ymax: y <= 3
General
  x y
End
`;

const result = highs.solve(trivialLP);
console.log("Step 3: Trivial LP result:");
console.log("  Status:", result.Status);
console.log("  Objective:", result.ObjectiveValue);
console.log("  x =", result.Columns?.x?.Primal);
console.log("  y =", result.Columns?.y?.Primal);

// ── Step 4: Solve a small participation model ────────────────────────────────
// 9 players, 4 slots (the counterexample from matchEngine tests).
// Model: maximize placed players using match variables.
//
// Instead of enumerating C(N,4), we generate ONLY candidate matches that
// include at least one bridge player (unlimited), since those are the
// interesting ones. For a small instance, we enumerate all as a correctness
// check.

function buildParticipationLP(
  slotAvail: Map<string, string[]>,
  limits: Map<string, number>,
): string {
  // Generate candidate matches (all C(available,4) per slot, deduplicated)
  const seen = new Set<string>();
  const candidates: { id: string; players: string[] }[] = [];
  let idx = 0;

  for (const [_slotId, avail] of slotAvail) {
    if (avail.length < 4) continue;
    // Generate all C(avail, 4)
    for (let i = 0; i < avail.length - 3; i++)
      for (let j = i+1; j < avail.length - 2; j++)
        for (let k = j+1; k < avail.length - 1; k++)
          for (let l = k+1; l < avail.length; l++) {
            const group = [avail[i], avail[j], avail[k], avail[l]].sort();
            const key = group.join(",");
            if (!seen.has(key)) {
              seen.add(key);
              candidates.push({ id: `m${idx++}`, players: group });
            }
          }
  }

  console.log(`  Candidates: ${candidates.length}`);

  // Build LP string
  const allPlayers = new Set<string>();
  for (const c of candidates) c.players.forEach(p => allPlayers.add(p));

  // Variables: m_i (binary, 1 = match is selected), y_p (binary, 1 = player placed)
  // Objective: maximize sum(y_p)
  let lp = "Maximize\n  obj:";
  const playerList = [...allPlayers];
  lp += playerList.map(p => ` + y_${p}`).join("");
  lp += "\n";

  lp += "Subject To\n";

  // For each player: sum of match vars containing them <= limit
  for (const p of playerList) {
    const matchesWithP = candidates.filter(c => c.players.includes(p));
    if (matchesWithP.length === 0) continue;
    const lim = limits.get(p) ?? 1;
    lp += `  lim_${p}: ${matchesWithP.map(c => c.id).join(" + ")} <= ${Math.min(lim, 999)}\n`;
  }

  // For each player: y_p <= sum of match vars containing them
  // (player is placed only if in at least one selected match)
  for (const p of playerList) {
    const matchesWithP = candidates.filter(c => c.players.includes(p));
    if (matchesWithP.length === 0) continue;
    lp += `  cov_${p}: y_${p} - ${matchesWithP.map(c => c.id).join(" - ")} <= 0\n`;
  }

  // y_p <= 1
  for (const p of playerList) {
    lp += `  ub_${p}: y_${p} <= 1\n`;
  }

  // All variables binary (General = integer, with bounds 0-1)
  lp += "Bounds\n";
  for (const c of candidates) lp += `  0 <= ${c.id} <= 1\n`;
  for (const p of playerList) lp += `  0 <= y_${p} <= 1\n`;

  lp += "General\n";
  lp += `  ${candidates.map(c => c.id).join(" ")} ${playerList.map(p => `y_${p}`).join(" ")}\n`;
  lp += "End\n";

  return lp;
}

// The counterexample: 9 players, 4 slots
const slotAvail = new Map<string, string[]>([
  ["s0", ["p0","p1","p3","p6"]],
  ["s1", ["p0","p1","p3","p4","p5","p6","p8"]],
  ["s2", ["p0","p1","p2","p6","p7"]],
  ["s3", ["p1","p2","p3","p6","p7","p8"]],
]);
const limits = new Map<string, number>([
  ["p0",1],["p1",1],["p2",1],["p3",1],["p4",1],
  ["p5",999],["p6",1],["p7",1],["p8",999],
]);

console.log("\nStep 4: Counterexample (9 players, 4 slots)");
const lpStr = buildParticipationLP(slotAvail, limits);
const t0 = performance.now();
const result2 = highs.solve(lpStr);
const solveMs = performance.now() - t0;

console.log("  Status:", result2.Status);
console.log("  Objective:", result2.ObjectiveValue);
console.log("  Time:", solveMs.toFixed(1), "ms");

// Print selected matches
const matchVars = Object.entries(result2.Columns || {})
  .filter(([k, v]: [string, any]) => k.startsWith("m") && v.Primal > 0.5);
console.log("  Selected matches:", matchVars.length);
for (const [name, v] of matchVars) {
  console.log(`    ${name} = ${(v as any).Primal}`);
}

// Count placed players
const placedPlayers = Object.entries(result2.Columns || {})
  .filter(([k, v]: [string, any]) => k.startsWith("y_") && v.Primal > 0.5);
console.log("  Placed players:", placedPlayers.length);

// ── Step 5: Benchmark at 50 players ──────────────────────────────────────────

function makeRng(seed: number) {
  let s = seed | 0 || 1;
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

function benchmarkAt(playerCount: number, slotCount: number, bridgePct: number): { ms: number; placed: number } {
  const rng = makeRng(playerCount * 1000 + slotCount * 100 + Math.round(bridgePct * 100));
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  const slots: string[] = [];
  for (let i = 0; i < slotCount; i++) slots.push(`s${i}`);

  const bridgeCount = Math.round(playerCount * bridgePct);
  const slotAvail = new Map<string, string[]>();
  for (const s of slots) slotAvail.set(s, []);

  const limits = new Map<string, number>();

  for (let p = 0; p < playerCount; p++) {
    const isBridge = p < bridgeCount;
    const maxSlots = isBridge ? slotCount : Math.min(2, slotCount);
    const availCount = 1 + Math.floor(rng() * maxSlots);
    const shuffled = [...slots].sort(() => rng() - 0.5);
    const selected = shuffled.slice(0, availCount);
    for (const s of selected) slotAvail.get(s)!.push(`p${p}`);
    limits.set(`p${p}`, isBridge ? 999 : 1);
  }

  const lp = buildParticipationLP(slotAvail, limits);
  const t0 = performance.now();
  const result = highs.solve(lp);
  const ms = performance.now() - t0;

  const placed = Object.entries(result.Columns || {})
    .filter(([k, v]: [string, any]) => k.startsWith("y_") && v.Primal > 0.5).length;

  return { ms, placed };
}

console.log("\n=== Benchmark: 50 players ===");
console.log("players | slots | bridge% | ms      | placed");
console.log("--------|-------|---------|---------|-------");

for (const slotCount of [2, 3, 4, 6]) {
  for (const bridge of [0, 0.15, 0.30]) {
    try {
      // Median of 5
      const times: number[] = [];
      let placed = 0;
      for (let r = 0; r < 5; r++) {
        const res = benchmarkAt(50, slotCount, bridge);
        times.push(res.ms);
        placed = res.placed;
      }
      times.sort((a, b) => a - b);
      const medMs = times[2];
      const flag = medMs > 3000 ? " > 3s" : "";
      console.log(`     50 |     ${slotCount} | ${String(Math.round(bridge*100)).padStart(6)}% | ${medMs.toFixed(1).padStart(7)} | ${String(placed).padStart(5)}${flag}`);
    } catch (e) {
      console.log(`     50 |     ${slotCount} | ${String(Math.round(bridge*100)).padStart(6)}% | ERROR: ${String(e).slice(0, 80)}`);
    }
  }
}
