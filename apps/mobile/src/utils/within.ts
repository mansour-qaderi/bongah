/** Resolves with `fallback` if `promise` has not settled after `ms`; the timer never outlives the promise. */
export function within<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>(resolve => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
