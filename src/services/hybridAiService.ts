import {
  GenerativeModel,
  InferenceMode,
  InferenceSource,
  InlineDataPart,
  Schema,
  TextPart,
  getGenerativeModel
} from 'firebase/ai';
import { getCloudModelName, getFirebaseAI } from '../config/firebase';
import {
  CartridgeStep,
  EscalationPatchProposal,
  HardwareInferenceSource,
  HybridExecutionMode,
  LocalNanoAvailability,
  MistakeSeverity,
  OfflineEscalationItem,
  StepVerificationResult,
  UNLISTED_ANOMALY_TOKEN,
  VerificationMode,
  VerificationVerdict,
  VisualCartridge
} from '../types/cartridge';
import { applyAuditToCartridge, evaluateStepVerdict } from './compilerAudit';

interface ChromeLanguageModelApi {
  availability?: (options?: {
    expectedInputs?: Array<{ type: 'text' | 'image' | 'audio' }>;
  }) => Promise<string>;
}

interface WindowWithLanguageModel {
  LanguageModel?: ChromeLanguageModelApi;
}

export interface FifoMutexQueue {
  enqueue: <T>(task: () => Promise<T>) => Promise<T>;
  getPendingCount: () => number;
}

export function createFifoMutexQueue(): FifoMutexQueue {
  let queueTail: Promise<void> = Promise.resolve();
  let pendingCount = 0;

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      pendingCount += 1;
      const run = queueTail.then(async () => {
        try {
          return await task();
        } finally {
          pendingCount = Math.max(0, pendingCount - 1);
        }
      });

      queueTail = run.then(
        () => undefined,
        () => undefined
      );

      return run;
    },
    getPendingCount(): number {
      return pendingCount;
    }
  };
}

const aiExecutionQueue = createFifoMutexQueue();

export function getAiQueueDepth(): number {
  return aiExecutionQueue.getPendingCount();
}

export async function probeLocalNanoHardware(): Promise<LocalNanoAvailability> {
  if (typeof window === 'undefined') {
    return 'UNSUPPORTED';
  }

  const languageModel = (window as unknown as WindowWithLanguageModel).LanguageModel;
  if (!languageModel || typeof languageModel.availability !== 'function') {
    return 'UNSUPPORTED';
  }

  try {
    const rawAvailability = await languageModel.availability({
      expectedInputs: [{ type: 'image' }, { type: 'text' }]
    });

    const normalized = rawAvailability.toLowerCase();
    if (normalized === 'available' || normalized === 'readily') {
      return 'AVAILABLE';
    }
    if (normalized === 'downloadable' || normalized === 'after-download') {
      return 'DOWNLOADABLE';
    }
    if (normalized === 'downloading') {
      return 'DOWNLOADING';
    }
    if (normalized === 'unavailable' || normalized === 'no') {
      return 'UNAVAILABLE';
    }
    return 'UNAVAILABLE';
  } catch {
    return 'UNSUPPORTED';
  }
}

export function parseEnumTokenFromResponse(
  rawText: string,
  allowedTokens: readonly string[]
): string {
  const trimmed = rawText.trim();
  if (allowedTokens.includes(trimmed)) {
    return trimmed;
  }

  // Handle JSON-encoded string responses such as "\"BREAKER_OFF_WITH_LOCKOUT_TAG\""
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (typeof parsed === 'string' && allowedTokens.includes(parsed.trim())) {
      return parsed.trim();
    }
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      for (const value of Object.values(record)) {
        if (typeof value === 'string' && allowedTokens.includes(value.trim())) {
          return value.trim();
        }
      }
    }
  } catch {
    // Not JSON; fall through to token scan
  }

  const unquoted = trimmed.replace(/^["'`]+|["'`]+$/g, '').trim();
  if (allowedTokens.includes(unquoted)) {
    return unquoted;
  }

  for (const token of allowedTokens) {
    if (trimmed.includes(token)) {
      return token;
    }
  }

  return UNLISTED_ANOMALY_TOKEN;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
}

function stripDataUrlPrefix(dataUrlOrBase64: string): string {
  const commaIndex = dataUrlOrBase64.indexOf(',');
  if (commaIndex !== -1 && dataUrlOrBase64.startsWith('data:')) {
    return dataUrlOrBase64.slice(commaIndex + 1);
  }
  return dataUrlOrBase64;
}

const COMPILER_STEP_SCHEMA = Schema.object({
  properties: {
    id: Schema.string({ description: 'URL-safe step identifier, e.g. step-1-breaker' }),
    stepNumber: Schema.integer({ description: '1-based sequential step number' }),
    title: Schema.string({ description: 'Concise action title for operator HUD' }),
    instruction: Schema.string({ description: 'Clear 1-2 sentence operator instruction' }),
    verificationMode: Schema.enumString({
      description:
        'VISION_ROI for visual label/presence/color-tag checks; FIELD_OBSERVATION for non-visual measurements.',
      enum: ['VISION_ROI', 'FIELD_OBSERVATION']
    }),
    roiLabel: Schema.string({
      description: 'UPPER_SNAKE_CASE identifier for the target physical region of interest'
    }),
    expectedState: Schema.string({
      description: 'UPPER_SNAKE_CASE canonical enum token representing valid state'
    }),
    knownMistakeStates: Schema.array({
      description: '1 to 3 UPPER_SNAKE_CASE mistake state enum tokens',
      items: Schema.string()
    }),
    mistakeConditions: Schema.array({
      description: 'Detailed remediation metadata for each knownMistakeStates token',
      items: Schema.object({
        properties: {
          stateToken: Schema.string(),
          label: Schema.string(),
          severity: Schema.enumString({ enum: ['CRITICAL', 'MAJOR', 'WARNING'] }),
          remediation: Schema.string(),
          sourceQuote: Schema.string()
        },
        optionalProperties: ['sourceQuote']
      })
    }),
    anchorHints: Schema.array({
      description:
        'Anchor-based semantic visual cues (printed silkscreen labels, status tags, connector presence). Avoid unlabeled spatial geometry.',
      items: Schema.string()
    }),
    fieldCheckPrompt: Schema.string({
      description: 'Required when verificationMode is FIELD_OBSERVATION'
    }),
    expectedFieldNote: Schema.string({
      description: 'Expected reading or tolerance when verificationMode is FIELD_OBSERVATION'
    }),
    source: Schema.object({
      properties: {
        sectionTitle: Schema.string(),
        pageOrRef: Schema.string(),
        verbatimQuote: Schema.string({
          description:
            'Exact character-for-character substring copied verbatim from the provided manual text.'
        })
      },
      optionalProperties: ['pageOrRef']
    }),
    syntheticTests: Schema.array({
      description: 'At least 2 deterministic synthetic tests (PASS and MISTAKE_LOCK/ESCALATE)',
      items: Schema.object({
        properties: {
          id: Schema.string(),
          description: Schema.string(),
          simulatedObservation: Schema.string(),
          expectedVerdict: Schema.enumString({ enum: ['PASS', 'MISTAKE_LOCK', 'ESCALATE'] }),
          expectedMatchedMistakeToken: Schema.string(),
          isCritical: Schema.boolean()
        },
        optionalProperties: ['expectedMatchedMistakeToken']
      })
    })
  },
  optionalProperties: ['fieldCheckPrompt', 'expectedFieldNote']
});

const COMPILER_CARTRIDGE_SCHEMA = Schema.object({
  properties: {
    name: Schema.string({ description: 'Concise cartridge display name' }),
    equipmentModel: Schema.string({ description: 'Equipment model name' }),
    steps: Schema.array({
      description: 'Sequential commissioning/assembly SOP steps',
      items: COMPILER_STEP_SCHEMA
    })
  }
});

const ESCALATION_PATCH_SCHEMA = Schema.object({
  properties: {
    rationale: Schema.string({
      description: 'Explanation of what the anomaly image shows and why the step rule is updated'
    }),
    patchedStep: COMPILER_STEP_SCHEMA
  }
});

interface RawCompiledStep {
  id: string;
  stepNumber: number;
  title: string;
  instruction: string;
  verificationMode: VerificationMode;
  roiLabel: string;
  expectedState: string;
  knownMistakeStates: string[];
  mistakeConditions: Array<{
    stateToken: string;
    label: string;
    severity: MistakeSeverity;
    remediation: string;
    sourceQuote?: string;
  }>;
  anchorHints: string[];
  fieldCheckPrompt?: string;
  expectedFieldNote?: string;
  source: {
    sectionTitle: string;
    pageOrRef?: string;
    verbatimQuote: string;
  };
  syntheticTests: Array<{
    id: string;
    description: string;
    simulatedObservation: string;
    expectedVerdict: VerificationVerdict;
    expectedMatchedMistakeToken?: string;
    isCritical: boolean;
  }>;
}

interface RawCompiledCartridgePayload {
  name: string;
  equipmentModel: string;
  steps: RawCompiledStep[];
}

interface RawEscalationPatchPayload {
  rationale: string;
  patchedStep: RawCompiledStep;
}

function normalizeCompiledStep(raw: RawCompiledStep, index: number): CartridgeStep {
  return {
    id: raw.id.trim() || `step-${index + 1}`,
    stepNumber: raw.stepNumber > 0 ? raw.stepNumber : index + 1,
    title: raw.title.trim(),
    instruction: raw.instruction.trim(),
    verificationMode: raw.verificationMode,
    roiLabel: raw.roiLabel.trim(),
    expectedState: raw.expectedState.trim(),
    knownMistakeStates: raw.knownMistakeStates.map((token) => token.trim()).slice(0, 3),
    mistakeConditions: raw.mistakeConditions.map((condition) => ({
      stateToken: condition.stateToken.trim(),
      label: condition.label.trim(),
      severity: condition.severity,
      remediation: condition.remediation.trim(),
      sourceQuote: condition.sourceQuote?.trim()
    })),
    unlistedAnomalyToken: UNLISTED_ANOMALY_TOKEN,
    anchorHints: raw.anchorHints.map((hint) => hint.trim()),
    fieldCheckPrompt: raw.fieldCheckPrompt?.trim(),
    expectedFieldNote: raw.expectedFieldNote?.trim(),
    source: {
      sectionTitle: raw.source.sectionTitle.trim(),
      pageOrRef: raw.source.pageOrRef?.trim(),
      verbatimQuote: raw.source.verbatimQuote.trim()
    },
    syntheticTests: raw.syntheticTests.map((test) => ({
      id: test.id.trim(),
      description: test.description.trim(),
      simulatedObservation: test.simulatedObservation.trim(),
      expectedVerdict: test.expectedVerdict,
      expectedMatchedMistakeToken: test.expectedMatchedMistakeToken?.trim(),
      isCritical: Boolean(test.isCritical)
    }))
  };
}

function createCartridgeId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Date.now().toString(36).slice(-4);
  return `${slug || 'cartridge'}-${suffix}`;
}

export interface CompileManualResult {
  cartridge: VisualCartridge;
  inferenceSource: HardwareInferenceSource;
  latencyMs: number;
}

export async function compileManualInCloud(params: {
  manualText: string;
  equipmentModel: string;
  cartridgeName?: string;
}): Promise<CompileManualResult> {
  const ai = getFirebaseAI();
  if (!ai) {
    throw new Error(
      'Firebase AI is not configured. Populate .env from .env.example to compile manuals in Cloud Gemini.'
    );
  }

  const trimmedManual = params.manualText.trim();
  if (!trimmedManual) {
    throw new Error('Manual text cannot be empty.');
  }

  return aiExecutionQueue.enqueue(async () => {
    const start = performance.now();
    const model: GenerativeModel = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: getCloudModelName(),
        systemInstruction: [
          'You are the PokaYoke Studio SOP Compiler.',
          'Compile the supplied equipment manual into deterministic Poka-Yoke verification steps.',
          'RULES:',
          '1. Prefer anchor-based semantic checks (printed text labels, connector presence, component count, high-contrast status tags) over ambiguous unlabeled left/right/up/down geometry.',
          '2. Use verificationMode "VISION_ROI" for clear visual label/presence/color-tag states, and "FIELD_OBSERVATION" for non-visual torque/voltage/measurement checks.',
          '3. Every step MUST include 1 to 3 distinct knownMistakeStates with matching mistakeConditions.',
          '4. Every source.verbatimQuote MUST be copied CHARACTER-FOR-CHARACTER from the provided manual text (minimum 12 characters). Never paraphrase or invent quotes.',
          '5. Include at least 2 syntheticTests per step (at least one PASS case and one MISTAKE_LOCK or ESCALATE case).'
        ].join('\n'),
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: COMPILER_CARTRIDGE_SCHEMA
        }
      }
    });

    const prompt = [
      `Equipment Model: ${params.equipmentModel.trim()}`,
      params.cartridgeName ? `Preferred Cartridge Name: ${params.cartridgeName.trim()}` : '',
      '',
      '--- RAW SOURCE MANUAL START ---',
      trimmedManual,
      '--- RAW SOURCE MANUAL END ---'
    ]
      .filter(Boolean)
      .join('\n');

    const result = await model.generateContent(prompt);
    const latencyMs = Math.round(performance.now() - start);
    const rawJson = result.response.text();
    const parsed = JSON.parse(rawJson) as RawCompiledCartridgePayload;

    const now = new Date().toISOString();
    const displayName =
      params.cartridgeName?.trim() ||
      parsed.name.trim() ||
      `${params.equipmentModel.trim()} SOP`;

    const draftCartridge: VisualCartridge = {
      id: createCartridgeId(displayName),
      name: displayName,
      equipmentModel: parsed.equipmentModel.trim() || params.equipmentModel.trim(),
      version: '1.0.0',
      createdAt: now,
      updatedAt: now,
      status: 'DRAFT',
      rawManualText: trimmedManual,
      steps: parsed.steps.map((step, index) => normalizeCompiledStep(step, index)),
      validationReport: {
        status: 'BLOCKED_FAILED_CHECKS',
        checkedAt: now,
        totalQuotesChecked: 0,
        quotesVerified: 0,
        quoteVerificationRate: 0,
        totalTests: 0,
        testsPassed: 0,
        testPassRate: 0,
        criticalFailures: 0,
        blockingReasons: ['Pending audit'],
        stepDetails: []
      },
      patchHistory: []
    };

    const auditedCartridge = applyAuditToCartridge(draftCartridge);

    return {
      cartridge: auditedCartridge,
      inferenceSource:
        result.response.inferenceSource === InferenceSource.ON_DEVICE
          ? 'ON_DEVICE'
          : 'IN_CLOUD',
      latencyMs
    };
  });
}

export interface VerifyStepParams {
  step: CartridgeStep;
  frameBlob: Blob;
  executionMode: HybridExecutionMode;
  capturedFrameDataUrl?: string;
  signal?: AbortSignal;
}

export async function verifyWorkstationStep(
  params: VerifyStepParams
): Promise<StepVerificationResult> {
  const ai = getFirebaseAI();
  if (!ai) {
    throw new Error(
      'Firebase AI is not configured. Populate .env from .env.example (or configure Firebase project keys) to run hybrid inference.'
    );
  }

  const { step, frameBlob, executionMode, capturedFrameDataUrl, signal } = params;

  const enumTokens = Array.from(
    new Set([step.expectedState, ...step.knownMistakeStates, UNLISTED_ANOMALY_TOKEN])
  );

  const stepEnumSchema = Schema.enumString({
    description: `Observed state enum token for ROI ${step.roiLabel}`,
    enum: enumTokens
  });

  const firebaseMode =
    executionMode === 'ONLY_ON_DEVICE'
      ? InferenceMode.ONLY_ON_DEVICE
      : InferenceMode.PREFER_ON_DEVICE;

  return aiExecutionQueue.enqueue(async () => {
    const start = performance.now();
    const base64Jpeg = await blobToBase64(frameBlob);

    const model = getGenerativeModel(ai, {
      mode: firebaseMode,
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: 'image' }, { type: 'text' }]
        },
        promptOptions: {
          responseConstraint: stepEnumSchema
        }
      },
      inCloudParams: {
        model: getCloudModelName(),
        generationConfig: {
          temperature: 0,
          responseMimeType: 'text/x.enum',
          responseSchema: stepEnumSchema
        }
      }
    });

    const focusedPrompt = [
      `Inspect ROI: ${step.roiLabel}`,
      `Step ${step.stepNumber}: ${step.title}`,
      `Requirement: ${step.instruction}`,
      step.anchorHints.length > 0
        ? `Visual Anchors: ${step.anchorHints.join(' | ')}`
        : '',
      `Expected valid state token: ${step.expectedState}`,
      `Known mistake tokens: ${step.knownMistakeStates.join(', ')}`,
      `If the frame is obstructed, dark, out-of-focus, or shows an unlisted state, return ${UNLISTED_ANOMALY_TOKEN}.`,
      `Return ONLY one exact enum token from: ${enumTokens.join(', ')}.`
    ]
      .filter(Boolean)
      .join('\n');

    const textPart: TextPart = {
      type: 'text',
      text: focusedPrompt
    };
    const imagePart: InlineDataPart = {
      type: 'inlineData',
      inlineData: {
        mimeType: frameBlob.type === 'image/png' ? 'image/png' : 'image/jpeg',
        data: base64Jpeg
      }
    };

    const result = await model.generateContent(
      {
        contents: [
          {
            role: 'user',
            parts: [textPart, imagePart]
          }
        ]
      },
      signal ? { signal } : undefined
    );

    const latencyMs = Math.round(performance.now() - start);
    const rawText = result.response.text();
    const observedState = parseEnumTokenFromResponse(rawText, enumTokens);

    // Honest Telemetry Guardrail: never claim ON_DEVICE unless SDK explicitly reports ON_DEVICE
    const inferenceSource: HardwareInferenceSource =
      result.response.inferenceSource === InferenceSource.ON_DEVICE
        ? 'ON_DEVICE'
        : 'IN_CLOUD';

    const evaluation = evaluateStepVerdict(step, observedState);

    return {
      stepId: step.id,
      stepNumber: step.stepNumber,
      observedState,
      verdict: evaluation.verdict,
      inferenceSource,
      latencyMs,
      timestamp: new Date().toISOString(),
      matchedMistake: evaluation.matchedMistake,
      verbatimCitation: step.source,
      rawModelText: rawText,
      capturedFrameDataUrl
    };
  });
}

export async function resolveEscalationInCloud(params: {
  escalation: OfflineEscalationItem;
  currentStep: CartridgeStep;
  rawManualText: string;
}): Promise<EscalationPatchProposal> {
  const ai = getFirebaseAI();
  if (!ai) {
    throw new Error(
      'Firebase AI is not configured. Populate .env to escalate anomalies to Cloud Gemini.'
    );
  }

  const { escalation, currentStep, rawManualText } = params;

  return aiExecutionQueue.enqueue(async () => {
    const start = performance.now();

    const model = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: getCloudModelName(),
        systemInstruction: [
          'You are a Poka-Yoke Manufacturing Quality Engineer.',
          'Analyze the escalated 384x384 anomaly snapshot, operator notes, current step rule, and source manual.',
          'Propose a patched CartridgeStep that clarifies anchor hints or adds/refines a knownMistakeState (max 3 knownMistakeStates total) to handle this observed condition.',
          'CRITICAL: source.verbatimQuote MUST remain an exact character-for-character substring of the provided source manual text.',
          'Keep id, stepNumber, roiLabel, and verificationMode consistent with the current step, and ensure syntheticTests pass deterministically.'
        ].join('\n'),
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: ESCALATION_PATCH_SCHEMA
        }
      }
    });

    const promptText = [
      `Escalation ID: ${escalation.id}`,
      `Observed Anomaly Token: ${escalation.observedState}`,
      `Operator Notes: ${escalation.operatorNotes || 'None provided'}`,
      '',
      'Current Step JSON:',
      JSON.stringify(currentStep, null, 2),
      '',
      'Source Manual Text (for exact verbatimQuote preservation):',
      rawManualText
    ].join('\n');

    const textPart: TextPart = {
      type: 'text',
      text: promptText
    };
    const imagePart: InlineDataPart = {
      type: 'inlineData',
      inlineData: {
        mimeType: 'image/jpeg',
        data: stripDataUrlPrefix(escalation.frameBase64Jpeg)
      }
    };

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [textPart, imagePart]
        }
      ]
    });

    const latencyMs = Math.round(performance.now() - start);
    const parsed = JSON.parse(result.response.text()) as RawEscalationPatchPayload;
    const normalizedStep = normalizeCompiledStep(
      parsed.patchedStep,
      currentStep.stepNumber - 1
    );

    const proposedStep: CartridgeStep = {
      ...normalizedStep,
      id: currentStep.id,
      stepNumber: currentStep.stepNumber,
      roiLabel: currentStep.roiLabel,
      verificationMode: currentStep.verificationMode,
      unlistedAnomalyToken: UNLISTED_ANOMALY_TOKEN
    };

    return {
      escalationId: escalation.id,
      originalStep: currentStep,
      proposedStep,
      rationale: parsed.rationale.trim(),
      inferenceSource:
        result.response.inferenceSource === InferenceSource.ON_DEVICE
          ? 'ON_DEVICE'
          : 'IN_CLOUD',
      latencyMs
    };
  });
}
