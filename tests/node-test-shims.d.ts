declare module "node:test" {
  type TestFn = (name: string, fn: () => void | Promise<void>) => void;

  const test: TestFn;
  export default test;
}

declare module "node:assert/strict" {
  const assert: {
    deepEqual(actual: unknown, expected: unknown): void;
    equal(actual: unknown, expected: unknown): void;
    doesNotMatch(actual: string, expected: RegExp): void;
    match(actual: string, expected: RegExp): void;
    throws(block: () => unknown, error?: RegExp): void;
  };

  export default assert;
}
