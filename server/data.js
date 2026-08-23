import { readFileSync } from "node:fs";

const loadJson = (relativePath) =>
  JSON.parse(
    readFileSync(new URL(relativePath, import.meta.url), "utf8")
  );

const rawNodes = loadJson("../data/nodes.json");
const rawEdges = loadJson("../data/edges.json");
const rawPois = loadJson("../data/pois.json");

const floorId = (floor) => `main-${floor}f`;

const nodes = rawNodes.map((node) => ({
  id: node.id,
  floorId: floorId(node.floor),
  floor: node.floor,

  // 길찾기 계산용 공통 좌표
  x: node.x,
  y: node.z,

  // 2D 평면도 표시/클릭 보정용 좌표
  localX: node.local_x,
  localY: node.local_z,
  sourceMapX: node.source_map_x ?? null,
  sourceMapY: node.source_map_y ?? null,

  type: node.role,
  name: {
    ko: node.note || `${node.floor}층 ${node.id}`,
    en: node.id,
  },
  confidence: node.confidence,
  provenance: node.provenance,
}));

const edges = rawEdges.map((edge) => ({
  id: edge.id,
  from: edge.from,
  to: edge.to,
  type: edge.type,

  accessible: [
    "walk",
    "connector_access",
    "elevator"
  ].includes(edge.type),

  oneWay: edge.bidirectional === false,

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

  // 길찾기 계산용 공통 좌표
  x: poi.x,
  y: poi.z,

  // 추후 지도 POI 마커 표시용 좌표
  localX: poi.local_x,
  localY: poi.local_z,

  confidence: poi.confidence,
  provenance: poi.provenance,
  note: poi.note,
}));

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
