import { useCallback, useState } from "react";

/**
 * Tracks loading/error state around an async action, so components
 * share one pattern for the loading/error foundations the spec asks
 * for instead of each screen reinventing it.
 *
 * @example
 * const { isLoading, error, run } = useAsyncStatus();
 * const handleSubmit = () => run(() => saveProduct(data));
 */
export function useAsyncStatus() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (action) => {
    setIsLoading(true);
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { isLoading, error, run, setError };
}
