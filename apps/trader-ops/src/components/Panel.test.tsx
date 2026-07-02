import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Panel } from './Panel';

const BASE = {
  title: 'EXPOSURE / LIABILITY',
  source: 'betting :4002 /exposure',
  area: 'exposure' as const,
};

describe('Panel', () => {
  afterEach(cleanup);

  it('shows a LIVE status with the last-updated tick when the feed is healthy', () => {
    render(
      <Panel {...BASE} lastUpdatedAt="2026-07-03T12:00:00.000Z" error={null}>
        <p>rows</p>
      </Panel>
    );
    expect(screen.getByText(BASE.title)).toBeTruthy();
    expect(screen.getByText(BASE.source)).toBeTruthy();
    expect(screen.getByText(/^LIVE \d{2}:\d{2}:\d{2}$/)).toBeTruthy();
    expect(screen.getByText('rows')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows CONNECTING before the first poll lands', () => {
    render(
      <Panel {...BASE} lastUpdatedAt={null} error={null}>
        <p>skeleton</p>
      </Panel>
    );
    expect(screen.getByText('CONNECTING')).toBeTruthy();
  });

  it('goes OFFLINE with an alert and notes stale data when some was fetched', () => {
    render(
      <Panel {...BASE} lastUpdatedAt="2026-07-03T12:00:00.000Z" error="HTTP 503">
        <p>stale rows</p>
      </Panel>
    );
    expect(screen.getByText('OFFLINE')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('HTTP 503');
    expect(screen.getByRole('alert').textContent).toContain('showing last good data');
  });

  it('omits the stale-data note when nothing was ever fetched', () => {
    render(
      <Panel {...BASE} lastUpdatedAt={null} error="service unreachable">
        <p>empty</p>
      </Panel>
    );
    expect(screen.getByRole('alert').textContent).not.toContain('showing last good data');
  });

  it('renders header actions', () => {
    render(
      <Panel {...BASE} lastUpdatedAt={null} error={null} actions={<button>arm</button>}>
        <p>body</p>
      </Panel>
    );
    expect(screen.getByRole('button', { name: 'arm' })).toBeTruthy();
  });
});
