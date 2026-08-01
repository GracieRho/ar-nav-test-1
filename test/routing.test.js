import test from "node:test";
import assert from "node:assert/strict";
import { campus } from "../server/data.js";
import { findRoute } from "../server/routing.js";

test("finds the shortest route to a POI", () => {
  const route = findRoute(campus, "entrance", "blood-draw");
  assert.deepEqual(route.nodeIds, ["entrance", "lobby", "junction-a", "blood-draw"]);
  assert.equal(route.distanceMeters, 42);
  assert.equal(route.maneuvers.at(-1).action, "ARRIVE");
});

test("rejects an unknown node", () => {
  assert.throws(() => findRoute(campus, "missing", "blood-draw"), /Unknown/);
});
