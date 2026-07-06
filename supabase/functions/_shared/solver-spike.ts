/**
 * Spike: test LP/ILP solver importability in Deno.
 */

// ══════════════════════════════════════════════════════════════════════════════
// 1. javascript-lp-solver — patch global before import
// ══════════════════════════════════════════════════════════════════════════════

async function testJsLpSolver() {
  console.log("\n=== javascript-lp-solver ===");
  try {
    // Patch: the library writes to `module.exports.lastSolvedModel` which
    // doesn't exist in ESM. Pre-creating the global fixes the crash.
    if (typeof globalThis !== "undefined") {
      (globalThis as any).module = (globalThis as any).module || { exports: {} };
    }
    const mod = await import("https://cdn.jsdelivr.net/npm/javascript-lp-solver@0.4.24/src/solver.js");
    const Solve = mod.default?.Solve || mod.Solve;
    if (!Solve) {
      console.log("No Solve. Keys:", Object.keys(mod).join(","));
      return false;
    }
    console.log("Import: OK");

    const result = Solve({
      optimize: "profit",
      opType: "max",
      constraints: { cap: { max: 4 } },
      variables: { x: { profit: 1, cap: 1 }, y: { profit: 1, cap: 1 } },
      ints: { x: 1, y: 1 },
    });
    console.log("Result:", JSON.stringify(result));
    return result.feasible === true;
  } catch (e) {
    console.log("FAILED:", String(e).slice(0, 300));
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. yalps via npm:
// ══════════════════════════════════════════════════════════════════════════════

async function testYalps() {
  console.log("\n=== yalps (npm:) ===");
  try {
    // deno.json needs nodeModulesDir: "auto" or manual install
    // Try the esm.sh approach with specific entry
    const { solve } = await import("https://esm.sh/yalps@0.7.1/dist/index.js");
    console.log("Import: OK");

    const model = {
      direction: "maximize" as const,
      objective: "profit",
      constraints: new Map([["cap", { max: 4 }]]),
      variables: new Map([
        ["x", new Map([["profit", 1], ["cap", 1]])],
        ["y", new Map([["profit", 1], ["cap", 1]])],
      ]),
      integers: new Set(["x", "y"]),
    };

    const result = solve(model);
    console.log("Status:", result.status, "Obj:", result.objectiveValue);
    return result.status === "optimal";
  } catch (e) {
    console.log("FAILED:", String(e).slice(0, 300));
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. Direct ILP via our own branch-and-bound (no external dep)
//    Formulate as: variables = match assignments (not C(N,4) enumeration),
//    constraints = player limits. Use column generation.
//    Actually — just test whether our exactSolver with the deadline works at 50.
// ══════════════════════════════════════════════════════════════════════════════

async function testOurSolverWithDeadline() {
  console.log("\n=== Our exactSolver with 3s deadline at 50 players ===");
  try {
    const { solveExact } = await import("./exactSolver.ts");

    // Generate a 50-player, 4-slot, 15% bridge input
    const DAYS = ["Monday","Tuesday","Wednesday","Thursday"];
    const timeSlots: any[] = [];
    for (let i = 0; i < 4; i++) {
      timeSlots.push({ id: `s${i}`, day: DAYS[i], start_time: "19:00", end_time: "20:30" });
    }

    let seed = 42;
    const rng = () => { seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };

    const responses: any[] = [];
    const bridgeCount = Math.round(50 * 0.15);
    for (let p = 0; p < 50; p++) {
      const isBridge = p < bridgeCount;
      const maxSlots = isBridge ? 4 : 2;
      const availCount = 1 + Math.floor(rng() * maxSlots);
      const shuffled = [...timeSlots].sort(() => rng() - 0.5);
      const selected = shuffled.slice(0, availCount).map((s: any) => s.id);
      responses.push({
        user_id: `p${p}`,
        selected_slots: selected,
        flexible_times: null,
        can_play_twice: isBridge ? null : false,
      });
    }

    const t0 = performance.now();
    const result = solveExact(timeSlots, responses, 3000);
    const ms = performance.now() - t0;

    console.log(`Time: ${ms.toFixed(1)}ms, Placed: ${result.maxPlaced}, Matches: ${result.matches.length}`);
    return ms < 3000;
  } catch (e) {
    console.log("FAILED:", String(e).slice(0, 300));
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
const results: Record<string, boolean> = {};
results["javascript-lp-solver"] = await testJsLpSolver();
results["yalps"] = await testYalps();
results["our-solver-50p"] = await testOurSolverWithDeadline();

console.log("\n=== Summary ===");
for (const [name, ok] of Object.entries(results)) {
  console.log(`  ${name}: ${ok ? "OK" : "FAILED"}`);
}
