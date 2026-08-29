import {
  SimulatorPositionProvider,
  NativeBeaconPositionProvider,
} from "/positioning.js";
import { GuidanceScene, loadFloorGeometry } from "/scene3d.js";

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

  // 현재 위치 선택
  currentFloor: 1,
  selectedPosition: null,
  startNodeId: null,

  // 목적지 검색/층 선택
  destinationFloor: null,
  destinationPoiId: null,
  destinationSearch: "",

  // 이동 방법
  canUseEscalator: false,

  // 경로/3D 안내
  routeFloor: null,
  floorGeometry: null,
  scene: null,
  lastPosition: null,
};

const api = async (path, options) => {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
};

const t = (value) => value?.[state.locale] || value?.ko || value || "";
const nodeById = (id) => state.campus?.nodes.find((node) => node.id === id);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function mapPointForNode(node) {
  const meta = FLOOR_META[node.floor];
  if (!meta) return null;

  if (Number.isFinite(node.sourceMapX) && Number.isFinite(node.sourceMapY)) {
    const sourceBaseHeight = 800;
    return {
      x: node.sourceMapX,
      y: (node.sourceMapY / sourceBaseHeight) * meta.height,
    };
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
        <span class="map-hint">${
          selectable
            ? "지도에서 현재 위치를 눌러주세요"
            : "층별 경로 미리보기"
        }</span>
      </div>
      <div class="map-frame ${selectable ? "selectable" : ""}">
        <img
          class="floor-image"
          src="/floors/${floor}F.png"
          alt="세브란스 본관 ${floor}층 평면도"
        >
        <svg
          id="map-overlay"
          class="map-overlay"
          viewBox="0 0 ${meta.width} ${meta.height}"
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
    (node) =>
      Number(node.floor) === Number(floor) &&
      WALKABLE_TYPES.has(node.type)
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
  if (
    !svg ||
    !state.selectedPosition ||
    state.selectedPosition.floor !== state.currentFloor
  ) {
    return;
  }

  const { x, y } = state.selectedPosition;
  const startNode = nodeById(state.startNodeId);
  const snapped = startNode ? mapPointForNode(startNode) : null;

  svg.innerHTML = `
    ${
      snapped
        ? `<line class="snap-line" x1="${x}" y1="${y}" x2="${snapped.x}" y2="${snapped.y}"></line>`
        : ""
    }
    ${
      snapped
        ? `<circle class="snap-node" cx="${snapped.x}" cy="${snapped.y}" r="7"></circle>`
        : ""
    }
    <circle class="location-halo" cx="${x}" cy="${y}" r="18"></circle>
    <circle class="location-dot" cx="${x}" cy="${y}" r="9"></circle>
    <text class="map-label" x="${x + 16}" y="${y - 16}">현재 위치</text>
  `;
}

function destinationFloors() {
  return [
    ...new Set(
      state.pois
        .map((poi) => Number(poi.floor))
        .filter(Number.isFinite)
    ),
  ].sort((a, b) => a - b);
}

function destinationFilter() {
  const query = state.destinationSearch.trim().toLowerCase();

  return [...state.pois]
    .filter((poi) => {
      const floorMatches =
        state.destinationFloor === null ||
        Number(poi.floor) === Number(state.destinationFloor);

      if (!floorMatches) return false;
      if (!query) return true;

      const name = t(poi.name).toLowerCase();
      const category = String(poi.category || "").toLowerCase();
      return name.includes(query) || category.includes(query);
    })
    .sort(
      (a, b) =>
        Number(a.floor) - Number(b.floor) ||
        t(a.name).localeCompare(t(b.name), "ko")
    );
}

function renderDestinationList() {
  const container = document.querySelector("#destination-list");
  if (!container) return;

  const pois = destinationFilter();
  const query = state.destinationSearch.trim();

  if (!pois.length) {
    container.innerHTML = `
      <div class="destination-empty">
        ${
          query
            ? "이 조건에 맞는 검색 결과가 없습니다."
            : state.destinationFloor === null
              ? "등록된 목적지가 없습니다."
              : `${state.destinationFloor}층에 등록된 목적지가 없습니다.`
        }
      </div>
    `;
    updateRouteButton();
    return;
  }

  container.innerHTML = pois
    .map(
      (poi) => `
        <button
          type="button"
          class="destination-item ${
            state.destinationPoiId === poi.id ? "selected" : ""
          }"
          data-poi-id="${escapeHtml(poi.id)}"
        >
          <span class="destination-floor">${poi.floor}F</span>
          <span class="destination-info">
            <strong>${escapeHtml(t(poi.name))}</strong>
            <small>${escapeHtml(poi.category || "병원 시설")}</small>
          </span>
          <span class="destination-check">✓</span>
        </button>
      `
    )
    .join("");

  container.querySelectorAll(".destination-item").forEach((button) => {
    button.onclick = () => {
      state.destinationPoiId = button.dataset.poiId;
      container
        .querySelectorAll(".destination-item")
        .forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      updateRouteButton();
    };
  });

  updateRouteButton();
}

function updateRouteButton() {
  const button = document.querySelector("#route");
  if (!button) return;

  const ready = Boolean(state.startNodeId && state.destinationPoiId);
  button.disabled = !ready;

  if (!state.startNodeId) {
    button.textContent = "현재 위치를 먼저 선택해주세요";
  } else if (!state.destinationPoiId) {
    button.textContent = "목적지를 선택해주세요";
  } else {
    button.textContent = "이곳으로 길찾기";
  }
}

async function showHome() {
  state.scene?.destroy();
  state.scene = null;
  state.provider?.stop?.();

  if (!state.campus || !state.pois.length) {
    [state.campus, state.pois] = await Promise.all([
      api("/api/campus"),
      api("/api/pois"),
    ]);
  }

  const floors = destinationFloors();

  root.innerHTML = `
    <header class="header">
      <h1>세브란스 길동무</h1>
      <p>병원 실내 길찾기</p>
    </header>

    <section class="content">
      <div class="notice">
        프로토타입 지도입니다. 실제 통행 가능 여부와 위치 정확도는 현장 검증이 필요합니다.
      </div>

      <div class="card">
        <div class="step-title">
          <span>1</span>
          <strong>이동 방법을 선택해주세요</strong>
        </div>

        <p class="helper-text">
          에스컬레이터 이용이 어려운 경우 층간 이동은 엘리베이터만 사용하도록 안내합니다.
        </p>

        <div class="mobility-options">
          <label class="mobility-option ${
            state.canUseEscalator ? "active" : ""
          }">
            <input
              type="radio"
              name="escalator"
              value="yes"
              ${state.canUseEscalator ? "checked" : ""}
            >
            <span class="mobility-icon">↗</span>
            <span>
              <strong>에스컬레이터 이용 가능</strong>
              <small>엘리베이터와 에스컬레이터를 모두 이용할 수 있어요</small>
            </span>
          </label>

          <label class="mobility-option ${
            !state.canUseEscalator ? "active" : ""
          }">
            <input
              type="radio"
              name="escalator"
              value="no"
              ${!state.canUseEscalator ? "checked" : ""}
            >
            <span class="mobility-icon">♿</span>
            <span>
              <strong>에스컬레이터 이용 어려움</strong>
              <small>층간 이동은 엘리베이터만 이용하도록 안내해요</small>
            </span>
          </label>
        </div>
      </div>

      <div class="card">
        <div class="step-title">
          <span>2</span>
          <strong>현재 위치를 설정해주세요</strong>
        </div>

        <p class="helper-text">
          현재 층을 먼저 고른 뒤 평면도에서 내 위치를 눌러주세요.
        </p>

        <div class="floor-picker" id="current-floor-picker">
          ${[1, 2, 3, 4, 5, 6]
            .map(
              (floor) => `
                <button
                  type="button"
                  class="floor-button ${
                    state.currentFloor === floor ? "active" : ""
                  }"
                  data-current-floor="${floor}"
                >
                  ${floor}F
                </button>
              `
            )
            .join("")}
        </div>

        ${mapMarkup(state.currentFloor, true)}

        <div
          id="location-status"
          class="location-status ${state.startNodeId ? "ready" : ""}"
        >
          ${
            state.startNodeId
              ? "현재 위치가 설정되었습니다. 가장 가까운 통로를 출발점으로 사용합니다."
              : "지도를 한 번 눌러 현재 위치를 지정해주세요."
          }
        </div>
      </div>

      <div class="card">
        <div class="step-title">
          <span>3</span>
          <strong>어디로 가시나요?</strong>
        </div>

        <div class="destination-search">
          <span>🔍</span>
          <input
            type="search"
            id="destination-search"
            placeholder="진료과, 검사실, 편의시설 검색"
            autocomplete="off"
            value="${escapeHtml(state.destinationSearch)}"
          >
        </div>

        <div class="destination-divider">
          검색하거나 층별로 살펴보세요. 검색어는 층을 바꿔도 유지됩니다.
        </div>

        <div class="floor-picker" id="destination-floor-picker">
          <button
            type="button"
            class="floor-button ${
              state.destinationFloor === null ? "active" : ""
            }"
            data-destination-floor="all"
          >
            전체
          </button>
          ${floors
            .map(
              (floor) => `
                <button
                  type="button"
                  class="floor-button ${
                    Number(state.destinationFloor) === floor ? "active" : ""
                  }"
                  data-destination-floor="${floor}"
                >
                  ${floor}층
                </button>
              `
            )
            .join("")}
        </div>

        <div class="destination-list" id="destination-list"></div>
      </div>

      <div class="card">
        <button class="button" id="route" disabled>
          현재 위치와 목적지를 선택해주세요
        </button>
      </div>
    </section>
  `;

  // 이동 방법
  document.querySelectorAll('input[name="escalator"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      state.canUseEscalator = event.target.value === "yes";

      document
        .querySelectorAll(".mobility-option")
        .forEach((item) => item.classList.remove("active"));
      event.target.closest(".mobility-option")?.classList.add("active");
    });
  });

  // 현재 층
  document.querySelectorAll("[data-current-floor]").forEach((button) => {
    button.onclick = () => {
      state.currentFloor = Number(button.dataset.currentFloor);
      state.selectedPosition = null;
      state.startNodeId = null;
      showHome();
    };
  });

  // 현재 위치 클릭
  const overlay = document.querySelector("#map-overlay");
  overlay.addEventListener("click", (event) => {
    const point = svgPointFromEvent(overlay, event);
    const { node } = nearestWalkableNode(state.currentFloor, point);

    if (!node) {
      alert("이 층에서 사용할 수 있는 경로 지점을 찾지 못했습니다.");
      return;
    }

    state.selectedPosition = {
      floor: state.currentFloor,
      x: point.x,
      y: point.y,
    };
    state.startNodeId = node.id;

    const status = document.querySelector("#location-status");
    status.classList.add("ready");
    status.textContent =
      "현재 위치가 설정되었습니다. 가장 가까운 통로를 출발점으로 사용합니다.";

    renderHomeOverlay();
    updateRouteButton();
  });

  // 목적지 검색 - 검색 시작 시 전체 층에서 검색
  document.querySelector("#destination-search").addEventListener("input", (event) => {
    state.destinationSearch = event.target.value;

    if (state.destinationSearch.trim()) {
      state.destinationFloor = null;
      document
        .querySelectorAll("[data-destination-floor]")
        .forEach((item) => item.classList.remove("active"));
      document
        .querySelector('[data-destination-floor="all"]')
        ?.classList.add("active");
    }

    renderDestinationList();
  });

  // 목적지 층 - 검색어는 절대 지우지 않음
  document.querySelectorAll("[data-destination-floor]").forEach((button) => {
    button.onclick = () => {
      state.destinationFloor =
        button.dataset.destinationFloor === "all"
          ? null
          : Number(button.dataset.destinationFloor);

      document
        .querySelectorAll("[data-destination-floor]")
        .forEach((item) => item.classList.remove("active"));
      button.classList.add("active");

      renderDestinationList();
    };
  });

  document.querySelector("#route").onclick = createRoute;

  renderHomeOverlay();
  renderDestinationList();
  updateRouteButton();
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
  const lastNode = nodeById(
    state.route.nodeIds[state.route.nodeIds.length - 1]
  );
  const currentNode = currentNodeId ? nodeById(currentNodeId) : null;

  const lines = segments
    .filter((segment) => segment.length >= 2)
    .map((segment) => {
      const points = segment
        .map(mapPointForNode)
        .filter(Boolean)
        .map((p) => `${p.x},${p.y}`)
        .join(" ");

      return `
        <polyline class="route-line route-line-under" points="${points}"></polyline>
        <polyline class="route-line" points="${points}"></polyline>
      `;
    })
    .join("");

  const firstPoint =
    firstNode?.floor === floor ? mapPointForNode(firstNode) : null;
  const lastPoint =
    lastNode?.floor === floor ? mapPointForNode(lastNode) : null;
  const currentPoint =
    currentNode?.floor === floor ? mapPointForNode(currentNode) : null;

  let transitionMarkup = "";

  state.route.nodeIds.forEach((id, index) => {
    const node = nodeById(id);
    const next = nodeById(state.route.nodeIds[index + 1]);

    if (node?.floor === floor && next && next.floor !== floor) {
      const p = mapPointForNode(node);
      if (!p) return;

      transitionMarkup += `
        <circle class="transition-dot" cx="${p.x}" cy="${p.y}" r="10"></circle>
        <text class="transition-label" x="${p.x + 16}" y="${p.y - 14}">
          ${next.floor}층으로 이동
        </text>
      `;
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
    ${
      firstPoint
        ? `<circle class="route-start" cx="${firstPoint.x}" cy="${firstPoint.y}" r="11"></circle>`
        : ""
    }
    ${
      lastPoint
        ? `<circle class="route-destination" cx="${lastPoint.x}" cy="${lastPoint.y}" r="12"></circle>`
        : ""
    }
    ${
      currentPoint
        ? `<circle class="current-halo" cx="${currentPoint.x}" cy="${currentPoint.y}" r="20"></circle><circle class="current-dot" cx="${currentPoint.x}" cy="${currentPoint.y}" r="10"></circle>`
        : ""
    }
  `;
}

async function createRoute() {
  if (!state.startNodeId) {
    alert("먼저 평면도에서 현재 위치를 선택해주세요.");
    return;
  }

  if (!state.destinationPoiId) {
    alert("목적지를 선택해주세요.");
    return;
  }

  const button = document.querySelector("#route");
  button.disabled = true;
  button.textContent = "경로를 찾고 있습니다…";

  try {
    state.route = await api("/api/routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startNodeId: state.startNodeId,
        destinationPoiId: state.destinationPoiId,
        profile: {
          wheelchair: false,
          avoidEscalator: !state.canUseEscalator,
          allowStairs: false,
        },
      }),
    });

    state.routeFloor = routeFloors()[0];
    showRoute();
  } catch (error) {
    alert(error.message);
    button.disabled = false;
    button.textContent = "이곳으로 길찾기";
  }
}

function showRoute() {
  state.scene?.destroy();
  state.scene = null;

  const floors = routeFloors();
  if (!floors.includes(state.routeFloor)) state.routeFloor = floors[0];

  root.innerHTML = `
    <header class="header">
      <h1>경로를 찾았습니다</h1>
      <p>${floors.map((floor) => `${floor}F`).join(" → ")}</p>
    </header>

    <section class="content">
      ${
        !state.canUseEscalator
          ? `
            <div class="accessibility-banner">
              ♿ 에스컬레이터와 계단을 제외하고 층간 이동은 엘리베이터만 이용하는 경로입니다.
            </div>
          `
          : `
            <div class="accessibility-banner">
              ↗ 엘리베이터와 에스컬레이터를 모두 고려한 경로입니다.
            </div>
          `
      }

      <div class="card">
        <div class="map-title-row">
          <strong>평면도로 전체 경로 확인</strong>
          <span class="map-hint">층 버튼을 눌러보세요</span>
        </div>

        <div class="route-floor-tabs">
          ${floors
            .map(
              (floor) => `
                <button
                  class="route-floor-button ${
                    state.routeFloor === floor ? "active" : ""
                  }"
                  data-floor="${floor}"
                >
                  ${floor}F
                </button>
              `
            )
            .join("")}
        </div>

        ${mapMarkup(state.routeFloor, false)}
      </div>

      <div class="card">
        <ol class="route-list">
          ${state.route.maneuvers
            .map(
              (maneuver, index) => `
                <li>
                  <div class="marker"><span>${index + 1}</span></div>
                  <div>
                    <h3>${escapeHtml(t(maneuver.text))}</h3>
                    <p>${
                      maneuver.landmark
                        ? escapeHtml(t(maneuver.landmark))
                        : ""
                    }</p>
                  </div>
                </li>
              `
            )
            .join("")}
        </ol>
      </div>

      <button class="button button-3d" id="navigate">
        3D 입체 안내 시작
      </button>

      <button class="button secondary" id="back">
        다시 선택
      </button>
    </section>
  `;

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

function findHeadingNode(index) {
  const current = nodeById(state.route.nodeIds[index]);
  if (!current) return null;

  for (let i = index + 1; i < state.route.nodeIds.length; i += 1) {
    const candidate = nodeById(state.route.nodeIds[i]);
    if (!candidate) continue;
    if (candidate.floor !== current.floor) break;

    const dx =
      (candidate.localX ?? candidate.x) - (current.localX ?? current.x);
    const dy =
      (candidate.localY ?? candidate.y) - (current.localY ?? current.y);

    if (Math.hypot(dx, dy) > 2) return candidate;
  }

  return null;
}

async function startNavigation() {
  const native = new NativeBeaconPositionProvider();
  state.provider = native.isAvailable()
    ? native
    : new SimulatorPositionProvider();

  state.maneuverIndex = 0;
  state.floorGeometry = await loadFloorGeometry();
  state.lastPosition = {
    confidence: 1,
    source: state.provider.name,
    nodeId: state.route.nodeIds[0],
  };

  show3DGuidance(state.lastPosition);

  await state.provider.start(state.route, (position) => {
    state.lastPosition = position;

    const match = state.route.maneuvers.findIndex(
      (maneuver) => maneuver.nodeId === position.nodeId
    );

    if (match >= 0) state.maneuverIndex = match;
    show3DGuidance(position);
  });
}

function glyphFor(action) {
  return (
    {
      START: "↑",
      CONTINUE: "↑",
      TURN_LEFT: "↰",
      TURN_RIGHT: "↱",
      CHANGE_FLOOR: "⇧",
      FLOOR_ARRIVAL: "↑",
      ARRIVE: "●",
    }[action] || "↑"
  );
}

function show3DGuidance(
  position = state.lastPosition || { confidence: 1, source: "simulator" }
) {
  const maneuver = state.route.maneuvers[state.maneuverIndex];
  const currentNode =
    nodeById(maneuver.nodeId) ||
    nodeById(state.route.nodeIds[state.maneuverIndex]);

  if (!currentNode) return;

  const routeNodes = state.route.nodeIds.map(nodeById).filter(Boolean);
  const headingNode = findHeadingNode(state.maneuverIndex);
  const floorChange = maneuver.action === "CHANGE_FLOOR";

  state.scene?.destroy();
  state.scene = null;

  root.innerHTML = `
    <section class="guidance3d">
      <div class="guidance3d-top">
        <div class="floor-chip">${currentNode.floor}F</div>
        <div class="guidance3d-text">
          <div class="guidance-mini-arrow">${glyphFor(maneuver.action)}</div>
          <div>
            <strong>${escapeHtml(t(maneuver.text))}</strong>
            <span>${
              maneuver.landmark
                ? escapeHtml(t(maneuver.landmark))
                : "현재 위치 주변 입체 안내"
            }</span>
          </div>
        </div>
      </div>

      <div class="scene3d-shell">
        <canvas
          id="scene3d-canvas"
          aria-label="현재 위치 주변 3D 길안내"
        ></canvas>

        <button class="scene3d-recenter" id="recenter3d">
          진행방향으로 보기
        </button>

        <div class="scene3d-legend">
          <span><i class="legend-user"></i>현재 위치</span>
          <span><i class="legend-route"></i>경로</span>
          <span><i class="legend-arrow"></i>진행 방향</span>
        </div>
      </div>

      <div class="guidance3d-bottom">
        <div>
          <strong>
            ${state.maneuverIndex + 1} / ${state.route.maneuvers.length} 단계
          </strong>
          <span>
            위치 신뢰도 ${Math.round((position.confidence || 0) * 100)}%
            · ${escapeHtml(position.source || "unknown")}
          </span>
        </div>

        <button
          class="mini-button"
          id="previous-step"
          ${state.maneuverIndex === 0 ? "disabled" : ""}
        >
          이전
        </button>

        <button
          class="mini-button primary"
          id="next-step"
          ${
            state.maneuverIndex >= state.route.maneuvers.length - 1
              ? "disabled"
              : ""
          }
        >
          다음
        </button>
      </div>

      <button class="guidance-exit" id="exit">
        3D 안내 종료
      </button>
    </section>
  `;

  const canvas = document.querySelector("#scene3d-canvas");

  state.scene = new GuidanceScene(canvas, {
    floor: currentNode.floor,
    currentNode,
    headingNode,
    routeNodes,
    geometry: state.floorGeometry,
    floorChange,
    targetFloor: maneuver.targetFloor,
  });

  document.querySelector("#recenter3d").onclick = () =>
    state.scene?.recenter();

  document.querySelector("#previous-step").onclick = () => {
    if (state.maneuverIndex > 0) {
      state.maneuverIndex -= 1;
      show3DGuidance({
        ...position,
        nodeId: state.route.nodeIds[state.maneuverIndex],
        source: "manual-preview",
      });
    }
  };

  document.querySelector("#next-step").onclick = () => {
    if (state.maneuverIndex < state.route.maneuvers.length - 1) {
      state.maneuverIndex += 1;
      show3DGuidance({
        ...position,
        nodeId: state.route.nodeIds[state.maneuverIndex],
        source: "manual-preview",
      });
    }
  };

  document.querySelector("#exit").onclick = () => {
    state.provider?.stop?.();
    state.scene?.destroy();
    state.scene = null;
    showRoute();
  };
}

showHome().catch((error) => {
  root.innerHTML = `
    <p class="content">
      서비스를 불러오지 못했습니다: ${escapeHtml(error.message)}
    </p>
  `;
});
