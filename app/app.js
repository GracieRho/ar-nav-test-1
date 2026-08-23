import { SimulatorPositionProvider, NativeBeaconPositionProvider } from "/positioning.js";

const root = document.querySelector("#app");

const BASE_W = 992;
const BASE_H = 1140;

const FLOOR_META = {
  1: { width: 992, height: 666 },
  2: { width: 1130, height: 804 },
  3: { width: 992, height: 800 },
  4: { width: 992, height: 1140 },
  5: { width: 992, height: 951 },
  6: { width: 993, height: 1114 },
};

const WALKABLE_TYPES = new Set([
  "corridor",
  "junction",
  "entrance_connector",
  "connector_access",
]);

const state = {
  campus: null,
  pois: [],
  route: null,
  maneuverIndex: 0,
  locale: "ko",
  provider: null,
  selectedFloor: 1,
  selectedPosition: null,
  startNodeId: null,
  routeFloor: null,
};

const api = async (path, options) => {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
};

const t = (value) => value?.[state.locale] || value?.ko || value || "";

function nodeById(id) {
  return state.campus?.nodes.find((node) => node.id === id);
}

function mapPointForNode(node) {
  const meta = FLOOR_META[node.floor];
  if (!meta) return null;

  if (Number.isFinite(node.sourceMapX) && Number.isFinite(node.sourceMapY)) {
    return { x: node.sourceMapX, y: node.sourceMapY };
  }

  const localX = Number.isFinite(node.localX) ? node.localX : node.x;
  const localY = Number.isFinite(node.localY) ? node.localY : node.y;

  return {
    x: (localX / BASE_W) * meta.width,
    y: (localY / BASE_H) * meta.height,
  };
}

function mapMarkup(floor, selectable = false) {
  const meta = FLOOR_META[floor];
  return `
    <div class="map-card">
      <div class="map-title-row">
        <strong>${floor}층 평면도</strong>
        <span class="map-hint">${selectable ? "지도에서 현재 위치를 눌러주세요" : "경로 확인"}</span>
      </div>
      <div class="map-frame ${selectable ? "selectable" : ""}">
        <img class="floor-image" src="/floors/${floor}F.png" alt="세브란스 본관 ${floor}층 평면도">
        <svg
          id="map-overlay"
          class="map-overlay"
          viewBox="0 0 ${meta.width} ${meta.height}"
          aria-label="${floor}층 지도 오버레이"
        ></svg>
      </div>
    </div>`;
}

function svgPointFromEvent(svg, event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function nearestWalkableNode(floor, point) {
  const candidates = state.campus.nodes.filter(
    (node) => node.floor === floor && WALKABLE_TYPES.has(node.type)
  );

  let bestNode = null;
  let bestDistance = Infinity;

  for (const node of candidates) {
    const p = mapPointForNode(node);
    if (!p) continue;
    const distance = Math.hypot(p.x - point.x, p.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestNode = node;
    }
  }

  return { node: bestNode, distance: bestDistance };
}

function renderHomeOverlay() {
  const svg = document.querySelector("#map-overlay");
  if (!svg || !state.selectedPosition || state.selectedPosition.floor !== state.selectedFloor) return;

  const { x, y } = state.selectedPosition;
  const startNode = nodeById(state.startNodeId);
  const snapped = startNode ? mapPointForNode(startNode) : null;

  svg.innerHTML = `
    ${snapped ? `<line class="snap-line" x1="${x}" y1="${y}" x2="${snapped.x}" y2="${snapped.y}"></line>` : ""}
    ${snapped ? `<circle class="snap-node" cx="${snapped.x}" cy="${snapped.y}" r="7"></circle>` : ""}
    <circle class="location-halo" cx="${x}" cy="${y}" r="18"></circle>
    <circle class="location-dot" cx="${x}" cy="${y}" r="9"></circle>
    <text class="map-label" x="${x + 16}" y="${y - 16}">현재 위치</text>
  `;
}

function routeFloors() {
  const floors = [];
  for (const id of state.route?.nodeIds || []) {
    const floor = nodeById(id)?.floor;
    if (floor && !floors.includes(floor)) floors.push(floor);
  }
  return floors;
}

function routeSegmentsForFloor(floor) {
  const segments = [];
  let current = [];

  for (const id of state.route.nodeIds) {
    const node = nodeById(id);
    if (node?.floor === floor) {
      current.push(node);
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  }

  if (current.length) segments.push(current);
  return segments;
}

function renderRouteOverlay(floor, currentNodeId = null) {
  const svg = document.querySelector("#map-overlay");
  if (!svg || !state.route) return;

  const segments = routeSegmentsForFloor(floor);
  const firstNode = nodeById(state.route.nodeIds[0]);
  const lastNode = nodeById(state.route.nodeIds[state.route.nodeIds.length - 1]);
  const currentNode = currentNodeId ? nodeById(currentNodeId) : null;

  const lines = segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => {
      const points = segment
        .map(mapPointForNode)
        .filter(Boolean)
        .map((p) => `${p.x},${p.y}`)
        .join(" ");
      return `<polyline class="route-line route-line-under" points="${points}"></polyline><polyline class="route-line" points="${points}"></polyline>`;
    })
    .join("");

  const firstPoint = firstNode?.floor === floor ? mapPointForNode(firstNode) : null;
  const lastPoint = lastNode?.floor === floor ? mapPointForNode(lastNode) : null;
  const currentPoint = currentNode?.floor === floor ? mapPointForNode(currentNode) : null;

  let transitionMarkup = "";
  state.route.nodeIds.forEach((id, index) => {
    const node = nodeById(id);
    const next = nodeById(state.route.nodeIds[index + 1]);
    if (node?.floor === floor && next && next.floor !== floor) {
      const p = mapPointForNode(node);
      transitionMarkup += `<circle class="transition-dot" cx="${p.x}" cy="${p.y}" r="10"></circle><text class="transition-label" x="${p.x + 16}" y="${p.y - 14}">${next.floor}층으로 이동</text>`;
    }
  });

  const selectedConnector =
    state.selectedPosition?.floor === floor && firstPoint
      ? `<line class="selected-to-route" x1="${state.selectedPosition.x}" y1="${state.selectedPosition.y}" x2="${firstPoint.x}" y2="${firstPoint.y}"></line>`
      : "";

  svg.innerHTML = `
    ${lines}
    ${selectedConnector}
    ${transitionMarkup}
    ${firstPoint ? `<circle class="route-start" cx="${firstPoint.x}" cy="${firstPoint.y}" r="11"></circle><text class="map-label" x="${firstPoint.x + 16}" y="${firstPoint.y - 14}">출발</text>` : ""}
    ${lastPoint ? `<circle class="route-destination" cx="${lastPoint.x}" cy="${lastPoint.y}" r="12"></circle><text class="map-label" x="${lastPoint.x + 17}" y="${lastPoint.y - 15}">목적지</text>` : ""}
    ${currentPoint ? `<circle class="current-halo" cx="${currentPoint.x}" cy="${currentPoint.y}" r="20"></circle><circle class="current-dot" cx="${currentPoint.x}" cy="${currentPoint.y}" r="10"></circle>` : ""}
  `;
}

async function showHome() {
  if (!state.campus || !state.pois.length) {
    [state.campus, state.pois] = await Promise.all([
      api("/api/campus"),
      api("/api/pois"),
    ]);
  }

  const destinationOptions = [...state.pois]
    .sort((a, b) => a.floor - b.floor || t(a.name).localeCompare(t(b.name), "ko"))
    .map((poi) => `<option value="${poi.id}">${poi.floor}F · ${t(poi.name)}</option>`)
    .join("");

  root.innerHTML = `
    <header class="header">
      <h1>세브란스 길동무</h1>
      <p>병원 실내 길찾기</p>
    </header>

    <section class="content">
      <div class="notice">프로토타입 지도입니다. 실제 통행 가능 여부는 현장 검증이 필요합니다.</div>

      <div class="card">
        <div class="step-title"><span>1</span><strong>현재 층을 선택해주세요</strong></div>
        <div class="floor-picker">
          ${[1,2,3,4,5,6].map((floor) => `<button class="floor-button ${state.selectedFloor === floor ? "active" : ""}" data-floor="${floor}">${floor}F</button>`).join("")}
        </div>
      </div>

      <div class="card">
        <div class="step-title"><span>2</span><strong>평면도에서 내 위치를 선택해주세요</strong></div>
        ${mapMarkup(state.selectedFloor, true)}
        <div id="location-status" class="location-status ${state.startNodeId ? "ready" : ""}">
          ${state.startNodeId ? "현재 위치가 설정되었습니다. 가장 가까운 통로를 출발점으로 사용합니다." : "지도를 한 번 눌러 현재 위치를 지정해주세요."}
        </div>
      </div>

      <div class="card">
        <div class="step-title"><span>3</span><strong>목적지를 선택해주세요</strong></div>
        <select class="select" id="destination">${destinationOptions}</select>
      </div>

      <div class="card">
        <button class="button" id="route" ${state.startNodeId ? "" : "disabled"}>경로 찾기</button>
      </div>
    </section>`;

  document.querySelectorAll(".floor-button").forEach((button) => {
    button.onclick = () => {
      state.selectedFloor = Number(button.dataset.floor);
      state.selectedPosition = null;
      state.startNodeId = null;
      showHome();
    };
  });

  const overlay = document.querySelector("#map-overlay");
  overlay.addEventListener("click", (event) => {
    const point = svgPointFromEvent(overlay, event);
    const { node } = nearestWalkableNode(state.selectedFloor, point);

    if (!node) {
      alert("이 층에서 사용할 수 있는 경로 지점을 찾지 못했습니다.");
      return;
    }

    state.selectedPosition = {
      floor: state.selectedFloor,
      x: point.x,
      y: point.y,
    };
    state.startNodeId = node.id;

    const status = document.querySelector("#location-status");
    status.classList.add("ready");
    status.textContent = "현재 위치가 설정되었습니다. 가장 가까운 통로를 출발점으로 사용합니다.";
    document.querySelector("#route").disabled = false;
    renderHomeOverlay();
  });

  document.querySelector("#route").onclick = createRoute;
  renderHomeOverlay();
}

async function createRoute() {
  if (!state.startNodeId) {
    alert("먼저 평면도에서 현재 위치를 선택해주세요.");
    return;
  }

  const button = document.querySelector("#route");
  button.disabled = true;

  try {
    state.route = await api("/api/routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startNodeId: state.startNodeId,
        destinationPoiId: document.querySelector("#destination").value,
        profile: { wheelchair: false },
      }),
    });

    state.routeFloor = routeFloors()[0];
    showRoute();
  } catch (error) {
    alert(error.message);
    button.disabled = false;
  }
}

function showRoute() {
  const floors = routeFloors();
  if (!floors.includes(state.routeFloor)) state.routeFloor = floors[0];

  root.innerHTML = `
    <header class="header">
      <h1>경로 안내</h1>
      <p>${floors.map((f) => `${f}F`).join(" → ")} · ${state.route.nodeIds.length}개 경로 지점</p>
    </header>

    <section class="content">
      <div class="card">
        <div class="map-title-row"><strong>층별 경로</strong><span class="map-hint">층 버튼을 눌러 확인하세요</span></div>
        <div class="route-floor-tabs">
          ${floors.map((floor) => `<button class="route-floor-button ${state.routeFloor === floor ? "active" : ""}" data-floor="${floor}">${floor}F</button>`).join("")}
        </div>
        ${mapMarkup(state.routeFloor, false)}
      </div>

      <div class="card">
        <ol class="route-list">
          ${state.route.maneuvers.map((m, i) => `<li><div class="marker"><span>${i + 1}</span></div><div><h3>${t(m.text)}</h3><p>${m.landmark ? t(m.landmark) : ""}</p></div></li>`).join("")}
        </ol>
      </div>

      <button class="button" id="navigate">안내 시작</button>
      <button class="button secondary" id="back">다시 선택</button>
    </section>`;

  document.querySelectorAll(".route-floor-button").forEach((button) => {
    button.onclick = () => {
      state.routeFloor = Number(button.dataset.floor);
      showRoute();
    };
  });

  document.querySelector("#navigate").onclick = startNavigation;
  document.querySelector("#back").onclick = () => {
    state.route = null;
    state.routeFloor = null;
    showHome();
  };

  renderRouteOverlay(state.routeFloor);
}

async function startNavigation() {
  const native = new NativeBeaconPositionProvider();
  state.provider = native.isAvailable() ? native : new SimulatorPositionProvider();
  state.maneuverIndex = 0;

  showHud();

  await state.provider.start(state.route, (position) => {
    const match = state.route.maneuvers.findIndex(
      (maneuver) => maneuver.nodeId === position.nodeId
    );
    if (match >= 0) state.maneuverIndex = match;
    showHud(position);
  });
}

function showHud(position = { confidence: 1, source: state.provider?.name }) {
  const maneuver = state.route.maneuvers[state.maneuverIndex];
  const currentNode = nodeById(maneuver.nodeId);
  const floor = currentNode?.floor || routeFloors()[0];
  const glyph = {
    START: "↑",
    CONTINUE: "↑",
    TURN_LEFT: "↰",
    TURN_RIGHT: "↱",
    ARRIVE: "●",
  }[maneuver.action];

  root.innerHTML = `
    <header class="header guidance-header">
      <div class="guidance-glyph">${glyph}</div>
      <div>
        <h1>${t(maneuver.text)}</h1>
        <p>${maneuver.landmark ? t(maneuver.landmark) : `${floor}층`}</p>
      </div>
    </header>

    <section class="content">
      ${mapMarkup(floor, false)}

      <div class="card guidance-status">
        <strong>${state.maneuverIndex + 1} / ${state.route.maneuvers.length} 단계</strong>
        <div class="muted">현재 ${floor}층 · 위치 신뢰도 ${Math.round((position.confidence || 0) * 100)}% · ${position.source || "unknown"}</div>
      </div>

      <button class="button secondary" id="exit">안내 종료</button>
    </section>`;

  document.querySelector("#exit").onclick = () => {
    state.provider?.stop();
    showRoute();
  };

  renderRouteOverlay(floor, maneuver.nodeId);
}

showHome().catch((error) => {
  root.innerHTML = `<p class="content">서비스를 불러오지 못했습니다: ${error.message}</p>`;
});
