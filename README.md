# Severance Indoor Navigation

Hybrid indoor-navigation foundation for a hospital pilot. It currently uses an in-memory demonstration map and a simulated position provider. **It must not be used for real patient navigation until validated hospital data is loaded and safety-tested.**

## Run

```bash
npm start
```

Open `http://localhost:3000`. Run automated checks with `npm test`.

## Included

- Mobile-first Korean navigation UI and PWA manifest
- Indoor graph and POI API
- Accessible shortest-path routing foundation
- Semantic maneuvers for camera/HUD guidance
- Simulated positioning for development
- Native BLE bridge boundary for an eventual Capacitor plugin
- Data requirements and JSON field definitions
- Legacy HTML prototypes retained at the repository root for reference

## Production work still requiring real inputs

- Import and validate surveyed hospital maps, routing graphs and POIs
- Procure/configure beacons and conduct on-site radio surveys
- Implement the Capacitor iOS and Android beacon plugin
- Replace in-memory data with PostgreSQL/PostGIS
- Add authentication for the map/beacon administration console
- Add live closures, elevator status integration and operational monitoring
- Run accessibility, privacy, security and on-site navigation validation
- Add native ARKit/ARCore rendering if spatially anchored arrows are required

See [docs/DATA_REQUIREMENTS.md](docs/DATA_REQUIREMENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
