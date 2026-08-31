/**
 * Matchers minimos no estilo do Jest, sobre node:assert.
 *
 * O projeto nao usa framework de teste porque toda opcao popular hoje carrega um
 * binario nativo (rolldown/esbuild), e o Windows deste ambiente bloqueia binarios
 * nao assinados. O runner nativo do Node 24 (`node --test`) cobre o que
 * precisamos; so faltavam os matchers numericos.
 */

import assert from 'node:assert/strict';

export interface Matchers<T> {
  toBe(expected: T): void;
  toEqual(expected: unknown): void;
  toBeCloseTo(expected: number, digits?: number): void;
  toBeGreaterThan(expected: number): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeLessThan(expected: number): void;
  toBeLessThanOrEqual(expected: number): void;
  toContain(expected: unknown): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  readonly not: Omit<Matchers<T>, 'not'>;
}

function asNumber(v: unknown, label: string): number {
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new assert.AssertionError({
      message: `${label}: esperava um numero, recebeu ${String(v)}`,
    });
  }
  return v;
}

function contains(haystack: unknown, needle: unknown): boolean {
  if (typeof haystack === 'string') return haystack.includes(String(needle));
  if (Array.isArray(haystack)) return haystack.includes(needle);
  throw new assert.AssertionError({ message: 'toContain: esperava string ou array' });
}

function build<T>(actual: T, negated: boolean): Matchers<T> {
  const check = (ok: boolean, message: string) => {
    if (negated ? ok : !ok) {
      throw new assert.AssertionError({
        message: negated ? `NAO deveria: ${message}` : message,
        actual,
      });
    }
  };

  const m: Matchers<T> = {
    toBe(expected) {
      check(Object.is(actual, expected), `esperava ${String(expected)}, recebeu ${String(actual)}`);
    },
    toEqual(expected) {
      let ok = true;
      try {
        assert.deepStrictEqual(actual, expected);
      } catch {
        ok = false;
      }
      check(ok, `deepEqual falhou: recebeu ${JSON.stringify(actual)}`);
    },
    toBeCloseTo(expected, digits = 2) {
      const a = asNumber(actual, 'toBeCloseTo');
      const tolerance = Math.pow(10, -digits) / 2;
      const diff = Math.abs(a - expected);
      check(
        diff < tolerance,
        `esperava ~${expected} (tolerancia ${tolerance.toPrecision(3)}), recebeu ${a} (diferenca ${diff.toPrecision(4)})`,
      );
    },
    toBeGreaterThan(expected) {
      const a = asNumber(actual, 'toBeGreaterThan');
      check(a > expected, `esperava > ${expected}, recebeu ${a}`);
    },
    toBeGreaterThanOrEqual(expected) {
      const a = asNumber(actual, 'toBeGreaterThanOrEqual');
      check(a >= expected, `esperava >= ${expected}, recebeu ${a}`);
    },
    toBeLessThan(expected) {
      const a = asNumber(actual, 'toBeLessThan');
      check(a < expected, `esperava < ${expected}, recebeu ${a}`);
    },
    toBeLessThanOrEqual(expected) {
      const a = asNumber(actual, 'toBeLessThanOrEqual');
      check(a <= expected, `esperava <= ${expected}, recebeu ${a}`);
    },
    toContain(expected) {
      check(contains(actual, expected), `esperava conter ${String(expected)} em ${JSON.stringify(actual)}`);
    },
    toBeTruthy() {
      check(Boolean(actual), `esperava valor truthy, recebeu ${String(actual)}`);
    },
    toBeFalsy() {
      check(!actual, `esperava valor falsy, recebeu ${String(actual)}`);
    },
    get not() {
      return build(actual, !negated);
    },
  };
  return m;
}

export function expect<T>(actual: T): Matchers<T> {
  return build(actual, false);
}
