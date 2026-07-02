import { useCallback, useState, type FormEvent } from 'react';
import { clearAdminKey, loadAdminKey, saveAdminKey } from '../lib/adminKey';

/** Component state + localStorage persistence for one admin key. */
export function useAdminKey(storageKey: string): {
  key: string | null;
  save: (value: string) => void;
  clear: () => void;
} {
  const [key, setKey] = useState<string | null>(() => loadAdminKey(storageKey));
  const save = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed === '') {
        return;
      }
      saveAdminKey(storageKey, trimmed);
      setKey(trimmed);
    },
    [storageKey]
  );
  const clear = useCallback(() => {
    clearAdminKey(storageKey);
    setKey(null);
  }, [storageKey]);
  return { key, save, clear };
}

export interface AdminKeyPromptProps {
  /** e.g. "flags admin key" — labels the input for the operator (and the tests). */
  label: string;
  keyValue: string | null;
  onSave: (key: string) => void;
  onClear: () => void;
}

/**
 * Inline admin-key capture: a small password form until a key is armed, then a
 * chip with a "change" action. The key is typed at runtime and never bundled.
 */
export function AdminKeyPrompt({
  label,
  keyValue,
  onSave,
  onClear,
}: Readonly<AdminKeyPromptProps>) {
  const [draft, setDraft] = useState('');
  if (keyValue !== null) {
    return (
      <span className="keychip">
        <span className="keychip-state">{label} armed</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClear}>
          change
        </button>
      </span>
    );
  }
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    onSave(draft);
    setDraft('');
  };
  return (
    <form className="keyform" onSubmit={submit}>
      <input
        className="input"
        type="password"
        value={draft}
        placeholder={label}
        aria-label={label}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button type="submit" className="btn btn-sm">
        arm
      </button>
    </form>
  );
}
