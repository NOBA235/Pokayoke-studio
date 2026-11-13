import {
  CartridgeStep,
  MistakeCondition,
  StepAuditDetail,
  SyntheticTestEvaluation,
  UNLISTED_ANOMALY_TOKEN,
  ValidationReport,
  VerificationVerdict,
  VisualCartridge
} from '../types/cartridge';

const MIN_VERBATIM_QUOTE_LENGTH = 12;

export interface QuoteVerificationResult {
  verified: boolean;
  normalizedQuote: string;
  matchedOffset: number;
}

export interface StepVerdictEvaluation {
  verdict: VerificationVerdict;
  matchedMistake?: MistakeCondition;
}

export function normalizeForVerbatimCheck(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function verifyVerbatimQuote(
  rawManualText: string,
  verbatimQuote: string
): QuoteVerificationResult {
  const normalizedManual = normalizeForVerbatimCheck(rawManualText);
  const normalizedQuote = normalizeForVerbatimCheck(verbatimQuote);

  if (normalizedQuote.length < MIN_VERBATIM_QUOTE_LENGTH || normalizedManual.length === 0) {
    return {
      verified: false,
      normalizedQuote,
      matchedOffset: -1
    };
  }

  const matchedOffset = normalizedManual.indexOf(normalizedQuote);
  return {
    verified: matchedOffset !== -1,
    normalizedQuote,
    matchedOffset
  };
}

export function evaluateStepVerdict(
  step: CartridgeStep,
  observedState: string
): StepVerdictEvaluation {
  const token = observedState.trim();

  if (token === step.expectedState) {
    return { verdict: 'PASS' };
  }

  if (step.knownMistakeStates.includes(token)) {
    const matchedMistake = step.mistakeConditions.find(
      (condition) => condition.stateToken === token
    );
    return {
      verdict: 'MISTAKE_LOCK',
      matchedMistake
    };
  }

  return { verdict: 'ESCALATE' };
}

export function auditCompiledCartridge(
  cartridge: Pick<VisualCartridge, 'rawManualText' | 'steps'>
): ValidationReport {
  const checkedAt = new Date().toISOString();
  const blockingReasons: string[] = [];
  const stepDetails: StepAuditDetail[] = [];

  let totalQuotesChecked = 0;
  let quotesVerified = 0;
  let totalTests = 0;
  let testsPassed = 0;
  let criticalFailures = 0;

  if (!cartridge.rawManualText.trim()) {
    blockingReasons.push('Source manual text is empty; verbatim quote verification cannot run.');
  }

  if (cartridge.steps.length === 0) {
    blockingReasons.push('Cartridge contains zero assembly steps.');
  }

  for (const step of cartridge.steps) {
    const errors: string[] = [];

    // 1. Verbatim Quote Check
    totalQuotesChecked += 1;
    const quoteCheck = verifyVerbatimQuote(cartridge.rawManualText, step.source.verbatimQuote);
    if (quoteCheck.verified) {
      quotesVerified += 1;
    } else {
      const reason = `Step ${step.stepNumber} (${step.id}): Verbatim quote not found in normalized source manual.`;
      errors.push(reason);
      blockingReasons.push(reason);
    }

    // Optional mistake-specific source quote checks
    for (const mistake of step.mistakeConditions) {
      if (mistake.sourceQuote && mistake.sourceQuote.trim().length > 0) {
        totalQuotesChecked += 1;
        const mistakeQuoteCheck = verifyVerbatimQuote(
          cartridge.rawManualText,
          mistake.sourceQuote
        );
        if (mistakeQuoteCheck.verified) {
          quotesVerified += 1;
        } else {
          const reason = `Step ${step.stepNumber} mistake "${mistake.stateToken}": Optional sourceQuote not found in source manual.`;
          errors.push(reason);
          blockingReasons.push(reason);
        }
      }
    }

    // 2. Structural & Anti-Hallucination Contract Check
    let structuralValid = true;
    if (!step.expectedState.trim()) {
      structuralValid = false;
      errors.push(`Step ${step.stepNumber}: expectedState is empty.`);
    }
    if (!step.roiLabel.trim()) {
      structuralValid = false;
      errors.push(`Step ${step.stepNumber}: roiLabel is empty.`);
    }
    if (step.unlistedAnomalyToken !== UNLISTED_ANOMALY_TOKEN) {
      structuralValid = false;
      errors.push(
        `Step ${step.stepNumber}: unlistedAnomalyToken must equal "${UNLISTED_ANOMALY_TOKEN}".`
      );
    }
    if (step.verificationMode === 'VISION_ROI') {
      if (step.knownMistakeStates.length < 1 || step.knownMistakeStates.length > 3) {
        structuralValid = false;
        errors.push(
          `Step ${step.stepNumber}: VISION_ROI step must define 1 to 3 knownMistakeStates.`
        );
      }
    }
    if (step.knownMistakeStates.includes(step.expectedState)) {
      structuralValid = false;
      errors.push(
        `Step ${step.stepNumber}: expectedState "${step.expectedState}" cannot also be in knownMistakeStates.`
      );
    }
    const uniqueMistakeTokens = new Set(step.knownMistakeStates);
    if (uniqueMistakeTokens.size !== step.knownMistakeStates.length) {
      structuralValid = false;
      errors.push(`Step ${step.stepNumber}: duplicate tokens found in knownMistakeStates.`);
    }
    for (const token of step.knownMistakeStates) {
      const hasCondition = step.mistakeConditions.some((c) => c.stateToken === token);
      if (!hasCondition) {
        structuralValid = false;
        errors.push(
          `Step ${step.stepNumber}: missing MistakeCondition metadata for token "${token}".`
        );
      }
    }
    if (step.syntheticTests.length < 2) {
      structuralValid = false;
      errors.push(
        `Step ${step.stepNumber}: must include at least 2 synthetic tests (expected + failure/escalation).`
      );
    }

    if (!structuralValid) {
      for (const err of errors) {
        if (!blockingReasons.includes(err)) {
          blockingReasons.push(err);
        }
      }
    }

    // 3. Deterministic Synthetic Test Evaluation
    const testResults: SyntheticTestEvaluation[] = [];
    for (const test of step.syntheticTests) {
      totalTests += 1;
      const evaluated = evaluateStepVerdict(step, test.simulatedObservation);
      let passed = evaluated.verdict === test.expectedVerdict;
      let reason = `Observed "${test.simulatedObservation}" -> ${evaluated.verdict}`;

      if (passed && test.expectedMatchedMistakeToken) {
        const matchedToken = evaluated.matchedMistake?.stateToken;
        if (matchedToken !== test.expectedMatchedMistakeToken) {
          passed = false;
          reason = `Expected matched mistake "${test.expectedMatchedMistakeToken}" but got "${matchedToken ?? 'NONE'}".`;
        }
      } else if (!passed) {
        reason = `Expected verdict ${test.expectedVerdict} for "${test.simulatedObservation}", got ${evaluated.verdict}.`;
      }

      if (passed) {
        testsPassed += 1;
      } else {
        if (test.isCritical) {
          criticalFailures += 1;
        }
        const failMsg = `Step ${step.stepNumber} test "${test.id}": ${reason}`;
        errors.push(failMsg);
        blockingReasons.push(failMsg);
      }

      testResults.push({
        testId: test.id,
        description: test.description,
        passed,
        isCritical: test.isCritical,
        expectedVerdict: test.expectedVerdict,
        actualVerdict: evaluated.verdict,
        reason
      });
    }

    const stepPassed =
      quoteCheck.verified &&
      structuralValid &&
      testResults.every((result) => result.passed);

    stepDetails.push({
      stepId: step.id,
      stepNumber: step.stepNumber,
      quoteVerified: quoteCheck.verified,
      normalizedQuote: quoteCheck.normalizedQuote,
      matchedOffset: quoteCheck.matchedOffset,
      structuralValid,
      testResults,
      stepPassed,
      errors
    });
  }

  const quoteVerificationRate =
    totalQuotesChecked > 0 ? quotesVerified / totalQuotesChecked : 0;
  const testPassRate = totalTests > 0 ? testsPassed / totalTests : 0;

  const isReady =
    blockingReasons.length === 0 &&
    cartridge.steps.length > 0 &&
    quotesVerified === totalQuotesChecked &&
    testsPassed === totalTests &&
    criticalFailures === 0;

  return {
    status: isReady ? 'READY' : 'BLOCKED_FAILED_CHECKS',
    checkedAt,
    totalQuotesChecked,
    quotesVerified,
    quoteVerificationRate,
    totalTests,
    testsPassed,
    testPassRate,
    criticalFailures,
    blockingReasons,
    stepDetails
  };
}

export function applyAuditToCartridge(cartridge: VisualCartridge): VisualCartridge {
  const validationReport = auditCompiledCartridge(cartridge);
  return {
    ...cartridge,
    status: validationReport.status,
    validationReport
  };
}

export function incrementMinorVersion(semver: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver.trim());
  if (!match) {
    return '1.1.0';
  }
  const major = Number(match[1]);
  const minor = Number(match[2]) + 1;
  return `${major}.${minor}.0`;
}
