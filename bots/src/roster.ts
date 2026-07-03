import type { Personality } from './bot';
import { chaserStrategy, mugStrategy, sharpStrategy, steadyStrategy } from './strategies';

/** The card for tonight's meeting: four punters, four philosophies. */
export const ROSTER: Personality[] = [
  {
    name: 'Sharp',
    emoji: '📐',
    tagline: 'my Elo book never lies — value or nothing',
    strategy: sharpStrategy,
  },
  {
    name: 'Mug',
    emoji: '🎲',
    tagline: 'longshots pay for the party',
    strategy: mugStrategy,
  },
  {
    name: 'Steady',
    emoji: '🛡️',
    tagline: 'favourites, five percent, forever',
    strategy: steadyStrategy,
  },
  {
    name: 'Chaser',
    emoji: '🔥',
    tagline: 'the next one always comes home',
    strategy: chaserStrategy,
  },
];
