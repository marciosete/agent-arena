/**
 * Admin keys are the second gate on control-plane writes (flag flips, finale
 * control). The operator types one in at runtime — it is never bundled — and
 * it sticks in localStorage so a mid-show refresh doesn't re-prompt.
 */
export const FLAGS_ADMIN_KEY_STORAGE = 'trader.adminKey.flags';
export const SIMULATOR_ADMIN_KEY_STORAGE = 'trader.adminKey.simulator';

export function loadAdminKey(storageKey: string): string | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value && value.trim() !== '' ? value : null;
  } catch {
    return null;
  }
}

export function saveAdminKey(storageKey: string, value: string): void {
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    /* storage unavailable (private mode/quota) — the key still lives in component state */
  }
}

export function clearAdminKey(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* nothing to clear if storage is unavailable */
  }
}
