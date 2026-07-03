import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Panel } from './Panel';

describe('Panel', () => {
  afterEach(cleanup);

  it('renders the title and children', () => {
    render(
      <Panel title="Exposure / liability">
        <p>rows</p>
      </Panel>
    );
    expect(screen.getByRole('heading', { name: 'Exposure / liability' })).toBeTruthy();
    expect(screen.getByText('rows')).toBeTruthy();
    expect(screen.queryByText(/updated/)).toBeNull();
  });

  it('shows a loading indicator before the first successful poll', () => {
    render(
      <Panel title="T" meta={{ updatedAt: null, error: null }}>
        <p>…</p>
      </Panel>
    );
    expect(screen.getByText('loading…')).toBeTruthy();
  });

  it('shows the last-updated clock so traders trust the data', () => {
    render(
      <Panel title="T" meta={{ updatedAt: new Date(2026, 6, 3, 10, 32, 5).getTime(), error: null }}>
        <p>…</p>
      </Panel>
    );
    expect(screen.getByText('updated 10:32:05')).toBeTruthy();
  });

  it('surfaces poll errors in the header', () => {
    render(
      <Panel title="T" meta={{ updatedAt: 1, error: 'Service unreachable — retrying…' }}>
        <p>…</p>
      </Panel>
    );
    const badge = screen.getByText('Service unreachable — retrying…');
    expect(badge.className).toContain('is-error');
  });

  it('renders header actions', () => {
    render(
      <Panel title="T" actions={<button type="button">Change key</button>}>
        <p>…</p>
      </Panel>
    );
    expect(screen.getByRole('button', { name: 'Change key' })).toBeTruthy();
  });
});
