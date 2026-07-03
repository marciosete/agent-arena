import { useState, type SyntheticEvent } from 'react';

export interface AdminKeyPromptProps {
  /** What the key unlocks, e.g. "flag flips" or "finale controls". */
  label: string;
  /** Which env var the operator should read the key from, e.g. "FLAGS_ADMIN_KEY". */
  keyName: string;
  onSubmit: (key: string) => void;
}

/**
 * Inline one-time prompt for an admin key. The key is defence-in-depth on top of
 * the JWT — it is typed in by the operator, never shipped in the bundle.
 */
export function AdminKeyPrompt({ label, keyName, onSubmit }: Readonly<AdminKeyPromptProps>) {
  const [value, setValue] = useState('');

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) {
      onSubmit(trimmed);
      setValue('');
    }
  }

  return (
    <form className="keyform" onSubmit={handleSubmit}>
      <label className="keyform-label">
        Admin key required for {label} (<code>{keyName}</code>){' '}
        <input
          className="input"
          type="password"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="paste admin key"
          autoComplete="off"
        />
      </label>
      <button className="btn btn-primary btn-sm" type="submit" disabled={!value.trim()}>
        Unlock
      </button>
    </form>
  );
}
