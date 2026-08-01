# Data required for deployment

The service needs more than beacon identifiers and floor-plan images. Indoor positioning and routing require a surveyed coordinate system connecting maps, beacons, walkable paths and destinations.

## 1. Campus and building data

For every building:

- Stable campus and building IDs
- Korean and English official names and aliases
- Entrance locations and connections between buildings
- Public opening hours and access restrictions
- A local coordinate-system definition, origin and scale in metres
- Optional transformation to a surveyed/global coordinate reference system

## 2. Floor maps

Preferred source: CAD/BIM or authoritative vector floor plans. For each floor collect:

- Stable floor ID, building ID and displayed level name
- Floor elevation and floor-to-floor height
- Walls, corridors, doors, rooms and public areas
- Stairs, elevators, escalators and ramps
- Entrances, information desks and emergency exits
- Restricted or staff-only areas
- Map revision, owner, effective date and coordinate transform

Do not rely on a raster image without a known scale and control points. Remove sensitive clinical/security details before distributing map data to clients.

## 3. Routing graph

Nodes are needed at entrances, corridor intersections, turns, doors, vertical connectors and destinations. Required node fields:

```json
{
  "id": "main-3f-node-042",
  "floorId": "main-3f",
  "x": 124.25,
  "y": 88.4,
  "z": 9.2,
  "type": "junction",
  "name": { "ko": "중앙 복도", "en": "Central corridor" }
}
```

Each walkable edge needs:

```json
{
  "id": "main-3f-edge-018",
  "from": "main-3f-node-042",
  "to": "main-3f-node-043",
  "geometry": [[124.25, 88.4], [130.1, 88.4]],
  "lengthMeters": 5.85,
  "oneWay": false,
  "accessible": true,
  "connectorType": "corridor",
  "restriction": "public",
  "landmarkIds": ["poi-information-desk"]
}
```

Also collect slope, minimum width, door type, stairs/escalator direction, elevator linkage, operating hours and temporary closure capability where applicable.

## 4. Destinations and landmarks

For each public POI:

- Stable POI ID and routing-node/door ID
- Official Korean and English name
- Search aliases, abbreviations and common misspellings
- Category and icon
- Building, floor, room number and public description
- Entrance/door to route to—not merely the room centroid
- Opening hours and public access rules
- Accessible entrance and alternative destination node
- Plain-language landmark descriptions in both languages
- Content owner and last verification date

Avoid storing appointment, diagnosis or patient information in the POI dataset.

## 5. Beacon inventory

For every physical unit collect:

```json
{
  "id": "beacon-main-3f-017",
  "protocol": "iBeacon",
  "uuid": "assigned-uuid",
  "major": 3,
  "minor": 17,
  "buildingId": "main",
  "floorId": "main-3f",
  "x": 125.1,
  "y": 87.9,
  "z": 2.6,
  "mounting": "ceiling",
  "orientationDegrees": 0,
  "txPowerDbm": -59,
  "advertisingIntervalMs": 350,
  "model": "vendor-model",
  "firmware": "version",
  "installedAt": "YYYY-MM-DD",
  "lastBatteryServiceAt": "YYYY-MM-DD"
}
```

Keep a separate secured operations inventory for serial number, MAC address where applicable, procurement record, battery type, configuration credentials and maintenance history. Identifiers must be unique and follow a documented UUID/major/minor allocation plan.

## 6. Radio survey and calibration observations

Coordinates and advertised power alone are insufficient. Collect labelled observations on actual supported phone models:

- Survey point ID and surveyed `x/y/floor`
- Timestamp, phone model and OS version
- Beacon ID, raw RSSI and scan frequency
- Phone orientation and carrying position
- Occupancy condition (empty, normal and crowded where possible)
- Calibration runs approaching/leaving intersections, elevators and stairs
- Areas with interference, metal structures or signal leakage between floors

Retain raw calibration data separately from anonymous production telemetry. Use it to tune per-zone path-loss/filter parameters and verify floor classification.

## 7. Guidance content

- Maneuver templates in Korean and English
- Landmark-linked instructions
- Voice strings and pronunciation review
- Arrival rules and acceptable destination radius
- Lost-position, wrong-way and unavailable-route messages
- Accessibility-specific instructions
- Emergency and service-unavailable messages

## 8. Operational and validation data

- Temporary closure and effective-time records
- Beacon heartbeat/battery inspection records
- Map, graph and POI version history
- Ground-truth test routes and expected maneuvers
- Accuracy targets per zone and test results by phone model
- Named data owners and approval workflow

Before launch, hospital facilities, accessibility, privacy/security and clinical operations stakeholders should sign off on their respective datasets and test routes.
