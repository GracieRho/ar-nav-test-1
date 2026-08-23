import { readFileSync } from "node:fs";

const loadJson = (relativePath) =>
  JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8")
  );

// GitHub의 /data 폴더에 올린 전층 데이터 불러오기
const rawNodes = loadJson("../data/nodes.json");
const rawEdges = loadJson("../data/edges.json");
const rawPois = loadJson("../data/pois.json");

const floorId = (floor) => `main-${floor}f`;


// --------------------------------------------------
// NODES
// 새 데이터:
// x, z, floor, role
//
// 기존 서버가 원하는 형식:
// x, y, floorId, type, name
//
// 따라서 z → y 로 변환
// --------------------------------------------------

const nodes = rawNodes.map((node) => ({
  id: node.id,

  floorId: floorId(node.floor),
  floor: node.floor,

  x: node.x,
  y: node.z,

  type: node.role,

  name: {
    ko: node.note || `${node.floor}층 ${node.id}`,
    en: node.id,
  },

  confidence: node.confidence,
  provenance: node.provenance,
}));


// --------------------------------------------------
// EDGES
//
// 새 데이터:
// bidirectional, distance_px, type
//
// 기존 routing.js:
// accessible, oneWay, lengthMeters
//
// 형식에 맞게 변환
// --------------------------------------------------

const edges = rawEdges.map((edge) => ({
  id: edge.id,

  from: edge.from,
  to: edge.to,

  type: edge.type,

  // 휠체어 경로에서는
  // 일반 통로 + 엘리베이터만 이용하도록 설정
  accessible: [
    "walk",
    "connector_access",
    "elevator"
  ].includes(edge.type),

  oneWay: edge.bidirectional === false,

  // 아직 실제 meter 환산값이 없으므로
  // 현재는 길찾기 가중치로 사용
  lengthMeters:
    typeof edge.routing_cost_estimate === "number"
      ? edge.routing_cost_estimate
      : typeof edge.distance_px === "number"
        ? edge.distance_px
        : undefined,

  status: edge.status,

  fieldCheckRequired: edge.field_check_required,

  provenance: edge.provenance,

  note: edge.note,
}));


// --------------------------------------------------
// POIS
//
// 새 데이터:
// anchor_node
//
// 기존 서버:
// nodeId
//
// 따라서 anchor_node → nodeId 로 변환
// --------------------------------------------------

const pois = rawPois.map((poi) => ({
  id: poi.id,

  nodeId: poi.anchor_node,

  floorId: floorId(poi.floor),
  floor: poi.floor,

  category: poi.category,

  name: {
    ko: poi.name,
    en: poi.name,
  },

  x: poi.x,
  y: poi.z,

  confidence: poi.confidence,

  provenance: poi.provenance,

  note: poi.note,
}));


// --------------------------------------------------
// CAMPUS
// --------------------------------------------------

export const campus = {

  id: "severance-sinchon",

  name: {
    ko: "세브란스병원",
    en: "Severance Hospital"
  },

  buildings: [
    {
      id: "main",
      name: {
        ko: "본관",
        en: "Main Building"
      }
    }
  ],

  // 본관 1F ~ 6F
  floors: Array.from({ length: 6 }, (_, index) => {

    const level = index + 1;

    return {
      id: floorId(level),

      buildingId: "main",

      level,

      name: {
        ko: `본관 ${level}층`,
        en: `Main Building ${level}F`
      }
    };

  }),

  nodes,

  edges,

  pois,

  beacons: []
};


// --------------------------------------------------
// 앱 설정
// --------------------------------------------------

export function publicConfig() {

  return {

    campusId: campus.id,

    dataMode: "prototype-1f-6f",

    positionProviders: [
      "native-ble",
      "qr",
      "simulator"
    ],

    defaultLocale: "ko",

    features: {

      cameraHud: true,

      spatialAr: false,

      voice: true,

      multiFloorRouting: true

    }

  };

}
