export class SimulatorPositionProvider {
  constructor() { this.name = "simulator"; this.timer = null; }
  async start(route, onPosition) {
    let index = 0;
    onPosition({ nodeId: route.nodeIds[index], confidence: 1, source: this.name });
    this.timer = setInterval(() => {
      index = Math.min(index + 1, route.nodeIds.length - 1);
      onPosition({ nodeId: route.nodeIds[index], confidence: 1, source: this.name });
      if (index === route.nodeIds.length - 1) this.stop();
    }, 4500);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

export class NativeBeaconPositionProvider {
  constructor() { this.name = "native-ble"; }
  isAvailable() { return Boolean(globalThis.NativeBeaconBridge?.startScan); }
  async start(_route, onPosition) {
    if (!this.isAvailable()) throw new Error("Native beacon bridge is unavailable");
    globalThis.addEventListener("nativeBeaconPosition", (event) => onPosition(event.detail));
    await globalThis.NativeBeaconBridge.startScan();
  }
  async stop() { await globalThis.NativeBeaconBridge?.stopScan?.(); }
}
