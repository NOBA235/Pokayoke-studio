import { applyAuditToCartridge } from '../services/compilerAudit';
import {
  CartridgeStep,
  UNLISTED_ANOMALY_TOKEN,
  VisualCartridge
} from '../types/cartridge';

export const RAW_ROUTER_MANUAL_TEXT = `EDGECORE XR-400 INDUSTRIAL RACK ROUTER — COMMISSIONING & MISTAKE-PROOFING SOP (REV 4.2)

SECTION 1: POWER ISOLATION & LOCKOUT/TAGOUT (LOTO)
1.1 Before opening the chassis or touching internal memory and jumper headers, verify the rear PSU Main Breaker rocker switch is toggled firmly to the OFF (O) position.
1.2 Attach the high-visibility red-and-yellow "DANGER: LOCKOUT" safety tag directly onto the breaker hasp so the unit cannot be accidentally energized during commissioning. Never proceed if the switch remains in ON (I) or if the lockout tag is missing.

SECTION 2: FRONT PANEL UPLINK CABLING
2.1 Connect the primary site fiber-copper media patch cable exclusively into the dedicated uplink port silkscreened "WAN (PORT 0)".
2.2 Leave ports labeled "LAN 1", "LAN 2", "LAN 3", and "LAN 4" completely unpopulated during initial provisioning so management DHCP leases do not loop onto the field bus.

SECTION 3: DUAL-CHANNEL DDR5 MEMORY POPULATION
3.1 Populate exactly two matched DDR5 ECC modules into the primary dual-channel slots labeled "DIMM_A2" and "DIMM_B2" on the system board silkscreen.
3.2 Keep secondary slots "DIMM_A1" and "DIMM_B1" empty for standard 64 GB builds. Confirm both white retention ejector clips on DIMM_A2 and DIMM_B2 snap inward completely flush against the module notches.

SECTION 4: CLEAR-CMOS JUMPER VERIFICATION
4.1 Locate the 3-pin configuration header silkscreened "CLR_CMOS" adjacent to the CR2032 coin battery.
4.2 For normal commissioning boot, verify the yellow shunt jumper cap bridges PINS 1-2 (RUN) with Pin 3 (CLR) left exposed and bare. Leaving the shunt on PINS 2-3 (CLR) or removing the cap entirely will prevent NVRAM configuration retention.`;

const INITIAL_STEPS: CartridgeStep[] = [
  {
    id: 'step-1-breaker-loto',
    stepNumber: 1,
    title: 'Main Breaker Isolation & LOTO Tag',
    instruction:
      'Toggle the rear PSU Main Breaker switch to OFF (O) and clip the DANGER: LOCKOUT safety tag onto the breaker hasp before servicing.',
    verificationMode: 'VISION_ROI',
    roiLabel: 'MAIN_BREAKER_LOTO_PANEL',
    expectedState: 'BREAKER_OFF_WITH_LOCKOUT_TAG',
    knownMistakeStates: ['BREAKER_ON_ENERGIZED', 'BREAKER_OFF_MISSING_TAG'],
    mistakeConditions: [
      {
        stateToken: 'BREAKER_ON_ENERGIZED',
        label: 'Main Breaker Still Energized — ON (I)',
        severity: 'CRITICAL',
        remediation:
          'Stop work immediately. Flip the Main Breaker rocker to OFF (O) and attach the red-and-yellow DANGER: LOCKOUT tag before opening the chassis.',
        sourceQuote:
          'Never proceed if the switch remains in ON (I) or if the lockout tag is missing.'
      },
      {
        stateToken: 'BREAKER_OFF_MISSING_TAG',
        label: 'Lockout/Tagout Safety Tag Missing',
        severity: 'CRITICAL',
        remediation:
          'Clip the high-visibility DANGER: LOCKOUT safety tag onto the breaker hasp while the switch is in OFF (O).'
      }
    ],
    unlistedAnomalyToken: UNLISTED_ANOMALY_TOKEN,
    anchorHints: [
      'Printed switch legend "OFF (O)" visible with rocker depressed toward OFF',
      'Red-and-yellow "DANGER: LOCKOUT" tag clipped to the breaker hasp',
      'Green "ISOLATED" status indicator window visible'
    ],
    source: {
      sectionTitle: 'SECTION 1: POWER ISOLATION & LOCKOUT/TAGOUT (LOTO)',
      pageOrRef: '§1.1–1.2',
      verbatimQuote:
        'Attach the high-visibility red-and-yellow "DANGER: LOCKOUT" safety tag directly onto the breaker hasp so the unit cannot be accidentally energized during commissioning.'
    },
    syntheticTests: [
      {
        id: 's1-pass-off-tagged',
        description: 'Breaker is OFF (O) with DANGER: LOCKOUT tag attached',
        simulatedObservation: 'BREAKER_OFF_WITH_LOCKOUT_TAG',
        expectedVerdict: 'PASS',
        isCritical: true
      },
      {
        id: 's1-fail-energized',
        description: 'Breaker left in ON (I) position triggers critical Mistake Lock',
        simulatedObservation: 'BREAKER_ON_ENERGIZED',
        expectedVerdict: 'MISTAKE_LOCK',
        expectedMatchedMistakeToken: 'BREAKER_ON_ENERGIZED',
        isCritical: true
      },
      {
        id: 's1-fail-missing-tag',
        description: 'Breaker OFF without LOTO tag triggers critical Mistake Lock',
        simulatedObservation: 'BREAKER_OFF_MISSING_TAG',
        expectedVerdict: 'MISTAKE_LOCK',
        expectedMatchedMistakeToken: 'BREAKER_OFF_MISSING_TAG',
        isCritical: true
      },
      {
        id: 's1-escalate-obstructed',
        description: 'Obstructed or unlisted frame queues offline escalation',
        simulatedObservation: UNLISTED_ANOMALY_TOKEN,
        expectedVerdict: 'ESCALATE',
        isCritical: false
      }
    ]
  },
  {
    id: 'step-2-wan-port-0',
    stepNumber: 2,
    title: 'Uplink Patch to WAN (PORT 0)',
    instruction:
      'Seat the blue Cat6A uplink patch cable exclusively into the port labeled WAN (PORT 0), leaving LAN 1–4 empty.',
    verificationMode: 'VISION_ROI',
    roiLabel: 'FRONT_IO_WAN_LAN_PORT_BANK',
    expectedState: 'CABLE_SEATED_IN_WAN_PORT_0',
    knownMistakeStates: ['CABLE_WRONG_PORT_LAN_1_4', 'WAN_PORT_UNPLUGGED_EMPTY'],
    mistakeConditions: [
      {
        stateToken: 'CABLE_WRONG_PORT_LAN_1_4',
        label: 'Patch Cable Misrouted into LAN 1–4',
        severity: 'MAJOR',
        remediation:
          'Unplug the RJ45 connector from LAN 1–4 and re-seat it firmly into the port labeled "WAN (PORT 0)".',
        sourceQuote:
          'Leave ports labeled "LAN 1", "LAN 2", "LAN 3", and "LAN 4" completely unpopulated during initial provisioning so management DHCP leases do not loop onto the field bus.'
      },
      {
        stateToken: 'WAN_PORT_UNPLUGGED_EMPTY',
        label: 'WAN (PORT 0) Unpopulated',
        severity: 'MAJOR',
        remediation:
          'Insert the primary site uplink RJ45 connector into "WAN (PORT 0)" until the latch clicks.'
      }
    ],
    unlistedAnomalyToken: UNLISTED_ANOMALY_TOKEN,
    anchorHints: [
      'Blue RJ45 patch boot seated inside port labeled "WAN (PORT 0)"',
      'Ports labeled "LAN 1", "LAN 2", "LAN 3", and "LAN 4" visibly empty',
      'High-contrast amber bezel around WAN (PORT 0)'
    ],
    source: {
      sectionTitle: 'SECTION 2: FRONT PANEL UPLINK CABLING',
      pageOrRef: '§2.1',
      verbatimQuote:
        'Connect the primary site fiber-copper media patch cable exclusively into the dedicated uplink port silkscreened "WAN (PORT 0)".'
    },
    syntheticTests: [
      {
        id: 's2-pass-wan-seated',
        description: 'Cable seated in WAN (PORT 0) with LAN 1-4 empty',
        simulatedObservation: 'CABLE_SEATED_IN_WAN_PORT_0',
        expectedVerdict: 'PASS',
        isCritical: true
      },
      {
        id: 's2-fail-wrong-lan',
        description: 'Cable plugged into LAN 1-4 triggers Mistake Lock',
        simulatedObservation: 'CABLE_WRONG_PORT_LAN_1_4',
        expectedVerdict: 'MISTAKE_LOCK',
        expectedMatchedMistakeToken: 'CABLE_WRONG_PORT_LAN_1_4',
        isCritical: true
      },
      {
        id: 's2-fail-unplugged',
        description: 'Empty WAN port triggers Mistake Lock',
        simulatedObservation: 'WAN_PORT_UNPLUGGED_EMPTY',
        expectedVerdict: 'MISTAKE_LOCK',
        expectedMatchedMistakeToken: 'WAN_PORT_UNPLUGGED_EMPTY',
        isCritical: false
      }
    ]
  },
  {
    id: 'step-3-dimm-a2-b2',
    stepNumber: 3,
    title: 'Dual-Channel DDR5 Seating (DIMM_A2 & DIMM_B2)',
    instruction:
      'Seat two DDR5 modules into slots DIMM_A2 and DIMM_B2 with white ejector clips snapped flush; leave DIMM_A1 and DIMM_B1 empty.',
    verificationMode: 'VISION_ROI',
    roiLabel: 'SYSTEM_BOARD_DIMM_BANK',
    expectedState: 'TWO_MODULES_LOCKED_A2_B2',
    knownMistakeStates: ['SINGLE_CHANNEL_WRONG_SLOT_A1', 'UNLATCHED_DIMM_EJECTOR_CLIP'],
    mistakeConditions: [
      {
        stateToken: 'SINGLE_CHANNEL_WRONG_SLOT_A1',
        label: 'Improper Slot Population (DIMM_A1 / B1 Used)',
        severity: 'MAJOR',
        remediation:
          'Move the memory modules out of DIMM_A1/B1 and populate only slots silkscreened "DIMM_A2" and "DIMM_B2".'
      },
      {
        stateToken: 'UNLATCHED_DIMM_EJECTOR_CLIP',
        label: 'Unlatched DIMM Retention Ejector Clip',
        severity: 'CRITICAL',
        remediation:
          'Press evenly on both ends of the DDR5 module until both white ejector clips snap inward flush with the module notch.',
        sourceQuote:
          'Confirm both white retention ejector clips on DIMM_A2 and DIMM_B2 snap inward completely flush against the module notches.'
      }
    ],
    unlistedAnomalyToken: UNLISTED_ANOMALY_TOKEN,
    anchorHints: [
      'Silkscreen labels "DIMM_A2" and "DIMM_B2" populated with 2 matched modules',
      'Silkscreen labels "DIMM_A1" and "DIMM_B1" remain empty',
      'White ejector clips rotated inward flush against module edges'
    ],
    source: {
      sectionTitle: 'SECTION 3: DUAL-CHANNEL DDR5 MEMORY POPULATION',
      pageOrRef: '§3.1–3.2',
      verbatimQuote:
        'Populate exactly two matched DDR5 ECC modules into the primary dual-channel slots labeled "DIMM_A2" and "DIMM_B2" on the system board silkscreen.'
    },
    syntheticTests: [
      {
        id: 's3-pass-a2-b2-locked',
        description: 'Matched modules locked in DIMM_A2 and DIMM_B2',
        simulatedObservation: 'TWO_MODULES_LOCKED_A2_B2',
        expectedVerdict: 'PASS',
        isCritical: true
      },
      {
        id: 's3-fail-wrong-slot',
        description: 'Module seated in DIMM_A1 triggers Mistake Lock',
        simulatedObservation: 'SINGLE_CHANNEL_WRONG_SLOT_A1',
        expectedVerdict: 'MISTAKE_LOCK',
        expectedMatchedMistakeToken: 'SINGLE_CHANNEL_WRONG_SLOT_A1',
        isCritical: true
      },
      {
        id: 's3-fail-unlatched',
        description: 'Open white ejector clip triggers critical Mistake Lock',
        simulatedObservation: 'UNLATCHED_DIMM_EJECTOR_CLIP',
        expectedVerdict: 'MISTAKE_LOCK',
        expectedMatchedMistakeToken: 'UNLATCHED_DIMM_EJECTOR_CLIP',
        isCritical: true
      }
    ]
  },
  {
    id: 'step-4-clr-cmos-jumper',
    stepNumber: 4,
    title: 'CLR_CMOS Jumper Cap (PINS 1-2 Normal Run)',
    instruction:
      'Confirm the yellow shunt jumper on header CLR_CMOS bridges PINS 1-2 (RUN) with Pin 3 (CLR) exposed and bare.',
    verificationMode: 'VISION_ROI',
    roiLabel: 'CLR_CMOS_3PIN_HEADER',
    expectedState: 'JUMPER_CAP_PINS_1_2_RUN',
    knownMistakeStates: ['JUMPER_CAP_PINS_2_3_RESET', 'JUMPER_CAP_MISSING_OPEN'],
    mistakeConditions: [
      {
        stateToken: 'JUMPER_CAP_PINS_2_3_RESET',
        label: 'CMOS Jumper Left on PINS 2-3 (CLR)',
        severity: 'CRITICAL',
        remediation:
          'Move the yellow jumper cap from PINS 2-3 (CLR) onto PINS 1-2 (RUN) before applying power.',
        sourceQuote:
          'Leaving the shunt on PINS 2-3 (CLR) or removing the cap entirely will prevent NVRAM configuration retention.'
      },
      {
        stateToken: 'JUMPER_CAP_MISSING_OPEN',
        label: 'CLR_CMOS Shunt Cap Missing (Open Header)',
        severity: 'CRITICAL',
        remediation:
          'Install a 2.54 mm yellow shunt jumper cap across PINS 1-2 (RUN) on the CLR_CMOS header.'
      }
    ],
    unlistedAnomalyToken: UNLISTED_ANOMALY_TOKEN,
    anchorHints: [
      'Silkscreen label "CLR_CMOS" next to 3-pin gold header',
      'Yellow shunt jumper seated over PINS 1-2 labeled "RUN"',
      'Pin 3 labeled "CLR" visibly bare gold pin'
    ],
    source: {
      sectionTitle: 'SECTION 4: CLEAR-CMOS JUMPER VERIFICATION',
      pageOrRef: '§4.1–4.2',
      verbatimQuote:
        'For normal commissioning boot, verify the yellow shunt jumper cap bridges PINS 1-2 (RUN) with Pin 3 (CLR) left exposed and bare.'
    },
    syntheticTests: [
      {
        id: 's4-pass-pins-1-2',
        description: 'Yellow shunt bridges PINS 1-2 (RUN)',
        simulatedObservation: 'JUMPER_CAP_PINS_1_2_RUN',
        expectedVerdict: 'PASS',
        isCritical: true
      },
      {
        id: 's4-fail-pins-2-3',
        description: 'Shunt left on PINS 2-3 (CLR) triggers critical Mistake Lock',
        simulatedObservation: 'JUMPER_CAP_PINS_2_3_RESET',
        expectedVerdict: 'MISTAKE_LOCK',
        expectedMatchedMistakeToken: 'JUMPER_CAP_PINS_2_3_RESET',
        isCritical: true
      },
      {
        id: 's4-fail-missing-cap',
        description: 'Missing jumper cap triggers critical Mistake Lock',
        simulatedObservation: 'JUMPER_CAP_MISSING_OPEN',
        expectedVerdict: 'MISTAKE_LOCK',
        expectedMatchedMistakeToken: 'JUMPER_CAP_MISSING_OPEN',
        isCritical: true
      }
    ]
  }
];

const DRAFT_CARTRIDGE: VisualCartridge = {
  id: 'edgecore-xr400-commissioning',
  name: 'EdgeCore XR-400 Commissioning SOP',
  equipmentModel: 'EdgeCore XR-400 Industrial Rack Router',
  version: '1.0.0',
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
  status: 'DRAFT',
  rawManualText: RAW_ROUTER_MANUAL_TEXT,
  steps: INITIAL_STEPS,
  validationReport: {
    status: 'BLOCKED_FAILED_CHECKS',
    checkedAt: '2026-11-12T00:00:00.000Z',
    totalQuotesChecked: 0,
    quotesVerified: 0,
    quoteVerificationRate: 0,
    totalTests: 0,
    testsPassed: 0,
    testPassRate: 0,
    criticalFailures: 0,
    blockingReasons: ['Pending compile-time audit'],
    stepDetails: []
  },
  patchHistory: []
};

export const DEFAULT_ROUTER_CARTRIDGE: VisualCartridge =
  applyAuditToCartridge(DRAFT_CARTRIDGE);
