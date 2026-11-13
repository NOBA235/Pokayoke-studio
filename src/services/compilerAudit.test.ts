import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTER_CARTRIDGE } from '../fixtures/defaultRouterCartridge';
import {
  applyAuditToCartridge,
  auditCompiledCartridge,
  evaluateStepVerdict,
  incrementMinorVersion,
  verifyVerbatimQuote
} from './compilerAudit';

describe('compilerAudit & DEFAULT_ROUTER_CARTRIDGE', () => {
  it('verifies DEFAULT_ROUTER_CARTRIDGE with 100% quote and test pass rates', () => {
    const report = auditCompiledCartridge(DEFAULT_ROUTER_CARTRIDGE);

    expect(report.status).toBe('READY');
    expect(report.quoteVerificationRate).toBe(1);
    expect(report.testPassRate).toBe(1);
    expect(report.criticalFailures).toBe(0);
    expect(report.blockingReasons).toEqual([]);
    expect(report.totalQuotesChecked).toBe(8);
    expect(report.quotesVerified).toBe(8);
    expect(report.totalTests).toBe(13);
    expect(report.testsPassed).toBe(13);
    expect(DEFAULT_ROUTER_CARTRIDGE.status).toBe('READY');
  });

  it('normalizes curly quotes, dashes, and line wraps when checking verbatim quotes', () => {
    const manual = 'Section 1:\nAttach the “DANGER: LOCKOUT” tag — never leave ON (I).';
    const quote = 'Attach the "DANGER: LOCKOUT" tag - never leave ON (I).';
    const result = verifyVerbatimQuote(manual, quote);

    expect(result.verified).toBe(true);
    expect(result.matchedOffset).toBeGreaterThan(-1);
  });

  it('blocks a cartridge when a verbatim quote is hallucinated', () => {
    const tampered = {
      ...DEFAULT_ROUTER_CARTRIDGE,
      steps: DEFAULT_ROUTER_CARTRIDGE.steps.map((step, idx) =>
        idx === 0
          ? {
              ...step,
              source: {
                ...step.source,
                verbatimQuote: 'This fabricated sentence does not appear in the manual.'
              }
            }
          : step
      )
    };

    const audited = applyAuditToCartridge(tampered);
    expect(audited.status).toBe('BLOCKED_FAILED_CHECKS');
    expect(audited.validationReport.quoteVerificationRate).toBeLessThan(1);
    expect(audited.validationReport.blockingReasons.length).toBeGreaterThan(0);
  });

  it('evaluates PASS, MISTAKE_LOCK, and ESCALATE deterministically', () => {
    const step1 = DEFAULT_ROUTER_CARTRIDGE.steps[0];

    expect(evaluateStepVerdict(step1, 'BREAKER_OFF_WITH_LOCKOUT_TAG').verdict).toBe('PASS');

    const mistakeEval = evaluateStepVerdict(step1, 'BREAKER_ON_ENERGIZED');
    expect(mistakeEval.verdict).toBe('MISTAKE_LOCK');
    expect(mistakeEval.matchedMistake?.severity).toBe('CRITICAL');

    expect(evaluateStepVerdict(step1, 'OUT_OF_SCOPE_OR_OBSTRUCTED').verdict).toBe('ESCALATE');
    expect(evaluateStepVerdict(step1, 'RANDOM_UNLISTED_STATE').verdict).toBe('ESCALATE');
  });

  it('increments minor semantic versions cleanly', () => {
    expect(incrementMinorVersion('1.0.0')).toBe('1.1.0');
    expect(incrementMinorVersion('1.1.0')).toBe('1.2.0');
  });
});
