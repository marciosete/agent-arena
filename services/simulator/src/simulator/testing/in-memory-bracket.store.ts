import type { SimState } from '@arena/contracts';
import { BracketStore } from '../bracket.store';

/**
 * In-memory {@link BracketStore} for tests: no database. Records saves and lets
 * a spec preload a "persisted" bracket to exercise restore-on-boot.
 */
export class InMemoryBracketStore extends BracketStore {
  saveCount = 0;
  private stored: SimState | null;

  constructor(initial: SimState | null = null) {
    super();
    this.stored = initial;
  }

  load(): Promise<SimState | null> {
    return Promise.resolve(this.stored);
  }

  save(state: SimState): Promise<void> {
    this.saveCount += 1;
    // Structured-clone so later in-place mutations of the live state don't leak in.
    this.stored = JSON.parse(JSON.stringify(state)) as SimState;
    return Promise.resolve();
  }

  /** The most recently persisted bracket (null until the first save). */
  peek(): SimState | null {
    return this.stored;
  }
}
