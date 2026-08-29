function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * 경로 비용 비교 함수
 *
 * 우선순위
 * 1. 층간 이동량 최소화
 * 2. 이동거리 최소화
 *
 * 예:
 * A = { floorTravel: 0, distance: 500 }
 * B = { floorTravel: 2, distance: 100 }
 *
 * → A 선택
 *
 * 같은 층간 이동량이면:
 *
 * A = { floorTravel: 0, distance: 500 }
 * B = { floorTravel: 0, distance: 300 }
 *
 * → B 선택
 */
function isBetterCost(candidate, existing) {
  if (!existing) {
    return true;
  }

  // 1순위: 층간 이동 최소화
  if (candidate.floorTravel !== existing.floorTravel) {
    return candidate.floorTravel < existing.floorTravel;
  }

  // 2순위: 이동거리 최소화
  return candidate.distance < existing.distance;
}


/**
 * 메인 경로 탐색
 */
export function findRoute(
  campus,
  startNodeId,
  destinationNodeId,
  options = {}
) {
  const nodes = new Map(
    campus.nodes.map((node) => [node.id, node])
  );

  // 출발지 / 목적지가 실제 존재하는지 확인
  if (
    !nodes.has(startNodeId) ||
    !nodes.has(destinationNodeId)
  ) {
    throw new Error("Unknown start or destination node");
  }


  /**
   * ------------------------------------------------
   * 1. 그래프 생성
   * ------------------------------------------------
   */

  const adjacency = new Map(
    campus.nodes.map((node) => [node.id, []])
  );

  for (const edge of campus.edges) {
    // 휠체어 모드일 경우
    // 접근 불가능한 edge 제외
    if (options.wheelchair && !edge.accessible) {
      continue;
    }

    const fromNode = nodes.get(edge.from);
    const toNode = nodes.get(edge.to);

    const isEscalator =
      edge.type === "escalator" ||
      fromNode.connectorType === "escalator" ||
      toNode.connectorType === "escalator";
    
    if (
      options.avoidEscalator &&
      isEscalator
    ) {
      continue;
    }

    // 잘못된 edge 데이터 방어
    if (!fromNode || !toNode) {
      console.warn(
        `Skipping invalid edge ${edge.id}:`,
        edge.from,
        edge.to
      );
      continue;
    }


    /**
     * 이동거리
     *
     * edges.json에 routing_cost_estimate가 있으면
     * data.js에서 lengthMeters로 들어옴.
     *
     * 없으면 x/y 좌표 거리 사용.
     */
    const weight =
      edge.lengthMeters ??
      distance(fromNode, toNode);


    /**
     * 층간 이동량
     *
     * 같은 층:
     * 3F → 3F = 0
     *
     * 한 층:
     * 3F → 4F = 1
     *
     * 두 층:
     * 3F → 5F = 2
     *
     * 중요한 점:
     * 단순히 "vertical edge 개수"가 아니라
     * 실제 몇 층을 이동했는지를 계산한다.
     *
     * 따라서
     * 3 → 4 → 5 = 총 2
     * 3 → 2 → 3 → 4 → 5 = 총 4
     *
     * 가 되어 불필요한 층간 이동이 제거된다.
     */
    const floorTravel = Math.abs(
      Number(toNode.floor) - Number(fromNode.floor)
    );


    // 정방향 edge
    adjacency.get(edge.from).push({
      nodeId: edge.to,
      edge,
      weight,
      floorTravel,
    });


    // 양방향 edge라면 역방향도 추가
    if (!edge.oneWay) {
      adjacency.get(edge.to).push({
        nodeId: edge.from,
        edge,
        weight,
        floorTravel,
      });
    }
  }


  /**
   * ------------------------------------------------
   * 2. Lexicographic Dijkstra
   * ------------------------------------------------
   *
   * 기존:
   *
   * distance
   *
   * 하나만 비교
   *
   *
   * 변경:
   *
   * {
   *   floorTravel,
   *   distance
   * }
   *
   * 두 값을 우선순위대로 비교
   */


  const costs = new Map();

  costs.set(startNodeId, {
    floorTravel: 0,
    distance: 0,
  });


  const previous = new Map();

  const unvisited = new Set(nodes.keys());


  while (unvisited.size > 0) {
    let current = null;
    let currentCost = null;


    /**
     * 아직 방문하지 않은 node 중
     * 가장 좋은 비용의 node 선택
     */
    for (const nodeId of unvisited) {
      const cost = costs.get(nodeId);

      // 아직 도달하지 못한 node
      if (!cost) {
        continue;
      }

      if (
        current === null ||
        isBetterCost(cost, currentCost)
      ) {
        current = nodeId;
        currentCost = cost;
      }
    }


    // 더 이상 갈 수 있는 곳 없음
    if (current === null) {
      break;
    }


    // 목적지 도착
    if (current === destinationNodeId) {
      break;
    }


    unvisited.delete(current);


    /**
     * 현재 node와 연결된 모든 이웃 탐색
     */
    for (const neighbor of adjacency.get(current)) {
      if (!unvisited.has(neighbor.nodeId)) {
        continue;
      }


      /**
       * 현재 경로를 통해 neighbor로 갔을 때
       * 새로운 비용 계산
       */
      const candidateCost = {
        floorTravel:
          currentCost.floorTravel +
          neighbor.floorTravel,

        distance:
          currentCost.distance +
          neighbor.weight,
      };


      const existingCost =
        costs.get(neighbor.nodeId);


      /**
       * 핵심
       *
       * candidate가 기존 경로보다 좋다면 교체
       *
       * 비교 순서:
       *
       * floorTravel
       * ↓
       * distance
       */
      if (
        isBetterCost(
          candidateCost,
          existingCost
        )
      ) {
        costs.set(
          neighbor.nodeId,
          candidateCost
        );


        previous.set(
          neighbor.nodeId,
          {
            nodeId: current,
            edgeId: neighbor.edge.id,
          }
        );
      }
    }
  }


  /**
   * ------------------------------------------------
   * 3. 경로 존재 여부 확인
   * ------------------------------------------------
   */

  if (!costs.has(destinationNodeId)) {
    throw new Error("No accessible route found");
  }


  /**
   * ------------------------------------------------
   * 4. 최종 경로 복원
   * ------------------------------------------------
   */

  const nodeIds = [];
  const edgeIds = [];

  let cursor = destinationNodeId;


  while (cursor) {
    nodeIds.unshift(cursor);

    const previousInfo =
      previous.get(cursor);

    if (!previousInfo) {
      break;
    }

    edgeIds.unshift(
      previousInfo.edgeId
    );

    cursor =
      previousInfo.nodeId;
  }


  const finalCost =
    costs.get(destinationNodeId);


  /**
   * ------------------------------------------------
   * 5. 경로 결과 반환
   * ------------------------------------------------
   */

  return {
    id: crypto.randomUUID(),

    startNodeId,
    destinationNodeId,

    nodeIds,
    edgeIds,


    /**
     * 현재 실측 m가 아니라
     * 프로토타입 가중치
     */
    distanceMeters:
      Math.round(
        finalCost.distance
      ),


    /**
     * 이번에 추가
     *
     * 경로가 총 몇 층만큼
     * 수직 이동하는지 확인 가능
     */
    floorTravel:
      finalCost.floorTravel,


    maneuvers:
      createManeuvers(
        nodeIds.map(
          (id) => nodes.get(id)
        )
      ),
  };
}


/**
 * 층간 이동수단 한글 이름
 */
function connectorKo(node) {
  const type =
    node?.connectorType;

  if (type === "elevator") {
    return "엘리베이터";
  }

  if (type === "escalator") {
    return "에스컬레이터";
  }

  if (type === "stair") {
    return "계단";
  }

  return (
    node?.connectorName ||
    "층간 이동 수단"
  );
}


/**
 * ------------------------------------------------
 * 실제 사용자 안내 문구 생성
 * ------------------------------------------------
 */
function createManeuvers(nodes) {
  return nodes.map(
    (node, index) => {

      /**
       * 출발
       */
      if (index === 0) {
        return {
          nodeId: node.id,
          floor: node.floor,

          action: "START",

          text: {
            ko:
              `${node.floor}층 현재 위치에서 출발하세요.`,

            en:
              `Start from your current position on floor ${node.floor}.`,
          },
        };
      }


      /**
       * 목적지 도착
       */
      if (
        index ===
        nodes.length - 1
      ) {
        return {
          nodeId: node.id,
          floor: node.floor,

          action: "ARRIVE",

          text: {
            ko:
              "목적지에 도착했습니다.",

            en:
              "You have arrived at your destination.",
          },
        };
      }


      const previous =
        nodes[index - 1];

      const next =
        nodes[index + 1];


      /**
       * ------------------------------------------------
       * 다음 node가 다른 층이면
       * 좌회전/우회전 대신 층 이동 안내
       * ------------------------------------------------
       */
      if (
        next.floor !== node.floor
      ) {
        const connectorNode =
          node.connectorType
            ? node
            : next;

        const transport =
          connectorKo(
            connectorNode
          );


        const targetFloor =
          next.floor;


        const direction =
          Number(targetFloor) >
          Number(node.floor)
            ? "올라가세요"
            : "내려가세요";


        return {
          nodeId: node.id,
          floor: node.floor,

          action:
            "CHANGE_FLOOR",

          targetFloor,

          connectorType:
            node.connectorType ||
            next.connectorType ||
            null,

          text: {
            ko:
              `${transport}를 이용해 ${targetFloor}층으로 ${direction}.`,

            en:
              `Use the ${transport} to go to floor ${targetFloor}.`,
          },

          landmark:
            node.name,
        };
      }


      /**
       * ------------------------------------------------
       * 방금 다른 층에서 도착한 경우
       * ------------------------------------------------
       */
      if (
        previous.floor !==
        node.floor
      ) {
        return {
          nodeId: node.id,
          floor: node.floor,

          action:
            "FLOOR_ARRIVAL",

          text: {
            ko:
              `${node.floor}층에 도착했습니다. 안내 경로를 따라 이동하세요.`,

            en:
              `You are now on floor ${node.floor}. Follow the route.`,
          },

          landmark:
            node.name,
        };
      }


      /**
       * ------------------------------------------------
       * 같은 층에서 방향 계산
       * ------------------------------------------------
       */

      const a = previous;
      const b = node;
      const c = next;


      const vector1X =
        b.x - a.x;

      const vector1Y =
        b.y - a.y;

      const vector2X =
        c.x - b.x;

      const vector2Y =
        c.y - b.y;


      const cross =
        vector1X * vector2Y -
        vector1Y * vector2X;


      let action;

      if (
        Math.abs(cross) <
        0.01
      ) {
        action = "CONTINUE";
      } else if (cross > 0) {
        action = "TURN_LEFT";
      } else {
        action = "TURN_RIGHT";
      }


      let ko;
      let en;


      if (
        action === "CONTINUE"
      ) {
        ko = "직진하세요.";
        en = "Continue straight.";
      }

      if (
        action === "TURN_LEFT"
      ) {
        ko = "좌회전하세요.";
        en = "Turn left.";
      }

      if (
        action === "TURN_RIGHT"
      ) {
        ko = "우회전하세요.";
        en = "Turn right.";
      }


      return {
        nodeId: node.id,
        floor: node.floor,

        action,

        text: {
          ko,
          en,
        },

        landmark:
          node.name,
      };
    }
  );
}
