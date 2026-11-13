import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTER_CARTRIDGE } from '../fixtures/defaultRouterCartridge';
import { UNLISTED_ANOMALY_TOKEN } from '../types/cartridge';
import {
  createFifoMutexQueue,
  parseEnumTokenFromResponse,
  probeLocalNanoHardware
} from './hybridAiService';
import { exportCartridgeJson } from './storageService';

describe('hybridAiService concurrency & parsing', () => {
  it('enforces Concurrency-1 FIFO execution and recovers after errors', async () => {
    const queue = createFifoMutexQueue();
    let activeCount = 0;
    let maxObservedConcurrency = 0;
    const executionOrder: string[] = [];

    const makeTask = (id: string, delayMs: number, shouldFail = false) =>
      queue.enqueue(async () => {
        activeCount += 1;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, activeCount);
        executionOrder.push(`start:${id}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        executionOrder.push(`end:${id}`);
        activeCount -= 1;
        if (shouldFail) {
          throw new Error(`boom:${id}`);
        }
        return id;
      });

    const p1 = makeTask('t1', 15);
    const p2 = makeTask('t2', 5, true);
    const p3 = makeTask('t3', 5);

    expect(queue.getPendingCount()).toBe(3);

    const results = await Promise.allSettled([p1, p2, p3]);

    expect(maxObservedConcurrency).toBe(1);
    expect(executionOrder).toEqual([
      'start:t1',
      'end:t1',
      'start:t2',
      'end:t2',
      'start:t3',
      'end:t3'
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(results[2].status).toBe('fulfilled');
    expect(queue.getPendingCount()).toBe(0);
  });

  it('parses raw, JSON-quoted, and object-wrapped enum tokens cleanly', () => {
    const allowed = [
      'BREAKER_OFF_WITH_LOCKOUT_TAG',
      'BREAKER_ON_ENERGIZED',
      UNLISTED_ANOMALY_TOKEN
    ];

    expect(parseEnumTokenFromResponse('BREAKER_OFF_WITH_LOCKOUT_TAG', allowed)).toBe(
      'BREAKER_OFF_WITH_LOCKOUT_TAG'
    );
    expect(parseEnumTokenFromResponse('"BREAKER_ON_ENERGIZED"', allowed)).toBe(
      'BREAKER_ON_ENERGIZED'
    );
    expect(
      parseEnumTokenFromResponse('{"observedState":"BREAKER_OFF_WITH_LOCKOUT_TAG"}', allowed)
    ).toBe('BREAKER_OFF_WITH_LOCKOUT_TAG');
    expect(parseEnumTokenFromResponse('COMPLETELY_UNRELATED_TEXT', allowed)).toBe(
      UNLISTED_ANOMALY_TOKEN
    );
  });

  it('reports UNSUPPORTED in non-Chrome/Node environments without crashing', async () => {
    const availability = await probeLocalNanoHardware();
    expect(availability).toBe('UNSUPPORTED');
  });

  it('exports cartridge JSON with versioned schema envelope', () => {
    const json = exportCartridgeJson(DEFAULT_ROUTER_CARTRIDGE);
    const parsed = JSON.parse(json) as {
      schema: string;
      cartridge: { id: string; version: string };
    };

    expect(parsed.schema).toBe('pokayoke-studio/cartridge@1');
    expect(parsed.cartridge.id).toBe(DEFAULT_ROUTER_CARTRIDGE.id);
    expect(parsed.cartridge.version).toBe('1.0.0');
  });
});
