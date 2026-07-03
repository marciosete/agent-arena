import { BracketScreen } from '../bracket/Bracket';
import { FLAGS, useFlagOn } from '../flags';

/**
 * Home is the bracket — the landing page and the signature screen. While
 * `punter-bracket` is dark, a minimal branded hero holds the stage; flipping
 * the flag reveals the full bracket in place (the show's first big reveal).
 */
export function HomePage() {
  const bracketOn = useFlagOn(FLAGS.bracket);
  if (!bracketOn) {
    return <Hero />;
  }
  return <BracketScreen />;
}

function Hero() {
  return (
    <main className="bracket-stage hero">
      <div className="hero-glow" aria-hidden="true">
        🏆
      </div>
      <h1 className="hero-title">Road to the Final</h1>
      <p className="stage-hint">The World Cup knockout stage</p>
    </main>
  );
}
