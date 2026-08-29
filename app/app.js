import {
  SimulatorPositionProvider,
  NativeBeaconPositionProvider,
} from "/positioning.js";


const root = document.querySelector("#app");


const state = {
  campus: null,
  pois: [],
  route: null,

  maneuverIndex: 0,
  locale: "ko",
  provider: null,

  // 목적지 선택
  selectedFloor: null,
  destinationPoiId: null,
  destinationSearch: "",

  // 기본값:
  // 병원 환자용 서비스이므로
  // 안전하게 "에스컬레이터 이용 어려움"으로 시작
  canUseEscalator: false,
};


const api = async (path, options) => {
  const response =
    await fetch(path, options);

  const body =
    await response.json();

  if (!response.ok) {
    throw new Error(
      body.error || "Request failed"
    );
  }

  return body;
};


const t = (value) =>
  value?.[state.locale] ||
  value?.ko ||
  value ||
  "";


/**
 * HTML 특수문자 방어
 */
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/**
 * ------------------------------------------------
 * 첫 화면
 * ------------------------------------------------
 */
async function showHome() {

  [state.campus, state.pois] =
    await Promise.all([
      api("/api/campus"),
      api("/api/pois"),
    ]);


  /**
   * 목적지가 존재하는 층만 추출
   */
  const destinationFloors =
    [
      ...new Set(
        state.pois
          .map((poi) =>
            Number(poi.floor)
          )
          .filter(Number.isFinite)
      ),
    ].sort((a, b) => a - b);


  /**
   * 기본 목적지 층
   */
  if (
    state.selectedFloor === null &&
    destinationFloors.length > 0
  ) {
    state.selectedFloor =
      destinationFloors[0];
  }


  root.innerHTML = `

    <header class="header">

      <h1>
        세브란스 길동무
      </h1>

      <p>
        병원 실내 길찾기
      </p>

    </header>


    <section class="content">


      <div class="notice">

        현재 프로토타입 지도 데이터로
        실행 중입니다.

      </div>


      <!-- ========================================
           STEP 1
           에스컬레이터 이용 여부
      ========================================= -->

      <div class="card">

        <div class="step-title">

          <span>1</span>

          <strong>
            이동 방법을 선택해주세요
          </strong>

        </div>


        <p class="helper-text">

          에스컬레이터 이용이 어려운 경우
          엘리베이터만 이용하는 경로를
          안내합니다.

        </p>


        <div class="mobility-options">


          <label
            class="mobility-option
            ${
              state.canUseEscalator
                ? "active"
                : ""
            }"
          >

            <input
              type="radio"
              name="escalator"
              value="yes"
              ${
                state.canUseEscalator
                  ? "checked"
                  : ""
              }
            >

            <span class="mobility-icon">
              ↗
            </span>

            <span>

              <strong>
                에스컬레이터 이용 가능
              </strong>

              <small>
                엘리베이터와 에스컬레이터를
                모두 이용할 수 있어요
              </small>

            </span>

          </label>



          <label
            class="mobility-option
            ${
              !state.canUseEscalator
                ? "active"
                : ""
            }"
          >

            <input
              type="radio"
              name="escalator"
              value="no"
              ${
                !state.canUseEscalator
                  ? "checked"
                  : ""
              }
            >

            <span class="mobility-icon">
              ♿
            </span>

            <span>

              <strong>
                에스컬레이터 이용 어려움
              </strong>

              <small>
                엘리베이터를 이용하는
                경로만 안내해요
              </small>

            </span>

          </label>


        </div>

      </div>



      <!-- ========================================
           STEP 2
           현재 위치
      ========================================= -->

      <div class="card">

        <div class="step-title">

          <span>2</span>

          <strong>
            현재 위치
          </strong>

        </div>


        <select
          class="select"
          id="start"
        >

          ${state.campus.nodes

            .filter(
              (node) =>
                node.type !== "poi"
            )

            .map(
              (node) => `

                <option
                  value="${escapeHtml(node.id)}"
                >

                  ${node.floor}층 ·
                  ${escapeHtml(t(node.name))}

                </option>

              `
            )

            .join("")}

        </select>

      </div>



      <!-- ========================================
           STEP 3
           목적지
      ========================================= -->

      <div class="card">

        <div class="step-title">

          <span>3</span>

          <strong>
            어디로 가시나요?
          </strong>

        </div>


        <!-- 목적지 검색 -->

        <div class="destination-search">

          <span>
            🔍
          </span>

          <input
            type="search"
            id="destination-search"
            placeholder="진료과, 검사실, 편의시설 검색"
            autocomplete="off"
            value="${escapeHtml(
              state.destinationSearch
            )}"
          >

        </div>


        <div class="destination-divider">

          또는 층별로 찾아보세요

        </div>


        <!-- 층 선택 -->

        <div
          class="floor-picker"
          id="destination-floor-picker"
        >

          ${destinationFloors

            .map(
              (floor) => `

                <button
                  type="button"
                  class="floor-button
                  ${
                    state.selectedFloor ===
                    floor
                      ? "active"
                      : ""
                  }"
                  data-floor="${floor}"
                >

                  ${floor}층

                </button>

              `
            )

            .join("")}

        </div>


        <!-- POI 목록 -->

        <div
          class="destination-list"
          id="destination-list"
        >
        </div>


      </div>



      <!-- ========================================
           경로 찾기
      ========================================= -->

      <div class="card">

        <button
          class="button"
          id="route"
          disabled
        >

          목적지를 선택해주세요

        </button>

      </div>


    </section>
  `;


  bindHomeEvents();

  renderDestinationList();
}


/**
 * ------------------------------------------------
 * 첫 화면 이벤트
 * ------------------------------------------------
 */
function bindHomeEvents() {

  /**
   * 에스컬레이터 여부
   */
  document
    .querySelectorAll(
      'input[name="escalator"]'
    )
    .forEach((input) => {

      input.addEventListener(
        "change",
        (event) => {

          state.canUseEscalator =
            event.target.value === "yes";


          document
            .querySelectorAll(
              ".mobility-option"
            )
            .forEach(
              (option) =>
                option.classList.remove(
                  "active"
                )
            );


          event.target
            .closest(
              ".mobility-option"
            )
            .classList.add(
              "active"
            );

        }
      );

    });


  /**
   * 목적지 층 선택
   */
  document
    .querySelectorAll(
      ".floor-button"
    )
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          state.selectedFloor =
            Number(
              button.dataset.floor
            );


          /**
           * 층을 직접 눌렀으면
           * 검색 모드는 해제
           */
          state.destinationSearch = "";

          document.querySelector(
            "#destination-search"
          ).value = "";


          document
            .querySelectorAll(
              ".floor-button"
            )
            .forEach(
              (item) =>
                item.classList.remove(
                  "active"
                )
            );


          button.classList.add(
            "active"
          );


          renderDestinationList();

        }
      );

    });


  /**
   * 목적지 검색
   */
  document
    .querySelector(
      "#destination-search"
    )
    .addEventListener(
      "input",
      (event) => {

        state.destinationSearch =
          event.target.value.trim();


        renderDestinationList();

      }
    );


  /**
   * 경로 생성
   */
  document.querySelector(
    "#route"
  ).onclick =
    createRoute;
}


/**
 * ------------------------------------------------
 * 목적지 목록 출력
 * ------------------------------------------------
 */
function renderDestinationList() {

  const container =
    document.querySelector(
      "#destination-list"
    );


  if (!container) {
    return;
  }


  const query =
    state.destinationSearch
      .toLowerCase();


  let filteredPois;


  /**
   * 검색어가 있으면
   * 전체 층에서 검색
   */
  if (query) {

    filteredPois =
      state.pois.filter(
        (poi) => {

          const name =
            t(poi.name)
              .toLowerCase();

          const category =
            String(
              poi.category || ""
            )
              .toLowerCase();


          return (
            name.includes(query) ||
            category.includes(query)
          );

        }
      );

  }


  /**
   * 검색어가 없으면
   * 선택된 층만 표시
   */
  else {

    filteredPois =
      state.pois.filter(
        (poi) =>
          Number(poi.floor) ===
          Number(
            state.selectedFloor
          )
      );

  }


  /**
   * 이름순 정렬
   */
  filteredPois.sort(
    (a, b) =>
      t(a.name).localeCompare(
        t(b.name),
        "ko"
      )
  );


  if (
    filteredPois.length === 0
  ) {

    container.innerHTML = `

      <div class="destination-empty">

        ${
          query
            ? "검색 결과가 없습니다."
            : `${state.selectedFloor}층에 등록된 목적지가 없습니다.`
        }

      </div>

    `;

    return;
  }


  container.innerHTML =
    filteredPois

      .map(
        (poi) => `

          <button
            type="button"
            class="destination-item
            ${
              state.destinationPoiId ===
              poi.id
                ? "selected"
                : ""
            }"
            data-poi-id="${escapeHtml(
              poi.id
            )}"
          >

            <span
              class="destination-floor"
            >
              ${poi.floor}F
            </span>


            <span
              class="destination-info"
            >

              <strong>

                ${escapeHtml(
                  t(poi.name)
                )}

              </strong>

              <small>

                ${escapeHtml(
                  poi.category ||
                  "병원 시설"
                )}

              </small>

            </span>


            <span
              class="destination-check"
            >
              ✓
            </span>

          </button>

        `
      )

      .join("");


  /**
   * 목적지 클릭
   */
  container
    .querySelectorAll(
      ".destination-item"
    )
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          state.destinationPoiId =
            button.dataset.poiId;


          container
            .querySelectorAll(
              ".destination-item"
            )
            .forEach(
              (item) =>
                item.classList.remove(
                  "selected"
                )
            );


          button.classList.add(
            "selected"
          );


          updateRouteButton();

        }
      );

    });


  updateRouteButton();
}


/**
 * ------------------------------------------------
 * 경로 찾기 버튼
 * ------------------------------------------------
 */
function updateRouteButton() {

  const button =
    document.querySelector(
      "#route"
    );


  if (!button) {
    return;
  }


  if (
    state.destinationPoiId
  ) {

    button.disabled = false;

    button.textContent =
      "이곳으로 길찾기";

  }

  else {

    button.disabled = true;

    button.textContent =
      "목적지를 선택해주세요";

  }
}


/**
 * ------------------------------------------------
 * 경로 생성
 * ------------------------------------------------
 */
async function createRoute() {

  const button =
    document.querySelector(
      "#route"
    );


  if (
    !state.destinationPoiId
  ) {
    return;
  }


  button.disabled = true;

  button.textContent =
    "경로를 찾고 있습니다…";


  try {

    state.route =
      await api(
        "/api/routes",
        {

          method: "POST",

          headers: {
            "content-type":
              "application/json",
          },


          body:
            JSON.stringify({

              startNodeId:
                document.querySelector(
                  "#start"
                ).value,


              destinationPoiId:
                state.destinationPoiId,


              profile: {

                /**
                 * 기존 옵션
                 */
                wheelchair: false,


                /**
                 * 새 옵션
                 *
                 * 이용 가능 = false
                 * 이용 어려움 = true
                 */
                avoidEscalator:
                  !state.canUseEscalator,

              },

            }),

        }
      );


    showRoute();

  }

  catch (error) {

    alert(error.message);

    button.disabled = false;

    button.textContent =
      "이곳으로 길찾기";

  }
}


/**
 * ------------------------------------------------
 * 경로 미리보기
 * ------------------------------------------------
 */
function showRoute() {

  root.innerHTML = `

    <header class="header">

      <h1>
        경로 안내
      </h1>

      <p>
        ${state.route.maneuvers.length}단계
      </p>

    </header>


    <section class="content">


      ${
        !state.canUseEscalator
          ? `

            <div class="accessibility-banner">

              ♿ 에스컬레이터를 제외하고
              엘리베이터 중심 경로로
              안내합니다.

            </div>

          `
          : ""
      }


      <div class="card">

        <ol class="route-list">

          ${state.route.maneuvers

            .map(
              (maneuver, index) => `

                <li>

                  <div class="marker">

                    <span>
                      ${index + 1}
                    </span>

                  </div>


                  <div>

                    <h3>
                      ${escapeHtml(
                        t(
                          maneuver.text
                        )
                      )}
                    </h3>

                    <p>

                      ${
                        maneuver.landmark
                          ? escapeHtml(
                              t(
                                maneuver.landmark
                              )
                            )
                          : ""
                      }

                    </p>

                  </div>

                </li>

              `
            )

            .join("")}

        </ol>

      </div>


      <button
        class="button"
        id="navigate"
      >

        안내 시작

      </button>


      <button
        class="button secondary"
        id="back"
      >

        다시 선택

      </button>


    </section>
  `;


  document.querySelector(
    "#navigate"
  ).onclick =
    startNavigation;


  document.querySelector(
    "#back"
  ).onclick =
    showHome;
}


/**
 * ------------------------------------------------
 * 안내 시작
 * ------------------------------------------------
 */
async function startNavigation() {

  const native =
    new NativeBeaconPositionProvider();


  state.provider =
    native.isAvailable()
      ? native
      : new SimulatorPositionProvider();


  state.maneuverIndex = 0;


  showHud();


  await state.provider.start(
    state.route,
    (position) => {

      const match =
        state.route.maneuvers
          .findIndex(
            (maneuver) =>
              maneuver.nodeId ===
              position.nodeId
          );


      if (match >= 0) {
        state.maneuverIndex =
          match;
      }


      showHud(position);

    }
  );
}


/**
 * ------------------------------------------------
 * HUD
 * ------------------------------------------------
 */
function showHud(
  position = {
    confidence: 1,
    source:
      state.provider?.name,
  }
) {

  const maneuver =
    state.route.maneuvers[
      state.maneuverIndex
    ];


  const glyph = {

    START: "↑",

    CONTINUE: "↑",

    TURN_LEFT: "↰",

    TURN_RIGHT: "↱",

    CHANGE_FLOOR: "↟",

    FLOOR_ARRIVAL: "↑",

    ARRIVE: "●",

  }[maneuver.action] || "↑";


  root.innerHTML = `

    <section class="hud">


      <div class="hud-top">

        <strong>
          ${escapeHtml(
            t(maneuver.text)
          )}
        </strong>


        <p>

          ${
            maneuver.landmark
              ? escapeHtml(
                  t(
                    maneuver.landmark
                  )
                )
              : ""
          }

        </p>


        <small>

          위치 신뢰도
          ${Math.round(
            (
              position.confidence ||
              0
            ) * 100
          )}%

          ·

          ${
            position.source ||
            "unknown"
          }

        </small>

      </div>


      <div class="arrow">

        ${glyph}

      </div>


      <div class="hud-bottom">

        <div>

          ${
            state.maneuverIndex +
            1
          }

          /

          ${
            state.route
              .maneuvers.length
          }

          단계

        </div>


        <button
          class="button"
          id="exit"
        >

          안내 종료

        </button>

      </div>


    </section>
  `;


  document.querySelector(
    "#exit"
  ).onclick =
    () => {

      state.provider?.stop();

      showRoute();

    };
}


showHome().catch(
  (error) => {

    root.innerHTML = `

      <p class="content">

        서비스를 불러오지 못했습니다:

        ${escapeHtml(
          error.message
        )}

      </p>

    `;

  }
);
