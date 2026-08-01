import { SimulatorPositionProvider, NativeBeaconPositionProvider } from "/positioning.js";

const root = document.querySelector("#app");
const state = { campus: null, pois: [], route: null, maneuverIndex: 0, locale: "ko", provider: null };
const api = async (path, options) => {
  const response = await fetch(path, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
};
const t = (value) => value?.[state.locale] || value?.ko || value || "";

async function showHome() {
  [state.campus, state.pois] = await Promise.all([api("/api/campus"), api("/api/pois")]);
  root.innerHTML = `<header class="header"><h1>세브란스 길동무</h1><p>병원 실내 길찾기</p></header><section class="content">
    <div class="notice">현재 예시 지도 데이터로 실행 중입니다. 실제 경로 안내에 사용하지 마세요.</div>
    <div class="card"><label class="label" for="start">현재 위치</label><select class="select" id="start">${state.campus.nodes.filter(n=>n.type!=="poi").map(n=>`<option value="${n.id}">${t(n.name)}</option>`)}</select></div>
    <div class="card"><label class="label" for="destination">목적지</label><select class="select" id="destination">${state.pois.map(p=>`<option value="${p.id}">${t(p.name)}</option>`)}</select></div>
    <div class="card"><div class="status"><span class="dot"></span><div><strong>위치 공급자</strong><div class="muted">브라우저 데모: 시뮬레이터</div></div></div><button class="button" id="route">경로 찾기</button></div>
  </section>`;
  document.querySelector("#route").onclick = createRoute;
}

async function createRoute() {
  const button = document.querySelector("#route"); button.disabled = true;
  try {
    state.route = await api("/api/routes", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({ startNodeId:document.querySelector("#start").value, destinationPoiId:document.querySelector("#destination").value, profile:{ wheelchair:false } }) });
    showRoute();
  } catch (error) { alert(error.message); button.disabled = false; }
}

function showRoute() {
  root.innerHTML = `<header class="header"><h1>경로 안내</h1><p>약 ${state.route.distanceMeters}m · ${state.route.maneuvers.length}단계</p></header><section class="content"><div class="card"><ol class="route-list">${state.route.maneuvers.map((m,i)=>`<li><div class="marker"><span>${i+1}</span></div><div><h3>${t(m.text)}</h3><p>${m.landmark ? t(m.landmark) : ""}</p></div></li>`).join("")}</ol></div><button class="button" id="navigate">안내 시작</button><button class="button secondary" id="back">다시 선택</button></section>`;
  document.querySelector("#navigate").onclick = startNavigation;
  document.querySelector("#back").onclick = showHome;
}

async function startNavigation() {
  const native = new NativeBeaconPositionProvider();
  state.provider = native.isAvailable() ? native : new SimulatorPositionProvider();
  state.maneuverIndex = 0;
  showHud();
  await state.provider.start(state.route, (position) => {
    const match = state.route.maneuvers.findIndex(m => m.nodeId === position.nodeId);
    if (match >= 0) state.maneuverIndex = match;
    showHud(position);
  });
}

function showHud(position = { confidence:1, source:state.provider?.name }) {
  const maneuver = state.route.maneuvers[state.maneuverIndex];
  const glyph = { START:"↑", CONTINUE:"↑", TURN_LEFT:"↰", TURN_RIGHT:"↱", ARRIVE:"●" }[maneuver.action];
  root.innerHTML = `<section class="hud"><div class="hud-top"><strong>${t(maneuver.text)}</strong><p>${maneuver.landmark ? t(maneuver.landmark) : ""}</p><small>위치 신뢰도 ${Math.round((position.confidence||0)*100)}% · ${position.source||"unknown"}</small></div><div class="arrow">${glyph}</div><div class="hud-bottom"><div>${state.maneuverIndex+1} / ${state.route.maneuvers.length} 단계</div><button class="button" id="exit">안내 종료</button></div></section>`;
  document.querySelector("#exit").onclick = () => { state.provider?.stop(); showRoute(); };
}

showHome().catch((error) => { root.innerHTML = `<p class="content">서비스를 불러오지 못했습니다: ${error.message}</p>`; });
