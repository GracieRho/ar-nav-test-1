function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function findRoute(
  campus,
  startNodeId,
  destinationNodeId,
  options = {}
) {
  const nodes = new Map(campus.nodes.map((node) => [node.id, node]));

  if (!nodes.has(startNodeId) || !nodes.has(destinationNodeId)) {
    throw new Error("Unknown start or destination node");
  }

  const adjacency = new Map(campus.nodes.map((node) => [node.id, []]));

  for (const edge of campus.edges) {
    // 휠체어 모드: 접근 불가 edge 제거
    if (options.wheelchair && !edge.accessible) continue;

    // 환자용 기본 설정에서는 계단을 길찾기 후보에서 제외한다.
    if (options.allowStairs === false && edge.type === "stair") continue;

    // 에스컬레이터 이용이 어려운 경우 에스컬레이터를 제외한다.
    // allowStairs=false도 함께 보내므로 이 경우 층간 이동은 엘리베이터만 남는다.
    if (options.avoidEscalator && edge.type === "escalator") continue;

    const weight =
      edge.lengthMeters ?? distance(nodes.get(edge.from), nodes.get(edge.to));

    adjacency.get(edge.from).push({
      nodeId: edge.to,
      edge,
      weight,
    });

    if (!edge.oneWay) {
      adjacency.get(edge.to).push({
        nodeId: edge.from,
        edge,
        weight,
      });
    }
  }

  const distances = new Map([[startNodeId, 0]]);
  const previous = new Map();
  const unvisited = new Set(nodes.keys());

  while (unvisited.size) {
    let current;
    let best = Infinity;

    for (const id of unvisited) {
      const value = distances.get(id) ?? Infinity;
      if (value < best) {
        best = value;
        current = id;
      }
    }

    if (!current || current === destinationNodeId) break;
    unvisited.delete(current);

    for (const neighbor of adjacency.get(current)) {
      if (!unvisited.has(neighbor.nodeId)) continue;

      const candidate = best + neighbor.weight;

      if (candidate < (distances.get(neighbor.nodeId) ?? Infinity)) {
        distances.set(neighbor.nodeId, candidate);
        previous.set(neighbor.nodeId, {
          nodeId: current,
          edgeId: neighbor.edge.id,
        });
      }
    }
  }

  if (!distances.has(destinationNodeId)) {
    throw new Error("No accessible route found");
  }

  const nodeIds = [];
  const edgeIds = [];

  for (
    let cursor = destinationNodeId;
    cursor;
    cursor = previous.get(cursor)?.nodeId
  ) {
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
    maneuvers: createManeuvers(nodeIds.map((id) => nodes.get(id))),
  };
}

function connectorKo(node) {
  const type = node?.connectorType;
  if (type === "elevator") return "엘리베이터";
  if (type === "escalator") return "에스컬레이터";
  if (type === "stair") return "계단";
  return node?.connectorName || "층간 이동 수단";
}

function createManeuvers(nodes) {
  return nodes.map((node, index) => {
    if (index === 0) {
      return {
        nodeId: node.id,
        floor: node.floor,
        action: "START",
        text: {
          ko: `${node.floor}층 현재 위치에서 출발하세요.`,
          en: `Start from your current position on floor ${node.floor}.`,
        },
      };
    }

    if (index === nodes.length - 1) {
      return {
        nodeId: node.id,
        floor: node.floor,
        action: "ARRIVE",
        text: {
          ko: "목적지에 도착했습니다.",
          en: "You have arrived at your destination.",
        },
      };
    }

    const previous = nodes[index - 1];
    const next = nodes[index + 1];

    if (next.floor !== node.floor) {
      const transport = connectorKo(node.connectorType ? node : next);

      return {
        nodeId: node.id,
        floor: node.floor,
        action: "CHANGE_FLOOR",
        targetFloor: next.floor,
        connectorType: node.connectorType || next.connectorType || null,
        text: {
          ko: `${transport}를 이용해 ${next.floor}층으로 이동하세요.`,
          en: `Use the ${transport} to go to floor ${next.floor}.`,
        },
        landmark: node.name,
      };
    }

    if (previous.floor !== node.floor) {
      return {
        nodeId: node.id,
        floor: node.floor,
        action: "FLOOR_ARRIVAL",
        text: {
          ko: `${node.floor}층에 도착했습니다. 안내 경로를 따라 이동하세요.`,
          en: `You are now on floor ${node.floor}. Follow the route.`,
        },
        landmark: node.name,
      };
    }

    const a = previous;
    const b = node;
    const c = next;

    const cross =
      (b.x - a.x) * (c.y - b.y) -
      (b.y - a.y) * (c.x - b.x);

    const action =
      Math.abs(cross) < 0.01
        ? "CONTINUE"
        : cross > 0
          ? "TURN_LEFT"
          : "TURN_RIGHT";

    const ko =
      action === "CONTINUE"
        ? "직진하세요."
        : action === "TURN_LEFT"
          ? "좌회전하세요."
          : "우회전하세요.";

    const en =
      action === "CONTINUE"
        ? "Continue straight."
        : action === "TURN_LEFT"
          ? "Turn left."
          : "Turn right.";

    return {
      nodeId: node.id,
      floor: node.floor,
      action,
      text: { ko, en },
      landmark: node.name,
    };
  });
}
