import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Step } from './step';

const safeKey = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/);
const locator = fc.record(
  { role: fc.string(), name: fc.string(), css: fc.string(), testId: fc.string() },
  { requiredKeys: [] },
);
const timing = fc.record({ gapMs: fc.nat({ max: 100_000 }), timingSensitive: fc.boolean() });

const variant = fc.oneof(
  fc.record({ kind: fc.constant('freshSession' as const) }),
  fc.record({ kind: fc.constant('goto' as const), path: fc.string() }),
  fc.record(
    {
      kind: fc.constant('click' as const),
      target: locator,
      count: fc.integer({ min: 1, max: 3 }),
      delayMs: fc.nat({ max: 5000 }),
    },
    { requiredKeys: ['kind', 'target'] },
  ),
  fc.record({ kind: fc.constant('type' as const), target: locator, text: fc.string() }),
  fc.record({ kind: fc.constant('press' as const), key: fc.constantFrom('Tab', 'Shift+Tab', 'Enter', 'Escape') }),
  fc.record({ kind: fc.constant('back' as const) }),
  fc.record({ kind: fc.constant('reload' as const) }),
  fc.record(
    {
      kind: fc.constant('request' as const),
      method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
      path: fc.string(),
      body: fc.jsonValue(),
      headers: fc.dictionary(safeKey, fc.string()),
    },
    { requiredKeys: ['kind', 'method', 'path'] },
  ),
  fc.record({
    kind: fc.constant('mcp' as const),
    tool: fc.string(),
    args: fc.dictionary(safeKey, fc.jsonValue()),
  }),
);

const stepArb = fc.tuple(variant, timing).map(([v, t]) => ({ ...v, ...t }));

describe('Step schema', () => {
  it('round-trips: parse(serialise(step)) equals the step', () => {
    fc.assert(
      fc.property(stepArb, (step) => {
        // Steps travel as JSON, so compare against the JSON-normalised value.
        const wire = JSON.parse(JSON.stringify(step)) as unknown;
        const parsed = Step.safeParse(wire);
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data).toEqual(wire);
      }),
    );
  });

  it('strips unknown keys', () => {
    fc.assert(
      fc.property(stepArb, fc.jsonValue(), (step, junk) => {
        const wire = JSON.parse(JSON.stringify({ ...step, zzExtra: junk })) as Record<string, unknown>;
        const parsed = Step.safeParse(wire);
        expect(parsed.success).toBe(true);
        if (parsed.success) expect('zzExtra' in parsed.data).toBe(false);
      }),
    );
  });

  it('defaults timingSensitive to false', () => {
    const parsed = Step.safeParse({ kind: 'back', gapMs: 5 });
    expect(parsed.success && parsed.data.timingSensitive).toBe(false);
  });

  it('rejects bad shapes', () => {
    expect(Step.safeParse({ kind: 'click', target: {}, count: 4, gapMs: 0 }).success).toBe(false);
    expect(Step.safeParse({ kind: 'click', target: {}, count: 0, gapMs: 0 }).success).toBe(false);
    expect(Step.safeParse({ kind: 'press', key: 'Space', gapMs: 0 }).success).toBe(false);
    expect(Step.safeParse({ kind: 'goto', path: '/', gapMs: -1 }).success).toBe(false);
    expect(Step.safeParse({ kind: 'nope', gapMs: 0 }).success).toBe(false);
    expect(Step.safeParse({ kind: 'back' }).success).toBe(false);
  });
});
