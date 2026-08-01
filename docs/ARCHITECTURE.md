# Architecture

```text
Capacitor application
  Web UI and guidance state
    -> PositionProvider
       -> Native BLE plugin (production)
       -> QR provider (recovery)
       -> Simulator (development)
    -> REST API
       -> map/POI repository
       -> route engine
       -> closure/config service

Admin web application
  -> authenticated map, POI, beacon and closure APIs

Data platform
  PostgreSQL/PostGIS + object storage + privacy-controlled telemetry
```

## Trust boundaries

- The client receives only public navigation geometry and content.
- Beacon configuration credentials and maintenance inventory remain server-side.
- Navigation sessions are anonymous and short-lived by default.
- No EMR or appointment integration is required for core navigation.
- All APIs and camera/Bluetooth features require a secure HTTPS context in production.

## Position event contract

The native layer should emit a normalized map-matched position rather than exposing platform-specific callbacks throughout the UI:

```json
{
  "floorId": "main-3f",
  "edgeId": "main-3f-edge-018",
  "progress": 0.64,
  "accuracyMeters": 4.2,
  "confidence": 0.81,
  "source": "native-ble",
  "timestamp": 1785600000000
}
```

During early development, the native plugin may emit raw beacon observations to a localization module. For production, use a versioned event schema and clearly identify whether map matching occurred on-device or server-side.

## API direction

The current implementation exposes `GET /api/config`, `/api/campus`, `/api/pois`, and `POST /api/routes`. Production should version these under `/api/v1`, use schema validation, persist versioned datasets, add authenticated administration endpoints, and support offline download of a signed campus data bundle.

## Offline behavior

Cache the selected building map, POIs, routing graph and active route on the device. Beacon localization and guidance should continue through a short network outage. Live closures must carry an expiry time; stale safety-critical restrictions should force a clear degraded-mode warning rather than silently routing through them.
