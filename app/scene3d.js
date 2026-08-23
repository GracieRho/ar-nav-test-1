let geometryPromise = null;

export function loadFloorGeometry() {
  if (!geometryPromise) {
    geometryPromise = fetch("/floor_geometry.json").then((response) => {
      if (!response.ok) throw new Error("3D 공간 데이터를 불러오지 못했습니다.");
      return response.json();
    });
  }
  return geometryPromise;
}

const FLOOR_COLORS = {
  1: "#566b7f",
  2: "#177eaa",
  3: "#168c78",
  4: "#20a46b",
  5: "#7257e8",
  6: "#c64f84",
};

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function dist(a, b) {
  return Math.hypot((a.localX ?? a.x) - (b.localX ?? b.x), (a.localY ?? a.y) - (b.localY ?? b.y));
}

function roundedRect(ctx, x, y, width, height, radius = 8) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export class GuidanceScene {
  constructor(canvas, options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.options = options;
    this.lookOffset = 0;
    this.dragging = false;
    this.lastX = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);

    this.onPointerDown = (event) => {
      this.dragging = true;
      this.lastX = event.clientX;
      canvas.setPointerCapture?.(event.pointerId);
    };
    this.onPointerMove = (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastX;
      this.lastX = event.clientX;
      this.lookOffset += dx * 0.006;
      this.draw();
    };
    this.onPointerUp = () => {
      this.dragging = false;
    };

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);

    this.resize();
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
  }

  recenter() {
    this.lookOffset = 0;
    this.draw();
  }

  update(options) {
    this.options = options;
    this.lookOffset = 0;
    this.draw();
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(280, rect.width);
    const height = Math.max(440, rect.height);
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = width;
    this.height = height;
    this.draw();
  }

  cameraBasis() {
    const { currentNode, headingNode } = this.options;
    const cx = currentNode.localX ?? currentNode.x;
    const cz = currentNode.localY ?? currentNode.y;

    let dx = 0;
    let dz = -1;
    if (headingNode) {
      dx = (headingNode.localX ?? headingNode.x) - cx;
      dz = (headingNode.localY ?? headingNode.y) - cz;
      const length = Math.hypot(dx, dz);
      if (length > 0.001) {
        dx /= length;
        dz /= length;
      } else {
        dx = 0;
        dz = -1;
      }
    }

    const angle = Math.atan2(dz, dx) + this.lookOffset;
    const forward = { x: Math.cos(angle), z: Math.sin(angle) };
    const right = { x: -forward.z, z: forward.x };
    return { cx, cz, forward, right };
  }

  project(x, z, height = 0) {
    const { cx, cz, forward, right } = this.cameraBasis();
    const dx = x - cx;
    const dz = z - cz;
    const lateral = dx * right.x + dz * right.z;
    const forwardDistance = dx * forward.x + dz * forward.z;

    // 3인칭 추적 시야: 진행방향이 화면 위쪽으로 향한다.
    const baseScale = Math.min(this.width / 780, this.height / 720) * 0.92;
    const distanceFade = Math.max(0.72, Math.min(1.08, 1 - forwardDistance / 2500));
    const scale = baseScale * distanceFade;

    return {
      x: this.width * 0.5 + lateral * scale,
      y: this.height * 0.77 - forwardDistance * scale * 0.43 - height * scale * 1.18,
      forwardDistance,
      lateral,
    };
  }

  drawBackground() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#dfeaf3");
    gradient.addColorStop(0.5, "#eef3f7");
    gradient.addColorStop(1, "#d3dde5");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    // 바닥 격자: 주변 공간의 방향/거리감을 주기 위한 시각 요소.
    ctx.save();
    ctx.strokeStyle = "rgba(64,86,105,.13)";
    ctx.lineWidth = 1;
    const { cx, cz } = this.cameraBasis();
    for (let offset = -600; offset <= 600; offset += 100) {
      const a = this.project(cx - 650, cz + offset, 0);
      const b = this.project(cx + 650, cz + offset, 0);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      const c = this.project(cx + offset, cz - 650, 0);
      const d = this.project(cx + offset, cz + 650, 0);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawRoomMass(poly, color, height = 62) {
    const ctx = this.ctx;
    const base = poly.map(([x, z]) => this.project(x, z, 0));
    const top = poly.map(([x, z]) => this.project(x, z, height));

    // 측면
    for (let i = 0; i < poly.length; i += 1) {
      const j = (i + 1) % poly.length;
      ctx.beginPath();
      ctx.moveTo(base[i].x, base[i].y);
      ctx.lineTo(base[j].x, base[j].y);
      ctx.lineTo(top[j].x, top[j].y);
      ctx.lineTo(top[i].x, top[i].y);
      ctx.closePath();
      ctx.fillStyle = hexToRgba(color, 0.23);
      ctx.fill();
    }

    // 상단
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    for (let i = 1; i < top.length; i += 1) ctx.lineTo(top[i].x, top[i].y);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(color, 0.18);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, 0.48);
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  drawRooms() {
    const { floor, geometry, currentNode } = this.options;
    const rooms = geometry.rooms?.[String(floor)] || [];
    const color = FLOOR_COLORS[floor] || "#1769c2";
    const current = {
      localX: currentNode.localX ?? currentNode.x,
      localY: currentNode.localY ?? currentNode.y,
    };

    const visible = rooms
      .map((poly) => {
        const cx = poly.reduce((sum, p) => sum + p[0], 0) / poly.length;
        const cz = poly.reduce((sum, p) => sum + p[1], 0) / poly.length;
        const p = this.project(cx, cz, 0);
        return { poly, cx, cz, depth: p.forwardDistance };
      })
      .filter(({ cx, cz, poly }) => {
        const centerDistance = Math.hypot(cx - current.localX, cz - current.localY);
        if (centerDistance < 780) return true;
        // 큰 폴리곤의 일부가 현재 위치 근처라면 함께 표시.
        return poly.some(([x, z]) => Math.hypot(x - current.localX, z - current.localY) < 520);
      })
      .sort((a, b) => b.depth - a.depth);

    for (const room of visible) this.drawRoomMass(room.poly, color);
  }

  routeSegments() {
    const { floor, routeNodes } = this.options;
    const segments = [];
    let current = [];
    for (const node of routeNodes) {
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

  drawRoute() {
    const ctx = this.ctx;
    for (const segment of this.routeSegments()) {
      if (segment.length < 2) continue;
      const points = segment.map((node) =>
        this.project(node.localX ?? node.x, node.localY ?? node.y, 7)
      );

      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255,255,255,.96)";
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();

      ctx.strokeStyle = "#1769c2";
      ctx.lineWidth = 7;
      ctx.shadowColor = "rgba(23,105,194,.35)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
      ctx.restore();
    }
  }

  drawDirectionArrow() {
    const { currentNode, headingNode, floorChange, targetFloor } = this.options;
    const ctx = this.ctx;
    const cx = currentNode.localX ?? currentNode.x;
    const cz = currentNode.localY ?? currentNode.y;

    if (floorChange) {
      const p = this.project(cx, cz, 78);
      ctx.save();
      ctx.font = "900 72px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#19c77b";
      ctx.strokeStyle = "white";
      ctx.lineWidth = 8;
      ctx.shadowColor = "rgba(25,199,123,.45)";
      ctx.shadowBlur = 20;
      ctx.strokeText("⇧", p.x, p.y);
      ctx.fillText("⇧", p.x, p.y);
      ctx.font = "800 16px system-ui";
      ctx.strokeStyle = "white";
      ctx.lineWidth = 5;
      const label = `${targetFloor}F`;
      ctx.strokeText(label, p.x, p.y + 58);
      ctx.fillText(label, p.x, p.y + 58);
      ctx.restore();
      return;
    }

    if (!headingNode) return;
    let dx = (headingNode.localX ?? headingNode.x) - cx;
    let dz = (headingNode.localY ?? headingNode.y) - cz;
    const length = Math.hypot(dx, dz);
    if (length < 0.001) return;
    dx /= length;
    dz /= length;
    const rx = -dz;
    const rz = dx;

    const point = (forward, side, h = 20) =>
      this.project(cx + dx * forward + rx * side, cz + dz * forward + rz * side, h);

    const points = [
      point(205, 0),
      point(132, 48),
      point(132, 20),
      point(58, 20),
      point(58, -20),
      point(132, -20),
      point(132, -48),
    ];

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = "#19c77b";
    ctx.strokeStyle = "rgba(255,255,255,.98)";
    ctx.lineWidth = 5;
    ctx.shadowColor = "rgba(25,199,123,.48)";
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawUser() {
    const { currentNode } = this.options;
    const p = this.project(currentNode.localX ?? currentNode.x, currentNode.localY ?? currentNode.y, 4);
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(23,105,194,.16)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 27, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1769c2";
    ctx.strokeStyle = "white";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawLabels() {
    const { floor, geometry, currentNode } = this.options;
    const labels = geometry.labels?.[String(floor)] || [];
    const cx = currentNode.localX ?? currentNode.x;
    const cz = currentNode.localY ?? currentNode.y;

    const nearby = labels
      .map((label) => ({
        ...label,
        distance: Math.hypot(label.x - cx, label.z - cz),
      }))
      .filter((label) => label.distance < 360)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 7);

    const ctx = this.ctx;
    for (const label of nearby) {
      const p = this.project(label.x, label.z, 82);
      if (p.x < -80 || p.x > this.width + 80 || p.y < -40 || p.y > this.height + 40) continue;

      const text = String(label.name).replace(/\n/g, " ");
      ctx.save();
      ctx.font = "700 12px system-ui";
      const width = Math.min(180, ctx.measureText(text).width + 18);
      const display = text.length > 18 ? `${text.slice(0, 18)}…` : text;
      roundedRect(ctx, p.x - width / 2, p.y - 15, width, 26, 9);
      ctx.fillStyle = "rgba(255,255,255,.93)";
      ctx.fill();
      ctx.strokeStyle = "rgba(48,70,89,.18)";
      ctx.stroke();
      ctx.fillStyle = "#213142";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(display, p.x, p.y - 2);
      ctx.restore();
    }
  }

  draw() {
    if (!this.width || !this.height || !this.options?.currentNode) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground();
    this.drawRooms();
    this.drawRoute();
    this.drawDirectionArrow();
    this.drawUser();
    this.drawLabels();

    ctx.save();
    ctx.fillStyle = "rgba(15,35,50,.65)";
    ctx.font = "700 11px system-ui";
    ctx.textAlign = "right";
    ctx.fillText("좌우로 드래그해 주변을 둘러볼 수 있습니다", this.width - 14, this.height - 15);
    ctx.restore();
  }
}
