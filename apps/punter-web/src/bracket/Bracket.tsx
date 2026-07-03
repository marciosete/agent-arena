import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import type { Fixture, Market, Round } from '@arena/contracts';
import { useApi } from '@arena/web-auth';
import { getMarkets, getOutright, getSimState } from '../api';
import { POLL_MS } from '../config';
import { FLAGS, useFlagOn } from '../flags';
import {
  formatKickoff,
  formatPrice,
  ROUND_LABEL,
  teamFlag,
  teamName,
  teamShortName,
} from '../format';
import { usePoll } from '../hooks';
import { isBettable, marketsByFixture, selectionForTeam } from '../join';
import { withPrologue } from '../prologue';
import { toSlipSelection, useSlip, type SlipSelection } from '../slip';
import { teamColor } from './colors';
import {
  CENTER,
  elbowEdge,
  entryHopPath,
  layoutBracket,
  polarToPoint,
  RING_RADIUS,
  teamPathEdges,
  toPercent,
  VIEW_BOX,
  VIEW_MARGIN,
  VIEW_SIZE,
  wasDecidedOnPenalties,
  type BracketLayout,
  type FixtureLayout,
  type Point,
  type Slot,
  type SlotLayout,
} from './geometry';
import './bracket.css';

/** Stagger entrance/ignition inward, ring by ring. */
const RING_DELAY: Record<Round, string> = {
  R32: '0s',
  R16: '0.12s',
  QF: '0.24s',
  SF: '0.36s',
  F: '0.48s',
};

type Hover =
  | { kind: 'team'; fixtureId: string; slot: Slot; teamId: string }
  | { kind: 'fixture'; fixtureId: string }
  | null;

type Selected = { kind: 'fixture'; fixtureId: string } | { kind: 'outright' } | null;

/** SVG shapes aren't buttons — give the clickable ones keyboard activation. */
function pressable(action: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onKeyDown: (event: KeyboardEvent<SVGElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        action();
      }
    },
  };
}

/** Polls the simulator + pricing and renders the bracket; degrades to a quiet skeleton. */
export function BracketScreen() {
  const apiFetch = useApi();
  const marketsOn = useFlagOn(FLAGS.markets);
  const slipOn = useFlagOn(FLAGS.betSlip);
  const confettiOn = useFlagOn(FLAGS.confetti);
  const { openWith } = useSlip();
  const sim = usePoll(
    useCallback(() => getSimState(apiFetch), [apiFetch]),
    POLL_MS.state
  );
  const marketList = usePoll(
    useCallback(() => getMarkets(apiFetch), [apiFetch]),
    POLL_MS.markets
  );
  const outright = usePoll(
    useCallback(() => getOutright(apiFetch), [apiFetch]),
    POLL_MS.markets
  );
  const markets = useMemo(() => marketsByFixture(marketList), [marketList]);

  if (!sim) {
    return (
      <main className="bracket-stage" aria-busy="true">
        <div className="hero-glow" aria-hidden="true">
          🏆
        </div>
        <p className="stage-hint">Connecting to the arena…</p>
      </main>
    );
  }
  return (
    <main className="bracket-stage">
      <BracketView
        fixtures={sim.fixtures}
        champion={sim.champion}
        markets={markets}
        outright={outright}
        marketsOn={marketsOn}
        slipOn={slipOn}
        confettiOn={confettiOn}
        onPick={openWith}
      />
    </main>
  );
}

export interface BracketViewProps {
  fixtures: Fixture[];
  champion: string | null;
  markets: Map<string, Market>;
  outright: Market | null;
  marketsOn: boolean;
  slipOn: boolean;
  confettiOn: boolean;
  onPick: (selection: SlipSelection) => void;
}

export function BracketView(props: Readonly<BracketViewProps>) {
  const { fixtures, champion, markets, outright, marketsOn, slipOn, confettiOn, onPick } = props;
  // The full rim: live fixtures plus the display-only R32 prologue (who the
  // pre-placed R16 teams beat — Brazil past Japan, France past Sweden…).
  const layout = useMemo(() => layoutBracket(withPrologue(fixtures)), [fixtures]);
  const [hover, setHover] = useState<Hover>(null);
  const [selected, setSelected] = useState<Selected>(null);

  // A result landing can replace the hovered element (dot → team node) without a
  // mouseleave; drop the highlight rather than pinning a stale tooltip.
  useEffect(() => {
    setHover(null);
  }, [layout]);

  const emphasis = useMemo(() => {
    if (!hover) {
      return null;
    }
    if (hover.kind === 'team') {
      return teamPathEdges(layout, hover.fixtureId, hover.slot);
    }
    const fl = layout.byId.get(hover.fixtureId);
    return new Set(fl ? [fl.home.key, fl.away.key] : []);
  }, [hover, layout]);

  const pick = useCallback(
    (selection: SlipSelection) => {
      setSelected(null);
      onPick(selection);
    },
    [onPick]
  );

  const selectedFixture =
    selected?.kind === 'fixture' ? (layout.byId.get(selected.fixtureId) ?? null) : null;

  return (
    <div className="bracket-wrap">
      <svg className="bracket" viewBox={VIEW_BOX} role="img" aria-label="Road to the Final bracket">
        <defs>
          <radialGradient id="gold-glow">
            <stop offset="0%" stopColor="#ffe9a3" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#d4af37" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#d4af37" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect
          className="bracket-backdrop"
          x={-VIEW_MARGIN}
          y={-VIEW_MARGIN}
          width={VIEW_SIZE + 2 * VIEW_MARGIN}
          height={VIEW_SIZE + 2 * VIEW_MARGIN}
          onClick={() => setSelected(null)}
        />
        <Rings />
        {layout.fixtures.map((fl) => (
          <FixtureGroup
            key={fl.fixture.id}
            fl={fl}
            emphasis={emphasis}
            onHover={setHover}
            onSelect={(fixtureId) => setSelected({ kind: 'fixture', fixtureId })}
          />
        ))}
        <Trophy
          champion={champion}
          clickable={marketsOn}
          onOpen={() => setSelected({ kind: 'outright' })}
        />
      </svg>

      {hover && !selected ? (
        <HoverTip hover={hover} layout={layout} markets={markets} outright={outright} />
      ) : null}
      {selectedFixture ? (
        <FixtureCard
          fl={selectedFixture}
          market={markets.get(selectedFixture.fixture.id)}
          slipOn={slipOn}
          onPick={pick}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {selected?.kind === 'outright' ? (
        <OutrightCard
          outright={outright}
          slipOn={slipOn}
          onPick={pick}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {champion && confettiOn ? <Confetti /> : null}
    </div>
  );
}

/** The key art draws no guide circles — the paths imply the rounds; keep only whisper-quiet labels. */
function Rings() {
  return (
    <g className="rings" aria-hidden="true">
      {(Object.entries(RING_RADIUS) as [Round, number][]).map(([round, radius]) => (
        <text key={round} className="ring-label" x={CENTER} y={CENTER - radius - 10}>
          {ROUND_LABEL[round].toUpperCase()}
        </text>
      ))}
    </g>
  );
}

type EdgeOutcome = 'won' | 'lost' | 'open';

function edgeOutcome(fixture: Fixture, slot: Slot): EdgeOutcome {
  if (fixture.status !== 'finished' || !fixture.winnerTeamId) {
    return 'open';
  }
  const teamId = slot === 'home' ? fixture.homeTeamId : fixture.awayTeamId;
  return teamId === fixture.winnerTeamId ? 'won' : 'lost';
}

function emphasisClass(emphasis: ReadonlySet<string> | null, key: string): string {
  if (!emphasis) {
    return '';
  }
  return emphasis.has(key) ? ' is-lit' : ' is-faded';
}

interface FixtureGroupProps {
  fl: FixtureLayout;
  emphasis: ReadonlySet<string> | null;
  onHover: (hover: Hover) => void;
  onSelect: (fixtureId: string) => void;
}

function FixtureGroup({ fl, emphasis, onHover, onSelect }: Readonly<FixtureGroupProps>) {
  const { fixture } = fl;
  const style = { '--ring-delay': RING_DELAY[fixture.round] } as CSSProperties;
  const hoverFixture = (): void => onHover({ kind: 'fixture', fixtureId: fixture.id });
  const clearHover = (): void => onHover(null);
  const select = (): void => onSelect(fixture.id);

  return (
    <g className="fixture" style={style}>
      {([fl.home, fl.away] as const).map((slot) => {
        const outcome = edgeOutcome(fixture, slot.slot);
        return (
          <Edge
            key={slot.key}
            slot={slot}
            winnerAngle={fl.winnerAngle}
            winnerRadius={fl.winnerRadius}
            outcome={outcome}
            winnerColor={outcome === 'won' ? teamColor(fixture.winnerTeamId) : null}
            className={emphasisClass(emphasis, slot.key)}
            onHover={hoverFixture}
            onLeave={clearHover}
            onClick={select}
          />
        );
      })}
      {fixture.status === 'finished' ? <ScoreChip fl={fl} /> : null}
      {([fl.home, fl.away] as const).map((slot) => (
        <SlotNodeView
          key={slot.key}
          slot={slot}
          fixture={fixture}
          className={emphasisClass(emphasis, slot.key)}
          onHover={onHover}
          onSelect={select}
        />
      ))}
    </g>
  );
}

interface EdgeProps {
  slot: SlotLayout;
  winnerAngle: number;
  winnerRadius: number;
  outcome: EdgeOutcome;
  /** The winner's team colour when this side won — the path lights in it. */
  winnerColor: string | null;
  className: string;
  onHover: () => void;
  onLeave: () => void;
  onClick: () => void;
}

function Edge(props: Readonly<EdgeProps>) {
  const { slot, winnerAngle, winnerRadius, outcome, winnerColor, className } = props;
  const { d, joint } = elbowEdge(slot, winnerAngle, winnerRadius);
  const style = winnerColor ? ({ '--team-color': winnerColor } as CSSProperties) : undefined;
  return (
    <g>
      <path className={`edge edge-${outcome}${className}`} d={d} style={style} />
      {joint ? (
        <circle
          className={`edge-joint joint-${outcome}${className}`}
          cx={joint.x}
          cy={joint.y}
          r={2.8}
          style={style}
        />
      ) : null}
      <path
        className="edge-hit"
        data-fixture={slot.fixtureId}
        d={d}
        onMouseEnter={props.onHover}
        onMouseLeave={props.onLeave}
        onClick={props.onClick}
      />
    </g>
  );
}

function ScoreChip({ fl }: Readonly<{ fl: FixtureLayout }>) {
  const { fixture } = fl;
  const pens = wasDecidedOnPenalties(fixture);
  return (
    <text className="score-chip" x={fl.labelPos.x} y={fl.labelPos.y}>
      {fixture.homeScore}–{fixture.awayScore}
      {pens ? ' ᴾ' : ''}
    </text>
  );
}

interface SlotNodeViewProps {
  slot: SlotLayout;
  fixture: Fixture;
  className: string;
  onHover: (hover: Hover) => void;
  onSelect: () => void;
}

/** A slot is a team node once occupied, or a small grey dot while undecided. */
function SlotNodeView({
  slot,
  fixture,
  className,
  onHover,
  onSelect,
}: Readonly<SlotNodeViewProps>) {
  if (!slot.teamId) {
    const hoverFixture = (): void => onHover({ kind: 'fixture', fixtureId: fixture.id });
    return (
      <circle
        className={`slot-dot${className}`}
        cx={slot.pos.x}
        cy={slot.pos.y}
        r={5}
        aria-label="Undecided slot"
        onMouseEnter={hoverFixture}
        onMouseLeave={() => onHover(null)}
        onFocus={hoverFixture}
        onBlur={() => onHover(null)}
        onClick={onSelect}
        {...pressable(onSelect)}
      />
    );
  }
  const eliminated =
    fixture.status === 'finished' &&
    fixture.winnerTeamId !== null &&
    fixture.winnerTeamId !== slot.teamId;
  const radius = slot.isEntry ? 17 : 14;
  const classes = [
    'node',
    slot.isEntry ? 'node-entry' : 'node-advanced',
    eliminated ? 'node-out' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const hoverTeam = (): void =>
    onHover({ kind: 'team', fixtureId: slot.fixtureId, slot: slot.slot, teamId: slot.teamId! });
  // A slot won into carries its team's colour, like its path (key art language).
  const colorStyle = { '--team-color': teamColor(slot.teamId) } as CSSProperties;
  const style = slot.isEntry ? undefined : colorStyle;
  // An entry team of an inner round is already through the previous round — the
  // seed pre-places the real R32 winners in R16. Show that level explicitly:
  // a decided hop from the rim plus an echo node on the fixture's ring.
  const hop = slot.isEntry ? entryHopPath(slot) : null;
  return (
    <>
      {hop ? (
        <g className={`node-echo${className}`} style={colorStyle} aria-hidden="true">
          <path className="edge edge-won entry-hop" d={hop} />
          <g className="node node-advanced">
            <circle className="node-face" cx={slot.anchor.x} cy={slot.anchor.y} r={12} />
            <text className="node-flag" x={slot.anchor.x} y={slot.anchor.y} fontSize={12}>
              {teamFlag(slot.teamId)}
            </text>
          </g>
        </g>
      ) : null}
      <g
        className={classes}
        style={style}
        data-team={slot.teamId}
        aria-label={teamName(slot.teamId)}
        onMouseEnter={hoverTeam}
        onMouseLeave={() => onHover(null)}
        onFocus={hoverTeam}
        onBlur={() => onHover(null)}
        onClick={onSelect}
        {...pressable(onSelect)}
      >
        <circle className="node-face" cx={slot.pos.x} cy={slot.pos.y} r={radius} />
        <text className="node-flag" x={slot.pos.x} y={slot.pos.y} fontSize={radius}>
          {teamFlag(slot.teamId)}
        </text>
        {slot.isEntry ? <RimLabel slot={slot} /> : null}
      </g>
    </>
  );
}

/**
 * Team name set tangentially along the rim, just outside the node, always right
 * side up. Alternate rim positions stagger outward so 32 neighbouring names
 * never overlap (the poster does the same with its two crest depths).
 */
function RimLabel({ slot }: Readonly<{ slot: SlotLayout }>) {
  const stagger = (slot.entryIndex ?? 0) % 2 === 1 ? 24 : 0;
  const pos = polarToPoint(slot.angle, distanceOf(slot) + 33 + stagger);
  const a = ((slot.angle % 360) + 360) % 360;
  const rotation = a > 0 && a < 180 ? a - 90 : a + 90;
  return (
    <text
      className="rim-label"
      x={pos.x}
      y={pos.y}
      transform={`rotate(${rotation} ${pos.x} ${pos.y})`}
    >
      {teamShortName(slot.teamId).toUpperCase()}
    </text>
  );
}

function distanceOf(slot: SlotLayout): number {
  return Math.hypot(slot.pos.x - CENTER, slot.pos.y - CENTER);
}

interface TrophyProps {
  champion: string | null;
  clickable: boolean;
  onOpen: () => void;
}

function Trophy({ champion, clickable, onOpen }: Readonly<TrophyProps>) {
  return (
    <g
      className={`trophy${clickable ? ' trophy-clickable' : ''}${champion ? ' trophy-crowned' : ''}`}
      onClick={clickable ? onOpen : undefined}
      aria-label="Tournament winner"
      {...(clickable ? pressable(onOpen) : {})}
    >
      <circle className="trophy-halo" cx={CENTER} cy={CENTER} r={120} fill="url(#gold-glow)" />
      <circle className="trophy-core" cx={CENTER} cy={CENTER} r={46} />
      <text className="trophy-cup" x={CENTER} y={CENTER + 2}>
        🏆
      </text>
      {champion ? (
        <g className="champion" data-team={champion}>
          <circle className="champion-ring" cx={CENTER + 62} cy={CENTER - 18} r={22} />
          <text className="champion-flag" x={CENTER + 62} y={CENTER - 16}>
            {teamFlag(champion)}
          </text>
          <text className="champion-name" x={CENTER} y={CENTER + 78}>
            {teamName(champion).toUpperCase()} · CHAMPIONS
          </text>
        </g>
      ) : null}
    </g>
  );
}

interface HoverTipProps {
  hover: NonNullable<Hover>;
  layout: BracketLayout;
  markets: Map<string, Market>;
  outright: Market | null;
}

function HoverTip({ hover, layout, markets, outright }: Readonly<HoverTipProps>) {
  const fl = layout.byId.get(hover.fixtureId);
  if (!fl) {
    return null;
  }
  const market = markets.get(fl.fixture.id);
  const anchor = hover.kind === 'team' ? fl[hover.slot].pos : fl.labelPos;
  const style: CSSProperties = {
    left: `${Math.min(88, Math.max(12, toPercent(anchor.x)))}%`,
    top: `${Math.min(92, Math.max(8, toPercent(anchor.y)))}%`,
  };
  return (
    <output className="bracket-tip" style={style}>
      {hover.kind === 'team' ? (
        <TeamTipText teamId={hover.teamId} market={market} outright={outright} />
      ) : (
        <FixtureTipText fixture={fl.fixture} market={market} />
      )}
    </output>
  );
}

function TeamTipText({
  teamId,
  market,
  outright,
}: Readonly<{ teamId: string; market: Market | undefined; outright: Market | null }>) {
  const inFixture = isBettable(market) ? selectionForTeam(market, teamId) : undefined;
  const inOutright = selectionForTeam(outright ?? undefined, teamId);
  let priceLine = '';
  if (inFixture) {
    priceLine = ` · ${formatPrice(inFixture.price)}`;
  } else if (inOutright) {
    priceLine = ` · title ${formatPrice(inOutright.price)}`;
  }
  return (
    <span>
      {teamFlag(teamId)} {teamName(teamId)}
      {priceLine}
    </span>
  );
}

function FixtureTipText({
  fixture,
  market,
}: Readonly<{ fixture: Fixture; market: Market | undefined }>) {
  const title = `${teamName(fixture.homeTeamId)} v ${teamName(fixture.awayTeamId)}`;
  let detail: string;
  if (fixture.status === 'finished') {
    detail = `FT ${fixture.homeScore}–${fixture.awayScore}${wasDecidedOnPenalties(fixture) ? ' (pens)' : ''}`;
  } else if (isBettable(market)) {
    detail = market.selections.map((s) => formatPrice(s.price)).join(' / ');
  } else {
    detail = ROUND_LABEL[fixture.round];
  }
  return (
    <span>
      {title} <em>{detail}</em>
    </span>
  );
}

function cardStyle(anchor: Point): CSSProperties {
  // Pull the card halfway toward the centre so it never leaves the stage.
  return {
    left: `${toPercent((anchor.x + CENTER) / 2)}%`,
    top: `${toPercent((anchor.y + CENTER) / 2)}%`,
  };
}

interface FixtureCardProps {
  fl: FixtureLayout;
  market: Market | undefined;
  slipOn: boolean;
  onPick: (selection: SlipSelection) => void;
  onClose: () => void;
}

/** The click-through detail card for one fixture, anchored near it. */
function FixtureCard({ fl, market, slipOn, onPick, onClose }: Readonly<FixtureCardProps>) {
  const { fixture } = fl;
  const bettable = isBettable(market) && slipOn;
  return (
    <dialog className="bracket-card" style={cardStyle(fl.labelPos)} aria-label="Fixture" open>
      <div className="card-head">
        <span className="card-round">{ROUND_LABEL[fixture.round]}</span>
        <button type="button" className="card-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      {([fl.home, fl.away] as const).map((slot) => (
        <TeamRow
          key={slot.key}
          teamId={slot.teamId}
          fixture={fixture}
          market={market}
          bettable={bettable}
          onPick={onPick}
        />
      ))}
      <p className="card-status">{fixtureStatusLine(fixture, market)}</p>
    </dialog>
  );
}

function fixtureStatusLine(fixture: Fixture, market: Market | undefined): string {
  if (fixture.status === 'finished') {
    return `Full time${wasDecidedOnPenalties(fixture) ? ' — decided on penalties' : ''}`;
  }
  if (fixture.status === 'in_play') {
    return 'In play';
  }
  const kickoff = formatKickoff(fixture.kickoff);
  if (!market) {
    return `${kickoff} · no market yet`;
  }
  return market.status === 'open' ? kickoff : `${kickoff} · ${market.status}`;
}

interface TeamRowProps {
  teamId: string | null;
  fixture: Fixture;
  market: Market | undefined;
  bettable: boolean;
  onPick: (selection: SlipSelection) => void;
}

function scoreFor(fixture: Fixture, teamId: string | null): number | null {
  if (fixture.status !== 'finished') {
    return null;
  }
  return teamId === fixture.homeTeamId ? fixture.homeScore : fixture.awayScore;
}

function TeamRow({ teamId, fixture, market, bettable, onPick }: Readonly<TeamRowProps>) {
  const selection = selectionForTeam(market, teamId);
  const isWinner = fixture.winnerTeamId !== null && fixture.winnerTeamId === teamId;
  const score = scoreFor(fixture, teamId);
  return (
    <div className={`card-team${isWinner ? ' card-winner' : ''}`}>
      <span className="card-team-name">
        {teamFlag(teamId)} {teamName(teamId)}
      </span>
      {score === null ? null : <span className="card-score">{score}</span>}
      {score === null && selection && bettable && market ? (
        <button
          type="button"
          className="price-btn"
          onClick={() => onPick(toSlipSelection(market, selection))}
        >
          {formatPrice(selection.price)}
        </button>
      ) : null}
      {score === null && selection && !bettable ? (
        <span className="price-flat">{formatPrice(selection.price)}</span>
      ) : null}
    </div>
  );
}

interface OutrightCardProps {
  outright: Market | null;
  slipOn: boolean;
  onPick: (selection: SlipSelection) => void;
  onClose: () => void;
}

/** The trophy's card: the tournament-winner (outright) market. */
function OutrightCard({ outright, slipOn, onPick, onClose }: Readonly<OutrightCardProps>) {
  const bettable = isBettable(outright ?? undefined) && slipOn;
  return (
    <dialog
      className="bracket-card outright-card"
      style={{ left: '50%', top: '50%' }}
      aria-label="Tournament winner market"
      open
    >
      <div className="card-head">
        <span className="card-round">{outright?.name ?? 'Tournament winner'}</span>
        <button type="button" className="card-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      {outright ? (
        <div className="outright-list">
          {[...outright.selections]
            .sort((a, b) => a.price - b.price)
            .map((selection) => (
              <div key={selection.id} className="card-team">
                <span className="card-team-name">{selection.name}</span>
                {bettable ? (
                  <button
                    type="button"
                    className="price-btn"
                    onClick={() => onPick(toSlipSelection(outright, selection))}
                  >
                    {formatPrice(selection.price)}
                  </button>
                ) : (
                  <span className="price-flat">{formatPrice(selection.price)}</span>
                )}
              </div>
            ))}
        </div>
      ) : (
        <p className="card-status">The title market isn’t priced yet.</p>
      )}
    </dialog>
  );
}

const CONFETTI_COLORS = ['#f3d97a', '#d4af37', '#ffffff', '#7ad0ff', '#ff7a9c', '#8affc1'];

/** CSS-only champion confetti (flag `punter-confetti`). */
function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 72 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 41) % 100}%`,
            animationDelay: `${(i % 16) * 0.14}s`,
            animationDuration: `${2.6 + (i % 7) * 0.4}s`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          }}
        />
      ))}
    </div>
  );
}
