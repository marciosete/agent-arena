import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { Market } from '@arena/contracts';
import { diffPrices, snapshotPrices, usePriceFlashes } from './prices';
import { marketFor } from './__tests__/harness';

afterEach(cleanup);

describe('snapshotPrices / diffPrices', () => {
  it('flags moved selections with their direction and ignores unseen ones', () => {
    const before = snapshotPrices([marketFor('R32-9', {}, [1.85, 2.1])]);
    const after = [marketFor('R32-9', {}, [2.0, 1.9])];
    const moves = diffPrices(before, after);
    expect(moves.get('sel-POR')).toBe('up');
    expect(moves.get('sel-CRO')).toBe('down');
    expect(diffPrices(new Map(), after).size).toBe(0);
    expect(diffPrices(before, [marketFor('R32-9', {}, [1.85, 2.1])]).size).toBe(0);
  });
});

function Probe({ markets }: Readonly<{ markets: Market[] | null }>) {
  const flashes = usePriceFlashes(markets);
  return <output>{JSON.stringify([...flashes.entries()])}</output>;
}

const probeText = (): string => document.querySelector('output')?.textContent ?? '';

describe('usePriceFlashes', () => {
  it('flashes a selection when its price changes between polls', () => {
    const { rerender } = render(<Probe markets={[marketFor('R32-9', {}, [1.85, 2.1])]} />);
    expect(probeText()).toBe('[]');

    rerender(<Probe markets={[marketFor('R32-9', {}, [1.95, 2.1])]} />);
    expect(probeText()).toContain('["sel-POR","up"]');

    // A failed poll (null) neither crashes nor clears the pending flash early.
    rerender(<Probe markets={null} />);
    expect(probeText()).toContain('sel-POR');
  });
});
