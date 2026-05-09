/**
 * Wrapper around fetch that applies a request timeout via AbortController.
 * Defaults to 15 seconds; pass a shorter value for startup reads or a
 * higher one for large uploads.
 *
 * If the caller already passes an AbortSignal (e.g. for cleanup on unmount)
 * both the caller's signal and the timeout are honoured — whichever fires
 * first will abort the request.
 */
export function apiFetch(url: string, options?: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Honour an existing caller signal alongside our own timeout signal.
  const callerSignal = options?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}
