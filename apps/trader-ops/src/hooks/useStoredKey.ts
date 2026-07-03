import { useCallback, useState } from 'react';

function read(storageKey: string): string | null {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function write(storageKey: string, value: string | null): void {
  try {
    if (value) {
      localStorage.setItem(storageKey, value);
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
  const [key, setKeyState] = useState<string | null>(() => read(storageKey));

  const setKey = useCallback(
    (next: string | null) => {
      write(storageKey, next);
      setKeyState(next);
    },
    [storageKey]
  );

  return [key, setKey];
}
