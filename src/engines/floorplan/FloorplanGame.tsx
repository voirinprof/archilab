import type { Lang } from '../../types.ts';
import type { FloorplanActivity, FurnishActivity, RenovateActivity } from './types.ts';
import { DoorsGame } from './DoorsGame.tsx';
import { FurnishGame } from './FurnishGame.tsx';
import { LayoutGame } from './LayoutGame.tsx';
import { RenovateGame } from './RenovateGame.tsx';

type AnyFloorplan = FloorplanActivity | FurnishActivity | RenovateActivity;
const isFurnish = (game: AnyFloorplan): game is FurnishActivity => game.parameters.mode === 'furnish';
const isRenovate = (game: AnyFloorplan): game is RenovateActivity => game.parameters.mode === 'renovate';

export function FloorplanGame({ game, lang }: { game: AnyFloorplan; lang: Lang }) {
  if (isFurnish(game)) return <FurnishGame game={game} lang={lang} />;
  if (isRenovate(game)) return <RenovateGame game={game} lang={lang} />;
  return game.parameters.mode === 'doors' ? <DoorsGame game={game} lang={lang} /> : <LayoutGame game={game} lang={lang} />;
}
