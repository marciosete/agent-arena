import { useMemo, useState, type KeyboardEvent } from 'react';
import { teamById, type Fixture, type Market } from '@arena/contracts';
import { formatPrice } from '../format';
import { useFeature } from '../flags';
import { ROUND_LABEL } from '../rounds';
import { BracketTip, FixtureCard, OutrightCard } from './cards';
import {
  RING_RADIUS,
  VIEW_SIZE,
  decidedOnPenalties,
  edgePath,
  eliminatedTeamIds,
  layoutBracket,
  polarPoint,
  teamPathFixtureIds,
  type FixtureLayout,
  type Point,
  type SlotSide,
} from './geometry';
import { accentFor } from './teamAccents';

type Hover =
  | { type: 'team'; teamId: string; at: Point }
  | { type: 'fixture'; fixtureId: string; at: Point }
  | null;

type Selected = { type: 'fixture'; fixtureId: string } | { type: 'outright' } | null;

export interface BracketProps {
  fixtures: Fixture[];
  champion: string | null;
  markets: Market[] | null;
  outright: Market | null;
  /** fixture ids freshly decided since the previous poll — they ignite gold */
  ignited: ReadonlySet<string>;
}

/** Keyboard + pointer activation for SVG interactive shapes. */
function pressable(label: string, activate: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onClick: activate,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    },
  };
}

interface Focus {
  fixtures: ReadonlySet<string>;
  edges: ReadonlySet<string>;
}

const NO_FOCUS: Focus = { fixtures: new Set(), edges: new Set() };

/** Which fixtures + specific slot-edges light up for the current hover. */
function focusFor(hover: Hover, fixtures: Fixture[], byId: Map<string, FixtureLayout>): Focus {
  if (!hover) {
    return NO_FOCUS;
  }
  if (hover.type === 'fixture') {
    return {
      fixtures: new Set([hover.fixtureId]),
      edges: new Set([`${hover.fixtureId}:home`, `${hover.fixtureId}:away`]),
    };
  }
  const path = teamPathFixtureIds(fixtures, hover.teamId);
  const edges = new Set<string>();
  let previous: string | null = null;
  for (const fixtureId of path) {
    const layout = byId.get(fixtureId);
    if (!layout) {
      break;
    }
    const side = sideForTeamOnPath(layout, hover.teamId, previous);
    if (side) {
      edges.add(`${fixtureId}:${side}`);
    }
    previous = fixtureId;
  }
  return { fixtures: new Set(path), edges };
}

/** On the entry fixture the team's own slot; downstream, the slot its branch feeds. */
function sideForTeamOnPath(
  layout: FixtureLayout,
  teamId: string,
  cameFrom: string | null
): SlotSide | null {
  if (layout.home.teamId === teamId) {
    return 'home';
  }
  if (layout.away.teamId === teamId) {
    return 'away';
  }
  if (layout.home.fedBy === cameFrom && cameFrom) {
    return 'home';
  }
  if (layout.away.fedBy === cameFrom && cameFrom) {
    return 'away';
  }
  return null;
}

function edgeState(fixture: Fixture, side: SlotSide): 'lit' | 'dead' | 'idle' {
  if (fixture.status === 'finished' && fixture.winnerTeamId) {
    const slotTeam = side === 'home' ? fixture.homeTeamId : fixture.awayTeamId;
    return slotTeam === fixture.winnerTeamId ? 'lit' : 'dead';
  }
  return 'idle';
}

function classes(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

function teamTipLines(
  teamId: string,
  fixtures: Fixture[],
  marketByFixture: Map<string, Market>,
  outright: Market | null,
  eliminated: ReadonlySet<string>
): string[] {
  const team = teamById(teamId);
  const name = team?.name ?? teamId;
  if (eliminated.has(teamId)) {
    return [name, 'Eliminated'];
  }
  const current = teamPathFixtureIds(fixtures, teamId)
    .map((id) => fixtures.find((fixture) => fixture.id === id))
    .find(
      (fixture) =>
        fixture &&
        fixture.status !== 'finished' &&
        (fixture.homeTeamId === teamId || fixture.awayTeamId === teamId)
    );
  const market = current ? marketByFixture.get(current.id) : undefined;
  const price = market?.selections.find((selection) => selection.name === name)?.price;
  if (market?.status === 'open' && price) {
    return [name, `${formatPrice(price)} to win the tie`];
  }
  const title = outright?.selections.find((selection) => selection.name === name)?.price;
  if (outright?.status === 'open' && title) {
    return [name, `${formatPrice(title)} to lift the trophy`];
  }
  return [name];
}

function fixtureTipLines(fixture: Fixture, market: Market | undefined): string[] {
  const home = fixture.homeTeamId
    ? (teamById(fixture.homeTeamId)?.name ?? fixture.homeTeamId)
    : 'TBD';
  const away = fixture.awayTeamId
    ? (teamById(fixture.awayTeamId)?.name ?? fixture.awayTeamId)
    : 'TBD';
  const lines = [`${home} v ${away}`, ROUND_LABEL[fixture.round]];
  if (fixture.status === 'finished') {
    const pens = decidedOnPenalties(fixture) ? ' (pens)' : '';
    lines.push(`${fixture.homeScore ?? 0} – ${fixture.awayScore ?? 0}${pens}`);
  } else if (market?.status === 'open') {
    lines.push(market.selections.map((selection) => formatPrice(selection.price)).join(' / '));
  }
  return lines;
}

interface SlotNodeProps {
  layout: FixtureLayout;
  side: SlotSide;
  focus: Focus;
  hovered: boolean;
  eliminated: ReadonlySet<string>;
  ignited: boolean;
  onHoverTeam: (teamId: string, at: Point) => void;
  onHoverEnd: () => void;
  onOpen: (fixtureId: string) => void;
}

function SlotNode({
  layout,
  side,
  focus,
  hovered,
  eliminated,
  ignited,
  onHoverTeam,
  onHoverEnd,
  onOpen,
}: Readonly<SlotNodeProps>) {
  const { fixture } = layout;
  const slot = layout[side];
  const { point } = slot;

  if (!slot.teamId) {
    return (
      <circle
        className={classes('bracket-slot-dot', focus.fixtures.has(fixture.id) && 'is-focus')}
        cx={point.x}
        cy={point.y}
        r={7}
      />
    );
  }

  const team = teamById(slot.teamId);
  const isWinner = fixture.status === 'finished' && fixture.winnerTeamId === slot.teamId;
  const out = eliminated.has(slot.teamId);
  const label = team?.id ?? slot.teamId;
  const labelPoint = polarPoint(slot.angle, slot.radius + 36);

  return (
    <g
      className={classes(
        'bracket-node',
        isWinner && 'is-winner',
        isWinner && ignited && 'is-igniting',
        out && 'is-out',
        hovered && 'is-hover',
        focus.fixtures.has(fixture.id) && 'is-focus'
      )}
      onMouseEnter={() => onHoverTeam(slot.teamId as string, point)}
      onMouseLeave={onHoverEnd}
      {...pressable(`${team?.name ?? slot.teamId} — open ${fixture.id}`, () => onOpen(fixture.id))}
    >
      <circle
        className="bracket-node-ring"
        cx={point.x}
        cy={point.y}
        r={18}
        style={{ stroke: accentFor(slot.teamId) }}
      />
      <text className="bracket-node-flag" x={point.x} y={point.y + 6} textAnchor="middle">
        {team?.flag ?? '⚽'}
      </text>
      <text
        className="bracket-node-label"
        x={labelPoint.x}
        y={labelPoint.y + 4}
        textAnchor="middle"
      >
        {label}
      </text>
    </g>
  );
}

interface FixtureGroupProps {
  layout: FixtureLayout;
  focus: Focus;
  hover: Hover;
  eliminated: ReadonlySet<string>;
  ignited: ReadonlySet<string>;
  onHover: (hover: Hover) => void;
  onOpen: (fixtureId: string) => void;
}

function FixtureGroup({
  layout,
  focus,
  hover,
  eliminated,
  ignited,
  onHover,
  onOpen,
}: Readonly<FixtureGroupProps>) {
  const { fixture } = layout;
  const isIgnited = ignited.has(fixture.id);
  const anchor: Point = {
    x: (layout.home.point.x + layout.away.point.x) / 2,
    y: (layout.home.point.y + layout.away.point.y) / 2,
  };
  const hoverFixture = () => onHover({ type: 'fixture', fixtureId: fixture.id, at: anchor });

  const edge = (side: SlotSide) => {
    const slot = layout[side];
    const state = edgeState(fixture, side);
    return (
      <path
        key={side}
        className={classes(
          'bracket-edge',
          `edge-${state}`,
          state === 'lit' && isIgnited && 'edge-ignite',
          focus.edges.has(`${fixture.id}:${side}`) && 'edge-focus'
        )}
        d={edgePath(slot.angle, slot.radius, layout.midAngle, layout.winnerRadius)}
        onMouseEnter={hoverFixture}
        onMouseLeave={() => onHover(null)}
        {...pressable(`${fixture.id} match`, () => onOpen(fixture.id))}
      />
    );
  };

  return (
    <g className="bracket-fixture" data-fixture={fixture.id}>
      {edge('home')}
      {edge('away')}
      {(['home', 'away'] as const).map((side) => (
        <SlotNode
          key={side}
          layout={layout}
          side={side}
          focus={focus}
          hovered={hover?.type === 'team' && hover.teamId === layout[side].teamId}
          eliminated={eliminated}
          ignited={isIgnited}
          onHoverTeam={(teamId, at) => onHover({ type: 'team', teamId, at })}
          onHoverEnd={() => onHover(null)}
          onOpen={onOpen}
        />
      ))}
      {fixture.status === 'finished' ? (
        <text
          className="bracket-score"
          x={polarPoint(layout.midAngle, layout.home.radius).x}
          y={polarPoint(layout.midAngle, layout.home.radius).y + 4}
          textAnchor="middle"
          onMouseEnter={hoverFixture}
          onMouseLeave={() => onHover(null)}
        >
          {fixture.homeScore}–{fixture.awayScore}
          {decidedOnPenalties(fixture) ? ' ᵖ' : ''}
        </text>
      ) : null}
    </g>
  );
}

function Trophy({ champion, onOpen }: Readonly<{ champion: string | null; onOpen: () => void }>) {
  const team = champion ? teamById(champion) : undefined;
  return (
    <g className={classes('bracket-trophy', team && 'has-champion')}>
      <circle className="trophy-glow" cx={500} cy={500} r={115} fill="url(#trophy-gold)" />
      <g {...pressable('outright market', onOpen)}>
        <text className="trophy-emoji" x={500} y={523} textAnchor="middle">
          🏆
        </text>
      </g>
      {team ? (
        <g className="trophy-champion">
          <circle className="trophy-champion-halo" cx={560} cy={455} r={26} />
          <text className="trophy-champion-flag" x={560} y={464} textAnchor="middle">
            {team.flag}
          </text>
          <text className="trophy-champion-label" x={500} y={600} textAnchor="middle">
            {team.name.toUpperCase()} · CHAMPIONS
          </text>
        </g>
      ) : null}
    </g>
  );
}

/**
 * The Road to the Final: a full-bleed radial SVG laid out from live
 * `SimState.fixtures`, joined to prices by `Market.fixtureId`, hand-rolled —
 * no chart, layout, or animation library anywhere near it.
 */
export function Bracket({
  fixtures,
  champion,
  markets,
  outright,
  ignited,
}: Readonly<BracketProps>) {
  const slipOn = useFeature('punter-bet-slip');
  const marketsOn = useFeature('punter-markets');
  const [hover, setHover] = useState<Hover>(null);
  const [selected, setSelected] = useState<Selected>(null);

  const layout = useMemo(() => layoutBracket(fixtures), [fixtures]);
  const eliminated = useMemo(() => eliminatedTeamIds(fixtures), [fixtures]);
  const marketByFixture = useMemo(() => {
    const map = new Map<string, Market>();
    for (const market of markets ?? []) {
      if (market.fixtureId) {
        map.set(market.fixtureId, market);
      }
    }
    return map;
  }, [markets]);

  const focus = focusFor(hover, fixtures, layout.byId);
  const openFixture = (fixtureId: string) => setSelected({ type: 'fixture', fixtureId });
  const selectedLayout =
    selected?.type === 'fixture' ? layout.byId.get(selected.fixtureId) : undefined;

  const tip = hoverTip(hover, fixtures, marketByFixture, outright, eliminated);

  return (
    <div className={classes('bracket-wrap', hover && 'bracket-wrap--focus')}>
      <svg
        className="bracket"
        viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
        role="img"
        aria-label="Road to the Final bracket"
      >
        <defs>
          <radialGradient id="trophy-gold">
            <stop offset="0%" stopColor="#f6d97b" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#d4af37" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect
          className="bracket-backdrop"
          width={VIEW_SIZE}
          height={VIEW_SIZE}
          onClick={() => {
            setSelected(null);
            setHover(null);
          }}
        />
        {Object.values(RING_RADIUS).map((radius) => (
          <circle key={radius} className="bracket-ring" cx={500} cy={500} r={radius} />
        ))}
        {layout.fixtures.map((entry) => (
          <FixtureGroup
            key={entry.fixture.id}
            layout={entry}
            focus={focus}
            hover={hover}
            eliminated={eliminated}
            ignited={ignited}
            onHover={setHover}
            onOpen={openFixture}
          />
        ))}
        <Trophy
          champion={champion}
          onOpen={() => (marketsOn ? setSelected({ type: 'outright' }) : undefined)}
        />
      </svg>

      {tip ? <BracketTip at={tip.at} lines={tip.lines} /> : null}
      {selectedLayout ? (
        <FixtureCard
          layout={selectedLayout}
          market={marketByFixture.get(selectedLayout.fixture.id)}
          bettable={slipOn}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {selected?.type === 'outright' ? (
        <OutrightCard outright={outright} bettable={slipOn} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

function hoverTip(
  hover: Hover,
  fixtures: Fixture[],
  marketByFixture: Map<string, Market>,
  outright: Market | null,
  eliminated: ReadonlySet<string>
): { at: Point; lines: string[] } | null {
  if (!hover) {
    return null;
  }
  if (hover.type === 'team') {
    return {
      at: hover.at,
      lines: teamTipLines(hover.teamId, fixtures, marketByFixture, outright, eliminated),
    };
  }
  const fixture = fixtures.find((entry) => entry.id === hover.fixtureId);
  if (!fixture) {
    return null;
  }
  return { at: hover.at, lines: fixtureTipLines(fixture, marketByFixture.get(fixture.id)) };
}
