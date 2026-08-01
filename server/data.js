export const campus = {
  id: "severance-sinchon",
  name: { ko: "세브란스병원", en: "Severance Hospital" },
  buildings: [{ id: "main", name: { ko: "본관", en: "Main Building" } }],
  floors: [{ id: "main-1f", buildingId: "main", level: 1, name: { ko: "본관 1층", en: "Main Building 1F" } }],
  nodes: [
    { id: "entrance", floorId: "main-1f", x: 0, y: 0, type: "entrance", name: { ko: "정문", en: "Main entrance" } },
    { id: "lobby", floorId: "main-1f", x: 12, y: 0, type: "junction", name: { ko: "로비", en: "Lobby" } },
    { id: "junction-a", floorId: "main-1f", x: 28, y: 0, type: "junction", name: { ko: "중앙 복도", en: "Central corridor" } },
    { id: "blood-draw", floorId: "main-1f", x: 28, y: 14, type: "poi", name: { ko: "채혈실 (예시)", en: "Blood draw (demo)" } },
    { id: "pharmacy", floorId: "main-1f", x: 44, y: 0, type: "poi", name: { ko: "약국 (예시)", en: "Pharmacy (demo)" } }
  ],
  edges: [
    { id: "e1", from: "entrance", to: "lobby", accessible: true },
    { id: "e2", from: "lobby", to: "junction-a", accessible: true },
    { id: "e3", from: "junction-a", to: "blood-draw", accessible: true },
    { id: "e4", from: "junction-a", to: "pharmacy", accessible: true }
  ],
  pois: [
    { id: "poi-blood-draw", nodeId: "blood-draw", category: "clinical", name: { ko: "채혈실 (예시)", en: "Blood draw (demo)" } },
    { id: "poi-pharmacy", nodeId: "pharmacy", category: "amenity", name: { ko: "약국 (예시)", en: "Pharmacy (demo)" } }
  ],
  beacons: []
};

export function publicConfig() {
  return {
    campusId: campus.id,
    dataMode: "demo",
    positionProviders: ["native-ble", "qr", "simulator"],
    defaultLocale: "ko",
    features: { cameraHud: true, spatialAr: false, voice: true }
  };
}
