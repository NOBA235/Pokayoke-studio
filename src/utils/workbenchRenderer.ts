import { CartridgeStep, UNLISTED_ANOMALY_TOKEN } from '../types/cartridge';
import { ROI_CANVAS_SIZE } from './canvasCapture';

export function resolveAvailableStatesForStep(step: CartridgeStep): string[] {
  return Array.from(
    new Set([
      step.expectedState,
      ...step.knownMistakeStates,
      UNLISTED_ANOMALY_TOKEN
    ])
  );
}

function drawChassisFrame(
  ctx: CanvasRenderingContext2D,
  headerLabel: string,
  pcbStyle = false
): void {
  const size = ROI_CANVAS_SIZE;
  ctx.clearRect(0, 0, size, size);

  // Base industrial chassis or emerald PCB
  ctx.fillStyle = pcbStyle ? '#0b2e26' : '#0f172a';
  ctx.fillRect(0, 0, size, size);

  // Subtle machined grid lines
  ctx.strokeStyle = pcbStyle ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let p = 24; p < size; p += 24) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Outer chassis bezel
  ctx.strokeStyle = pcbStyle ? '#34d399' : '#475569';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, size - 16, size - 16);

  // Corner hex bolts
  const boltOffsets = [
    [22, 22],
    [size - 22, 22],
    [22, size - 22],
    [size - 22, size - 22]
  ];
  for (const [bx, by] of boltOffsets) {
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(bx, by, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx - 4, by);
    ctx.lineTo(bx + 4, by);
    ctx.stroke();
  }

  // Top silkscreen legend bar
  ctx.fillStyle = pcbStyle ? '#064e3b' : '#1e293b';
  ctx.fillRect(42, 14, size - 84, 24);
  ctx.strokeStyle = pcbStyle ? '#10b981' : '#64748b';
  ctx.lineWidth = 1;
  ctx.strokeRect(42, 14, size - 84, 24);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 12px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(headerLabel, size / 2, 26);
}

function drawObstructedOverlay(
  ctx: CanvasRenderingContext2D,
  roiLabel: string
): void {
  // Semi-opaque dark gloved hand / lens obstruction across the center ROI
  ctx.fillStyle = 'rgba(2, 6, 23, 0.86)';
  ctx.fillRect(24, 58, 336, 268);

  // Diagonal hazard stripes across obstruction card
  ctx.save();
  ctx.beginPath();
  ctx.rect(36, 72, 312, 240);
  ctx.clip();

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(36, 72, 312, 240);

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.lineWidth = 14;
  for (let x = -120; x < 420; x += 34) {
    ctx.beginPath();
    ctx.moveTo(x, 72);
    ctx.lineTo(x + 180, 312);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(36, 72, 312, 240);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(58, 134, 268, 116);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(58, 134, 268, 116);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 16px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ROI OBSTRUCTED / GLARE', 192, 168);

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillText(`TARGET: ${roiLabel}`, 192, 196);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('ANOMALY / UNLISTED CONDITION', 192, 222);
}

function drawBreakerLotoScene(
  ctx: CanvasRenderingContext2D,
  stateToken: string
): void {
  drawChassisFrame(ctx, 'PSU MAIN BREAKER // LOTO', false);

  const isBreakerOn = stateToken === 'BREAKER_ON_ENERGIZED';
  const hasLockoutTag = stateToken === 'BREAKER_OFF_WITH_LOCKOUT_TAG';

  // Breaker housing bay
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(48, 62, 176, 260);
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 62, 176, 260);

  // Status indicator LED window
  ctx.fillStyle = isBreakerOn ? '#7f1d1d' : '#064e3b';
  ctx.fillRect(66, 78, 140, 34);
  ctx.strokeStyle = isBreakerOn ? '#ef4444' : '#10b981';
  ctx.lineWidth = 2;
  ctx.strokeRect(66, 78, 140, 34);

  ctx.fillStyle = isBreakerOn ? '#fecaca' : '#a7f3d0';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(isBreakerOn ? 'LIVE // ENERGIZED' : 'SAFE // ISOLATED', 136, 95);

  // Rocker bezel
  ctx.fillStyle = '#020617';
  ctx.fillRect(82, 128, 108, 162);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.strokeRect(82, 128, 108, 162);

  // Top half ON (I)
  ctx.fillStyle = isBreakerOn ? '#dc2626' : '#1e293b';
  ctx.fillRect(90, 136, 92, 70);
  ctx.strokeStyle = isBreakerOn ? '#fca5a5' : '#475569';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(90, 136, 92, 70);

  ctx.fillStyle = isBreakerOn ? '#ffffff' : '#94a3b8';
  ctx.font = 'bold 20px ui-monospace, monospace';
  ctx.fillText('ON (I)', 136, 171);

  // Bottom half OFF (O)
  ctx.fillStyle = !isBreakerOn ? '#059669' : '#1e293b';
  ctx.fillRect(90, 212, 92, 70);
  ctx.strokeStyle = !isBreakerOn ? '#6ee7b7' : '#475569';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(90, 212, 92, 70);

  ctx.fillStyle = !isBreakerOn ? '#ffffff' : '#94a3b8';
  ctx.font = 'bold 20px ui-monospace, monospace';
  ctx.fillText('OFF (O)', 136, 247);

  // Steel LOTO hasp loop on right side
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(246, 165, 22, 0, Math.PI * 2);
  ctx.stroke();

  if (hasLockoutTag) {
    // Attached red & yellow DANGER: LOCKOUT tag
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(236, 188, 114, 138);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.strokeRect(236, 188, 114, 138);

    // Yellow header band
    ctx.fillStyle = '#facc15';
    ctx.fillRect(240, 192, 106, 32);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px ui-monospace, monospace';
    ctx.fillText('DANGER', 293, 208);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px ui-monospace, monospace';
    ctx.fillText('LOCKOUT', 293, 248);
    ctx.fillText('TAGGED', 293, 270);

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.fillText('DO NOT OPERATE', 293, 302);
  } else {
    // Missing tag dashed outline
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(238, 194, 110, 126);
    ctx.restore();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText('NO LOTO TAG', 293, 248);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillText('(CLICK HASP)', 293, 270);
  }

  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('CLICK SWITCH OR HASP TO TOGGLE', 192, 352);
}

function drawWanLanPortsScene(
  ctx: CanvasRenderingContext2D,
  stateToken: string
): void {
  drawChassisFrame(ctx, 'FRONT I/O // WAN & LAN BANK', false);

  const ports = [
    { label: 'WAN (PORT 0)', short: 'WAN 0', x: 34, isWan: true },
    { label: 'LAN 1', short: 'LAN 1', x: 102, isWan: false },
    { label: 'LAN 2', short: 'LAN 2', x: 168, isWan: false },
    { label: 'LAN 3', short: 'LAN 3', x: 234, isWan: false },
    { label: 'LAN 4', short: 'LAN 4', x: 300, isWan: false }
  ];

  const activePortIndex =
    stateToken === 'CABLE_SEATED_IN_WAN_PORT_0'
      ? 0
      : stateToken === 'CABLE_WRONG_PORT_LAN_1_4'
      ? 2
      : -1;

  // Front faceplate strip
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(24, 72, 336, 178);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 72, 336, 178);

  ports.forEach((port, index) => {
    const px = port.x;
    const py = 114;
    const pw = 52;
    const ph = 54;

    // Printed port label above jack
    ctx.fillStyle = port.isWan ? '#fbbf24' : '#cbd5e1';
    ctx.font = port.isWan
      ? 'bold 10px ui-monospace, monospace'
      : 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(port.isWan ? 'WAN' : port.short, px + pw / 2, 92);
    if (port.isWan) {
      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.fillText('(PORT 0)', px + pw / 2, 104);
    }

    // Bezel
    ctx.fillStyle = '#020617';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = port.isWan ? '#f59e0b' : '#64748b';
    ctx.lineWidth = port.isWan ? 2.5 : 1.5;
    ctx.strokeRect(px, py, pw, ph);

    // RJ45 cavity / gold pins
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px + 8, py + 10, pw - 16, ph - 18);
    ctx.fillStyle = '#eab308';
    for (let pin = 0; pin < 6; pin += 1) {
      ctx.fillRect(px + 12 + pin * 5, py + 12, 2, 8);
    }

    // Seated blue RJ45 boot if active
    if (index === activePortIndex) {
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(px + 6, py + 14, pw - 12, ph - 8);
      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 6, py + 14, pw - 12, ph - 8);

      // Link LED
      ctx.fillStyle = port.isWan ? '#10b981' : '#ef4444';
      ctx.fillRect(px + 4, py + 3, 10, 5);

      // Trailing blue Cat6A cable
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(px + pw / 2, py + ph + 6);
      ctx.bezierCurveTo(
        px + pw / 2,
        290,
        192,
        300,
        192,
        345
      );
      ctx.stroke();

      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 10px ui-monospace, monospace';
      ctx.fillText('CAT6A', px + pw / 2, py + 38);
    }
  });

  // Cable tray status bar at bottom
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(32, 272, 320, 62);
  ctx.strokeStyle = activePortIndex === 0 ? '#10b981' : '#475569';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(32, 272, 320, 62);

  ctx.fillStyle =
    activePortIndex === 0
      ? '#6ee7b7'
      : activePortIndex === -1
      ? '#fbbf24'
      : '#fca5a5';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    activePortIndex === 0
      ? 'UPLINK CONNECTED: WAN (PORT 0)'
      : activePortIndex === -1
      ? 'WAN (PORT 0) UNPLUGGED / EMPTY'
      : 'MISROUTED: CABLE IN LAN 2',
    192,
    296
  );
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('CLICK ANY PORT TO MOVE CABLE (OR TRAY TO UNPLUG)', 192, 318);
}

function drawDimmSlotsScene(
  ctx: CanvasRenderingContext2D,
  stateToken: string
): void {
  drawChassisFrame(ctx, 'SYSTEM BOARD // DDR5 DIMM BANK', true);

  const slots = [
    { label: 'DIMM_A1', x: 54, primary: false },
    { label: 'DIMM_A2', x: 126, primary: true },
    { label: 'DIMM_B1', x: 214, primary: false },
    { label: 'DIMM_B2', x: 286, primary: true }
  ];

  const isWrongSlots = stateToken === 'SINGLE_CHANNEL_WRONG_SLOT_A1';
  const isUnlatched = stateToken === 'UNLATCHED_DIMM_EJECTOR_CLIP';

  slots.forEach((slot, idx) => {
    const sx = slot.x;
    const sw = 44;
    const sy = 76;
    const sh = 228;

    const isPopulated = isWrongSlots
      ? idx === 0 || idx === 2
      : idx === 1 || idx === 3;

    // Silkscreen label above slot
    ctx.fillStyle = slot.primary ? '#6ee7b7' : '#94a3b8';
    ctx.font = 'bold 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(slot.label, sx + sw / 2, 60);

    // Slot housing
    ctx.fillStyle = '#020617';
    ctx.fillRect(sx + 8, sy, sw - 16, sh);
    ctx.strokeStyle = slot.primary ? '#34d399' : '#475569';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx + 8, sy, sw - 16, sh);

    // Top white retention ejector clip
    const clipFlaredOut = isUnlatched && idx === 1;
    ctx.save();
    if (clipFlaredOut) {
      ctx.translate(sx + sw / 2, sy);
      ctx.rotate(-0.45);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-14, -14, 28, 12);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(-14, -14, 28, 12);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(sx + 6, sy - 6, sw - 12, 10);
    }
    ctx.restore();

    // Bottom white retention clip
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(sx + 6, sy + sh - 4, sw - 12, 10);

    // DDR5 Module body if populated
    if (isPopulated) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(sx + 11, sy + 10, sw - 22, sh - 20);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 11, sy + 10, sw - 22, sh - 20);

      // Heatspreader fin detail
      ctx.fillStyle = '#334155';
      ctx.fillRect(sx + 14, sy + 26, sw - 28, sh - 52);

      ctx.save();
      ctx.translate(sx + sw / 2, sy + sh / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#e0f2fe';
      ctx.font = 'bold 11px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DDR5 ECC 32G', 0, 4);
      ctx.restore();
    }
  });

  ctx.fillStyle = isUnlatched ? '#fca5a5' : isWrongSlots ? '#fde68a' : '#a7f3d0';
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    isUnlatched
      ? 'ALERT: DIMM_A2 CLIP UNLATCHED'
      : isWrongSlots
      ? 'WRONG SLOTS: DIMM_A1 / B1 POPULATED'
      : 'LOCKED: DIMM_A2 & DIMM_B2 POPULATED',
    192,
    330
  );
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('CLICK A1/B1 OR A2/B2 SLOTS, OR TOP EJECTOR CLIP', 192, 352);
}

function drawClrCmosJumperScene(
  ctx: CanvasRenderingContext2D,
  stateToken: string
): void {
  drawChassisFrame(ctx, 'MAINBOARD // CLR_CMOS HEADER', true);

  // CR2032 Coin Battery on left
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.arc(96, 178, 54, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CR2032', 96, 172);
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('3V LITHIUM', 96, 190);

  // CLR_CMOS silkscreen box on right
  ctx.fillStyle = '#064e3b';
  ctx.fillRect(178, 92, 168, 172);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(178, 92, 168, 172);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 15px ui-monospace, monospace';
  ctx.fillText('CLR_CMOS', 262, 116);

  // 3 Gold pins: Pin 1 (RUN), Pin 2 (COM), Pin 3 (CLR)
  const pins = [
    { num: '1', label: 'RUN', x: 212 },
    { num: '2', label: 'COM', x: 262 },
    { num: '3', label: 'CLR', x: 312 }
  ];

  pins.forEach((pin) => {
    // Plastic base
    ctx.fillStyle = '#020617';
    ctx.fillRect(pin.x - 16, 152, 32, 40);
    // Gold square pin
    ctx.fillStyle = '#facc15';
    ctx.fillRect(pin.x - 6, 164, 12, 12);
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pin.x - 6, 164, 12, 12);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText(pin.num, pin.x, 212);
    ctx.fillStyle = pin.num === '3' ? '#fca5a5' : '#a7f3d0';
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.fillText(pin.label, pin.x, 228);
  });

  const isPins12 = stateToken === 'JUMPER_CAP_PINS_1_2_RUN';
  const isPins23 = stateToken === 'JUMPER_CAP_PINS_2_3_RESET';

  if (isPins12 || isPins23) {
    const capX = isPins12 ? 194 : 244;
    ctx.fillStyle = '#eab308';
    ctx.fillRect(capX, 146, 86, 48);
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(capX, 146, 86, 48);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText(isPins12 ? 'SHUNT 1-2' : 'SHUNT 2-3', capX + 43, 171);
  } else {
    ctx.fillStyle = '#fca5a5';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.fillText('OPEN HEADER (NO CAP)', 262, 248);
  }

  ctx.fillStyle = isPins12 ? '#a7f3d0' : '#fca5a5';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.fillText(
    isPins12
      ? 'NORMAL RUN: PINS 1-2 BRIDGED'
      : isPins23
      ? 'RESET MODE: PINS 2-3 BRIDGED'
      : 'FAULT: JUMPER CAP MISSING',
    192,
    304
  );
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('CLICK PINS 1-2, PINS 2-3, OR OUTSIDE TO REMOVE CAP', 192, 344);
}

function drawGenericHardwarePanel(
  ctx: CanvasRenderingContext2D,
  step: CartridgeStep,
  stateToken: string
): void {
  drawChassisFrame(ctx, step.roiLabel.slice(0, 28), false);

  const isValid = stateToken === step.expectedState;
  const isMistake = step.knownMistakeStates.includes(stateToken);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(28, 60, 328, 252);
  ctx.strokeStyle = isValid ? '#10b981' : isMistake ? '#ef4444' : '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(28, 60, 328, 252);

  // Status indicator banner
  ctx.fillStyle = isValid ? '#064e3b' : isMistake ? '#7f1d1d' : '#78350f';
  ctx.fillRect(44, 78, 296, 52);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ACTIVE HARDWARE STATE', 192, 96);
  ctx.fillStyle = isValid ? '#6ee7b7' : isMistake ? '#fecaca' : '#fde68a';
  ctx.font = 'bold 12px ui-monospace, monospace';
  ctx.fillText(stateToken.slice(0, 34), 192, 116);

  // Anchor hints readout
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 11px ui-monospace, monospace';
  ctx.fillText('ANCHOR CUES:', 48, 156);

  step.anchorHints.slice(0, 3).forEach((hint, idx) => {
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px ui-monospace, monospace';
    const truncated = hint.length > 42 ? `${hint.slice(0, 39)}...` : hint;
    ctx.fillText(`• ${truncated}`, 48, 178 + idx * 24);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('CLICK PANEL TO CYCLE SIMULATED STATES', 192, 346);
}

export function renderWorkbenchSceneToCanvas(
  ctx: CanvasRenderingContext2D,
  step: CartridgeStep,
  stateToken: string
): void {
  if (stateToken === UNLISTED_ANOMALY_TOKEN) {
    drawChassisFrame(ctx, step.roiLabel.slice(0, 28), false);
    drawObstructedOverlay(ctx, step.roiLabel);
    return;
  }

  switch (step.roiLabel) {
    case 'MAIN_BREAKER_LOTO_PANEL':
      drawBreakerLotoScene(ctx, stateToken);
      return;
    case 'FRONT_IO_WAN_LAN_PORT_BANK':
      drawWanLanPortsScene(ctx, stateToken);
      return;
    case 'SYSTEM_BOARD_DIMM_BANK':
      drawDimmSlotsScene(ctx, stateToken);
      return;
    case 'CLR_CMOS_3PIN_HEADER':
      drawClrCmosJumperScene(ctx, stateToken);
      return;
    default:
      drawGenericHardwarePanel(ctx, step, stateToken);
  }
}

export function resolveCanvasClickNextState(
  step: CartridgeStep,
  currentState: string,
  canvasX: number,
  canvasY: number
): string {
  const available = resolveAvailableStatesForStep(step);

  if (currentState === UNLISTED_ANOMALY_TOKEN) {
    return step.expectedState;
  }

  switch (step.roiLabel) {
    case 'MAIN_BREAKER_LOTO_PANEL': {
      // Clicking left breaker housing toggles ON (I) vs OFF (O)
      if (canvasX < 226) {
        return currentState === 'BREAKER_ON_ENERGIZED'
          ? 'BREAKER_OFF_WITH_LOCKOUT_TAG'
          : 'BREAKER_ON_ENERGIZED';
      }
      // Clicking right LOTO hasp toggles safety tag
      return currentState === 'BREAKER_OFF_WITH_LOCKOUT_TAG'
        ? 'BREAKER_OFF_MISSING_TAG'
        : 'BREAKER_OFF_WITH_LOCKOUT_TAG';
    }

    case 'FRONT_IO_WAN_LAN_PORT_BANK': {
      // Clicking WAN port (x < 92, y < 255) seats cable in WAN (PORT 0)
      if (canvasY < 255 && canvasX < 94) {
        return 'CABLE_SEATED_IN_WAN_PORT_0';
      }
      // Clicking LAN 1-4 area misroutes cable into LAN
      if (canvasY < 255 && canvasX >= 94) {
        return 'CABLE_WRONG_PORT_LAN_1_4';
      }
      // Clicking bottom cable tray toggles unplugged vs WAN seated
      return currentState === 'WAN_PORT_UNPLUGGED_EMPTY'
        ? 'CABLE_SEATED_IN_WAN_PORT_0'
        : 'WAN_PORT_UNPLUGGED_EMPTY';
    }

    case 'SYSTEM_BOARD_DIMM_BANK': {
      // Top retention clip region toggles unlatched clip
      if (canvasY < 96) {
        return currentState === 'UNLATCHED_DIMM_EJECTOR_CLIP'
          ? 'TWO_MODULES_LOCKED_A2_B2'
          : 'UNLATCHED_DIMM_EJECTOR_CLIP';
      }
      // Clicking A1/B1 regions moves modules to wrong slots; A2/B2 locks valid slots
      const clickedWrongSlotColumn =
        (canvasX >= 40 && canvasX <= 108) || (canvasX >= 200 && canvasX <= 268);
      if (clickedWrongSlotColumn) {
        return 'SINGLE_CHANNEL_WRONG_SLOT_A1';
      }
      return 'TWO_MODULES_LOCKED_A2_B2';
    }

    case 'CLR_CMOS_3PIN_HEADER': {
      if (canvasX >= 180 && canvasX <= 268 && canvasY >= 120 && canvasY <= 245) {
        return 'JUMPER_CAP_PINS_1_2_RUN';
      }
      if (canvasX > 268 && canvasX <= 345 && canvasY >= 120 && canvasY <= 245) {
        return 'JUMPER_CAP_PINS_2_3_RESET';
      }
      return currentState === 'JUMPER_CAP_MISSING_OPEN'
        ? 'JUMPER_CAP_PINS_1_2_RUN'
        : 'JUMPER_CAP_MISSING_OPEN';
    }

    default: {
      const idx = available.indexOf(currentState);
      return available[(idx + 1) % available.length] ?? step.expectedState;
    }
  }
}
