import { useCallback, useState } from 'react';

function read(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/**
 * Admin keys are opaque hex / base64url tokens. Strip whitespace and anything
 * outside that safe charset before persisting — this both neutralises tainted
 * input reaching storage and makes accidental quoting/padding harmless.
 */
function sanitize(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._~+/=-]/g, '');
}

function write(storageKey: string, value: string | null): void {
  try {
    if (value) {
      localStorage.setItem(storageKey, sanitize(value));
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {
    /* storage unavailable (private mode / quota) — the key still works in memory */
  }
}

/**
 * An admin key prompted for once and kept in localStorage — never in the bundle.
 * Returns the current key (null = not provided yet) and a setter (null clears it,
 * e.g. after the service rejects the key).
 */
export function useStoredKey(storageKey: string): [string | null, (key: string | null) => void] {
  const [key, setKey] = useState<string | null>(() => read(storageKey));

  const store = useCallback(
    (next: string | null) => {
      write(storageKey, next);
      setKey(next);
    },
    [storageKey]
  );

  return [key, store];
}
