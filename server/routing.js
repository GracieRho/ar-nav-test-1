function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function findRoute(campus, startNodeId, destinationNodeId, options = {}) {
  const nodes = new Map(campus.nodes.map((node) => [node.id, node]));
  if (!nodes.has(startNodeId) || !nodes.has(destinationNodeId)) {
    throw new Error("Unknown start or destination node");
  }

  const adjacency = new Map(campus.nodes.map((node) => [node.id, []]));
  for (const edge of campus.edges) {
    if (options.wheelchair && !edge.accessible) continue;
    const weight = edge.lengthMeters ?? distance(nodes.get(edge.from), nodes.get(edge.to));
    adjacency.get(edge.from).push({ nodeId: edge.to, edge, weight });
    if (!edge.oneWay) adjacency.get(edge.to).push({ nodeId: edge.from, edge, weight });
  }

  const distances = new Map([[startNodeId, 0]]);
  const previous = new Map();
  const unvisited = new Set(nodes.keys());
  while (unvisited.size) {
    let current;
    let best = Infinity;
    for (const id of unvisited) {
      const value = distances.get(id) ?? Infinity;
      if (value < best) { best = value; current = id; }
    }
    if (!current || current === destinationNodeId) break;
    unvisited.delete(current);
    for (const neighbor of adjacency.get(current)) {
      if (!unvisited.has(neighbor.nodeId)) continue;
      const candidate = best + neighbor.weight;
      if (candidate < (distances.get(neighbor.nodeId) ?? Infinity)) {
        distances.set(neighbor.nodeId, candidate);
        previous.set(neighbor.nodeId, { nodeId: current, edgeId: neighbor.edge.id });
      }
    }
  }

  if (!distances.has(destinationNodeId)) throw new Error("No accessible route found");
  const nodeIds = [];
  const edgeIds = [];
  for (let cursor = destinationNodeId; cursor; cursor = previous.get(cursor)?.nodeId) {
    nodeIds.unshift(cursor);
    const edgeId = previous.get(cursor)?.edgeId;
    if (edgeId) edgeIds.unshift(edgeId);
  }
  return {
    id: crypto.randomUUID(),
    startNodeId,
    destinationNodeId,
    nodeIds,
    edgeIds,
    distanceMeters: Math.round(distances.get(destinationNodeId)),
    maneuvers: createManeuvers(nodeIds.map((id) => nodes.get(id)))
  };
}

function createManeuvers(nodes) {
  return nodes.map((node, index) => {
    if (index === 0) return { nodeId: node.id, action: "START", text: { ko: `${node.name.ko}에서 출발하세요.`, en: `Start at ${node.name.en}.` } };
    if (index === nodes.length - 1) return { nodeId: node.id, action: "ARRIVE", text: { ko: `${node.name.ko}에 도착했습니다.`, en: `You have arrived at ${node.name.en}.` } };
    const a = nodes[index - 1], b = node, c = nodes[index + 1];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    const action = Math.abs(cross) < 0.01 ? "CONTINUE" : cross > 0 ? "TURN_LEFT" : "TURN_RIGHT";
    const ko = action === "CONTINUE" ? "직진하세요." : action === "TURN_LEFT" ? "좌회전하세요." : "우회전하세요.";
    const en = action === "CONTINUE" ? "Continue straight." : action === "TURN_LEFT" ? "Turn left." : "Turn right.";
    return { nodeId: node.id, action, text: { ko, en }, landmark: node.name };
  });
}
