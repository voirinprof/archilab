import type { Lang } from '../../types.ts';
import type { FloorplanActivity } from './types.ts';
import { DoorsGame } from './DoorsGame.tsx';
import { LayoutGame } from './LayoutGame.tsx';

export function FloorplanGame({ game, lang }: { game: FloorplanActivity; lang: Lang }) {
  return game.parameters.mode === 'doors' ? <DoorsGame game={game} lang={lang} /> : <LayoutGame game={game} lang={lang} />;
}
