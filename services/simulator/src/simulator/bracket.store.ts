import { Injectable } from '@nestjs/common';
import { SimStateSchema, type SimState } from '@arena/contracts';
import { PrismaService } from '../prisma/prisma.service';

/** The single bracket row's id — the simulation is one authoritative bracket. */
const BRACKET_ID = 1;

/**
 * Persistence boundary for the live bracket. The simulator keeps an in-memory
 * copy for fast reads, but writes through here on every mutation so the bracket
 * survives restarts/cold-starts and is centralised alongside pricing + betting.
 */
export abstract class BracketStore {
  /** The persisted bracket, or null when nothing has been stored yet. */
  abstract load(): Promise<SimState | null>;
  /** Persist the current bracket (single row, upserted). */
  abstract save(state: SimState): Promise<void>;
}

@Injectable()
export class PrismaBracketStore extends BracketStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(): Promise<SimState | null> {
    const row = await this.prisma.simBracket.findUnique({ where: { id: BRACKET_ID } });
    if (!row) {
      return null;
    }
    // We wrote this blob, but parse it anyway: a schema change or bad row degrades
    // to "no persisted state" (reseed) rather than crashing the service.
    const parsed = SimStateSchema.safeParse(row.state);
    return parsed.success ? parsed.data : null;
  }

  async save(state: SimState): Promise<void> {
    const blob = SimStateSchema.parse(state) as unknown as object;
    await this.prisma.simBracket.upsert({
      where: { id: BRACKET_ID },
      create: { id: BRACKET_ID, state: blob },
      update: { state: blob },
    });
  }
}
