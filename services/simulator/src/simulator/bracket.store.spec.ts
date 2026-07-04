import { describe, expect, it, vi } from 'vitest';
import { initialSimState } from './engine';
import { PrismaBracketStore } from './bracket.store';
import type { PrismaService } from '../prisma/prisma.service';

function fakePrisma(overrides: Record<string, unknown>): PrismaService {
  return { simBracket: overrides } as unknown as PrismaService;
}

describe('PrismaBracketStore', () => {
  const state = initialSimState();

  it('load returns null when no row is stored', async () => {
    const store = new PrismaBracketStore(
      fakePrisma({ findUnique: vi.fn().mockResolvedValue(null) })
    );
    expect(await store.load()).toBeNull();
  });

  it('load returns the parsed bracket when a valid row exists', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 1, state });
    const store = new PrismaBracketStore(fakePrisma({ findUnique }));
    const loaded = await store.load();
    expect(loaded?.playedFixtureIds).toEqual(state.playedFixtureIds);
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('load degrades to null when the stored blob fails the schema', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 1, state: { garbage: true } });
    const store = new PrismaBracketStore(fakePrisma({ findUnique }));
    expect(await store.load()).toBeNull();
  });

  it('save upserts the single bracket row', async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const store = new PrismaBracketStore(fakePrisma({ upsert }));
    await store.save(state);
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0] as {
      where: { id: number };
      create: unknown;
      update: unknown;
    };
    expect(arg.where).toEqual({ id: 1 });
    expect(arg.create).toBeDefined();
    expect(arg.update).toBeDefined();
  });
});
