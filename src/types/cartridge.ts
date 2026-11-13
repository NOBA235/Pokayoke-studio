export type VerificationMode = 'VISION_ROI' | 'FIELD_OBSERVATION';

export type CartridgeStatus = 'READY' | 'BLOCKED_FAILED_CHECKS' | 'DRAFT';

export type HybridExecutionMode = 'ONLY_ON_DEVICE' | 'PREFER_ON_DEVICE';

export type HardwareInferenceSource = 'ON_DEVICE' | 'IN_CLOUD';

export type VerificationSource = HardwareInferenceSource | 'FIELD_MANUAL';

export type LocalNanoAvailability =
  | 'AVAILABLE'
  | 'DOWNLOADABLE'
  | 'DOWNLOADING'
  | 'UNAVAILABLE'
  | 'UNSUPPORTED';

export type VerificationVerdict = 'PASS' | 'MISTAKE_LOCK' | 'ESCALATE';

export type MistakeSeverity = 'CRITICAL' | 'MAJOR' | 'WARNING';

export const UNLISTED_ANOMALY_TOKEN = 'OUT_OF_SCOPE_OR_OBSTRUCTED' as const;

export interface StepSourceCitation {
  sectionTitle: string;
  pageOrRef?: string;
  verbatimQuote: string;
}

export interface MistakeCondition {
  stateToken: string;
  label: string;
  severity: MistakeSeverity;
  remediation: string;
  sourceQuote?: string;
}

export interface SyntheticTestCase {
  id: string;
  description: string;
  simulatedObservation: string;
  expectedVerdict: VerificationVerdict;
  expectedMatchedMistakeToken?: string;
  isCritical: boolean;
}

export interface CartridgeStep {
  id: string;
  stepNumber: number;
  title: string;
  instruction: string;
  verificationMode: VerificationMode;
  roiLabel: string;
  expectedState: string;
  knownMistakeStates: string[];
  mistakeConditions: MistakeCondition[];
  unlistedAnomalyToken: typeof UNLISTED_ANOMALY_TOKEN;
  anchorHints: string[];
  fieldCheckPrompt?: string;
  expectedFieldNote?: string;
  source: StepSourceCitation;
  syntheticTests: SyntheticTestCase[];
}

export interface SyntheticTestEvaluation {
  testId: string;
  description: string;
  passed: boolean;
  isCritical: boolean;
  expectedVerdict: VerificationVerdict;
  actualVerdict: VerificationVerdict;
  reason: string;
}

export interface StepAuditDetail {
  stepId: string;
  stepNumber: number;
  quoteVerified: boolean;
  normalizedQuote: string;
  matchedOffset: number;
  structuralValid: boolean;
  testResults: SyntheticTestEvaluation[];
  stepPassed: boolean;
  errors: string[];
}

export interface ValidationReport {
  status: 'READY' | 'BLOCKED_FAILED_CHECKS';
  checkedAt: string;
  totalQuotesChecked: number;
  quotesVerified: number;
  quoteVerificationRate: number;
  totalTests: number;
  testsPassed: number;
  testPassRate: number;
  criticalFailures: number;
  blockingReasons: string[];
  stepDetails: StepAuditDetail[];
}

export interface CartridgePatchRecord {
  fromVersion: string;
  toVersion: string;
  patchedAt: string;
  stepId: string;
  escalationId: string;
  summary: string;
}

export interface VisualCartridge {
  id: string;
  name: string;
  equipmentModel: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  status: CartridgeStatus;
  rawManualText: string;
  steps: CartridgeStep[];
  validationReport: ValidationReport;
  patchHistory: CartridgePatchRecord[];
}

export interface StepVerificationResult {
  stepId: string;
  stepNumber: number;
  observedState: string;
  verdict: VerificationVerdict;
  inferenceSource: VerificationSource;
  latencyMs: number;
  timestamp: string;
  matchedMistake?: MistakeCondition;
  verbatimCitation: StepSourceCitation;
  rawModelText?: string;
  capturedFrameDataUrl?: string;
}

export type EscalationStatus = 'PENDING_SYNC' | 'RESOLVED_PATCHED' | 'DISMISSED';

export interface OfflineEscalationItem {
  id: string;
  cartridgeId: string;
  cartridgeVersion: string;
  stepId: string;
  stepNumber: number;
  roiLabel: string;
  observedState: string;
  operatorNotes: string;
  frameBase64Jpeg: string;
  createdAt: string;
  status: EscalationStatus;
  proposedPatchedStep?: CartridgeStep;
  resolutionNotes?: string;
}

export interface CartridgeVersionSnapshot {
  key: string;
  cartridgeId: string;
  version: string;
  savedAt: string;
  snapshot: VisualCartridge;
}

export interface EscalationPatchProposal {
  escalationId: string;
  originalStep: CartridgeStep;
  proposedStep: CartridgeStep;
  rationale: string;
  inferenceSource: HardwareInferenceSource;
  latencyMs: number;
}
