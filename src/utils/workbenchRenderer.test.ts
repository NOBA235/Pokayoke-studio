import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTER_CARTRIDGE } from '../fixtures/defaultRouterCartridge';
import { UNLISTED_ANOMALY_TOKEN } from '../types/cartridge';
import {
  resolveAvailableStatesForStep,
  resolveCanvasClickNextState
} from './workbenchRenderer';

describe('workbenchRenderer state transitions', () => {
  it('resolves all valid, mistake, and unlisted states for each step', () => {
    for (const step of DEFAULT_ROUTER_CARTRIDGE.steps) {
      const states = resolveAvailableStatesForStep(step);
      expect(states).toContain(step.expectedState);
      for (const mistake of step.knownMistakeStates) {
        expect(states).toContain(mistake);
      }
      expect(states).toContain(UNLISTED_ANOMALY_TOKEN);
    }
  });

  it('toggles Step 1 Breaker and LOTO tag states via canvas click zones', () => {
    const step1 = DEFAULT_ROUTER_CARTRIDGE.steps[0];
    // Clicking left breaker area toggles ON (I) vs OFF (O)
    expect(
      resolveCanvasClickNextState(step1, 'BREAKER_OFF_WITH_LOCKOUT_TAG', 120, 180)
    ).toBe('BREAKER_ON_ENERGIZED');
    expect(
      resolveCanvasClickNextState(step1, 'BREAKER_ON_ENERGIZED', 120, 180)
    ).toBe('BREAKER_OFF_WITH_LOCKOUT_TAG');

    // Clicking right LOTO hasp toggles tag missing vs attached
    expect(
      resolveCanvasClickNextState(step1, 'BREAKER_OFF_WITH_LOCKOUT_TAG', 290, 220)
    ).toBe('BREAKER_OFF_MISSING_TAG');
    expect(
      resolveCanvasClickNextState(step1, 'BREAKER_OFF_MISSING_TAG', 290, 220)
    ).toBe('BREAKER_OFF_WITH_LOCKOUT_TAG');
  });

  it('routes Step 2 WAN/LAN cable and Step 4 CLR_CMOS jumper clicks accurately', () => {
    const step2 = DEFAULT_ROUTER_CARTRIDGE.steps[1];
    expect(
      resolveCanvasClickNextState(step2, 'CABLE_SEATED_IN_WAN_PORT_0', 180, 140)
    ).toBe('CABLE_WRONG_PORT_LAN_1_4');
    expect(
      resolveCanvasClickNextState(step2, 'CABLE_WRONG_PORT_LAN_1_4', 55, 140)
    ).toBe('CABLE_SEATED_IN_WAN_PORT_0');
    expect(
      resolveCanvasClickNextState(step2, 'CABLE_SEATED_IN_WAN_PORT_0', 180, 300)
    ).toBe('WAN_PORT_UNPLUGGED_EMPTY');

    const step4 = DEFAULT_ROUTER_CARTRIDGE.steps[3];
    expect(
      resolveCanvasClickNextState(step4, 'JUMPER_CAP_PINS_1_2_RUN', 300, 170)
    ).toBe('JUMPER_CAP_PINS_2_3_RESET');
    expect(
      resolveCanvasClickNextState(step4, 'JUMPER_CAP_PINS_2_3_RESET', 215, 170)
    ).toBe('JUMPER_CAP_PINS_1_2_RUN');
  });
});
