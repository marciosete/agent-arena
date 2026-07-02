import { useCallback, useEffect, useRef, useState } from 'react';
import { FIXTURES, type Fixture } from '@arena/contracts';
import { useAuth } from '@arena/web-auth';
import { fetchMarkets, fetchOutright, fetchSimState } from '../api';
import { Bracket } from '../bracket/Bracket';
import { POLL } from '../config';
import { useFeature } from '../flags';
import { usePoll } from '../hooks';

const CONFETTI_COLORS = ['#d4af37', '#f6d97b', '#f8fafc', '#e11d48', '#4169e1'];

/** CSS-only champion confetti — deterministic scatter, no animation library. */
function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 64 }, (_, index) => (
        <span
          key={index}
          className="confetti-piece"
          style={{
            left: `${(index * 61) % 100}%`,
            animationDelay: `${(index % 16) * 0.19}s`,
            animationDuration: `${2.6 + (index % 7) * 0.35}s`,
            background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
          }}
        />
      ))}
    </div>
  );
}

/** The minimal branded hero shown while `punter-bracket` is dark. */
function Hero() {
  return (
    <div className="hero">
      <div className="hero-glow" aria-hidden="true" />
      <span className="hero-trophy" aria-hidden="true">
        🏆
      </span>
      <h1 className="hero-title">Road to the Final</h1>
      <p className="hero-sub">The World Cup knockout stage.</p>
    </div>
  );
}

/**
 * Fixtures that flipped to finished since the previous poll — these ignite
 * gold. The first sample never ignites: history already played isn't news.
 */
function useIgnited(fixtures: Fixture[] | undefined): ReadonlySet<string> {
  const [ignited, setIgnited] = useState<ReadonlySet<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  // Removal timers live OUTSIDE the effect below: every poll re-runs it (each
  // /state response is a fresh array), and returning a cleanup from there
  // would cancel the 1.8s burn-down before it ever fired.
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) {
        clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    if (!fixtures) {
      return;
    }
    const finished = new Set(
      fixtures.filter((fixture) => fixture.status === 'finished').map((fixture) => fixture.id)
    );
    if (seen.current === null) {
      seen.current = finished;
      return;
    }
    const previous = seen.current;
    const fresh = [...finished].filter((id) => !previous.has(id));
    seen.current = finished;
    if (fresh.length === 0) {
      return;
    }
    setIgnited((current) => new Set([...current, ...fresh]));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setIgnited((current) => {
        const next = new Set(current);
        for (const id of fresh) {
          next.delete(id);
        }
        return next;
      });
    }, 1_800);
    timers.current.add(timer);
  }, [fixtures]);

  return ignited;
}

function BracketScreen() {
  const { apiFetch, session } = useAuth();
  const confettiOn = useFeature('punter-confetti');

  const loadState = useCallback(() => fetchSimState(apiFetch), [apiFetch]);
  const state = usePoll(loadState, POLL.state, session?.token);

  const loadMarkets = useCallback(async () => {
    const [markets, outright] = await Promise.all([
      fetchMarkets(apiFetch),
      fetchOutright(apiFetch),
    ]);
    if (markets === null && outright === null) {
      return null;
    }
    return { markets, outright };
  }, [apiFetch]);
  const marketData = usePoll(loadMarkets, POLL.markets, session?.token);

  // Until the simulator answers, the seed structure is the skeleton — the
  // constellation renders on day one; live scores take over the moment /state lands.
  const fixtures = state?.fixtures ?? FIXTURES;
  const ignited = useIgnited(state?.fixtures);
  const champion = state?.champion ?? null;

  return (
    <div className="bracket-stage">
      {state === null ? <p className="bracket-offline">Connecting to the live bracket…</p> : null}
      <Bracket
        fixtures={fixtures}
        champion={champion}
        markets={marketData?.markets ?? null}
        outright={marketData?.outright ?? null}
        ignited={ignited}
      />
      {champion && confettiOn ? <Confetti /> : null}
    </div>
  );
}

/** Home is the bracket — the signature screen, not a menu item. */
export function HomePage() {
  const bracketOn = useFeature('punter-bracket');
  return <main className="stage">{bracketOn ? <BracketScreen /> : <Hero />}</main>;
}
