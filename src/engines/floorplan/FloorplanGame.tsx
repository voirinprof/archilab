import type { Lang } from '../../types.ts';
import type { FloorplanActivity, FurnishActivity } from './types.ts';
import { DoorsGame } from './DoorsGame.tsx';
import { FurnishGame } from './FurnishGame.tsx';
import { LayoutGame } from './LayoutGame.tsx';

const isFurnish = (game: FloorplanActivity | FurnishActivity): game is FurnishActivity => game.parameters.mode === 'furnish';

export function FloorplanGame({ game, lang }: { game: FloorplanActivity | FurnishActivity; lang: Lang }) {
  if (isFurnish(game)) return <FurnishGame game={game} lang={lang} />;
  return game.parameters.mode === 'doors' ? <DoorsGame game={game} lang={lang} /> : <LayoutGame game={game} lang={lang} />;
}
