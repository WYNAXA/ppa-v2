/**
 * Round-trip test for parseSetsData / setsToJson.
 *
 * Proves that every field on a sets_data object survives the
 * parse → serialise cycle, including fields the parser has never
 * heard of. The sole intended mutation is the *_score key
 * canonicalisation (team1_score → team1, team2_score → team2).
 *
 * Run:  deno test --no-check src/lib/parseSetsData.test.ts
 */

import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { parseSetsData, setsToJson } from "./parseSetsData.ts";

Deno.test("shape 1: plain {team1, team2}", () => {
  const input = [{ team1: 6, team2: 4 }];
  const result = setsToJson(parseSetsData(input));
  assertEquals(result, [{ team1: 6, team2: 4 }]);
});

Deno.test("shape 2: legacy *_score + per-set players", () => {
  const input = [
    { team1_score: 6, team2_score: 4, team1_players: ["a", "b"], team2_players: ["c", "d"] },
  ];
  const result = setsToJson(parseSetsData(input));
  assertEquals(result, [
    { team1: 6, team2: 4, team1_players: ["a", "b"], team2_players: ["c", "d"] },
  ]);
});

Deno.test("shape 3: tiebreak object", () => {
  const input = [{ team1: 7, team2: 6, tiebreak: { team1: 7, team2: 4 } }];
  const result = setsToJson(parseSetsData(input));
  assertEquals(result, [{ team1: 7, team2: 6, tiebreak: { team1: 7, team2: 4 } }]);
});

Deno.test("shape 4: legacy *_score + per-set players + tiebreak_score string", () => {
  const input = [
    { team1_score: 7, team2_score: 6, team1_players: ["a", "b"], team2_players: ["c", "d"], tiebreak_score: "7-4" },
  ];
  const result = setsToJson(parseSetsData(input));
  assertEquals(result, [
    { team1: 7, team2: 6, team1_players: ["a", "b"], team2_players: ["c", "d"], tiebreak_score: "7-4" },
  ]);
});

Deno.test("shape 5: unknown future field survives round-trip verbatim", () => {
  const input = [{ team1: 6, team2: 4, future_field: { anything: true } }];
  const result = setsToJson(parseSetsData(input));
  assertEquals(result, [{ team1: 6, team2: 4, future_field: { anything: true } }]);
});
