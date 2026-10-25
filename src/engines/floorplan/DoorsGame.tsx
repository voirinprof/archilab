import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Lang } from '../../types.ts';
import type { FloorplanActivity, WallSegment } from './types.ts';
import { CIRCULATION, OUTSIDE, doorLinks, evaluate, initialLayout, reachableSpaces, spaceAt, spacesOf, wallSegments } from './rules.ts';
import { Feedback, NeedsList, PlanFrame, RoomLabel, SCALE, colorsOf, px, ui } from './shared.tsx';

const LEAF = 0.8; // door leaf width in metres, centred in its 1 m wall segment
const MARGIN = (1 - LEAF) / 2;

/** Door leaf and swing arc, opening into side a (west/north) or b (east/south) of the segment. */
export function DoorShape({ s, into, scale = SCALE }: { s: Pick<WallSegment, 'x1' | 'y1' | 'x2' | 'y2'>; into: 'a' | 'b'; scale?: number }) {
  const p = (m: number) => px(m, scale);
  const sign = into === 'b' ? 1 : -1;
  const vertical = s.x1 === s.x2;
  const hinge = vertical ? [s.x1, s.y1 + MARGIN] : [s.x1 + MARGIN, s.y1];
  const leafEnd = vertical ? [s.x1 + sign * LEAF, s.y1 + MARGIN] : [s.x1 + MARGIN, s.y1 + sign * LEAF];
  const arcEnd = vertical ? [s.x1, s.y1 + MARGIN + LEAF] : [s.x1 + MARGIN + LEAF, s.y1];
  const sweep = vertical ? (sign > 0 ? 1 : 0) : (sign > 0 ? 0 : 1);
  const r = LEAF * scale;
  const [ax, ay] = hinge.map(p), [bx, by] = leafEnd.map(p), [cx, cy] = arcEnd.map(p);
  const jamb = (from: number[], to: number[]) => <line x1={p(from[0])} y1={p(from[1])} x2={p(to[0])} y2={p(to[1])} className="fp-wall" />;
  return (
    <g className="fp-door">
      {vertical
        ? <>{jamb([s.x1, s.y1], [s.x1, s.y1 + MARGIN])}{jamb([s.x1, s.y2 - MARGIN], [s.x1, s.y2])}</>
        : <>{jamb([s.x1, s.y1], [s.x1 + MARGIN, s.y1])}{jamb([s.x2 - MARGIN, s.y1], [s.x2, s.y1])}</>}
      <path d={`M${ax} ${ay}L${bx} ${by}A${r} ${r} 0 0 ${sweep} ${cx} ${cy}`} />
    </g>
  );
}

/** Doors mode: rooms are fixed, the player opens doors in the walls. */
export function DoorsGame({ game, lang }: { game: FloorplanActivity; lang: Lang }) {
  const t = ui[lang];
  const { plan, rooms, circulation } = game.parameters;
  const [layout] = useState(() => initialLayout(rooms));
  const [doors, setDoors] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);

  const segments = wallSegments(layout, plan);
  const result = evaluate(game.constraints, layout, plan, { doors });
  const reached = reachableSpaces(doorLinks(layout, plan, doors));
  const spaces = spacesOf(layout, plan);
  const maxDoors = game.constraints.find(c => c.type === 'max_doors');

  const nameOf = (space: string) =>
    space === OUTSIDE ? t.outside : space === CIRCULATION ? circulation?.[lang] ?? t.free : rooms.find(r => r.id === space)!.label[lang];

  // Number the pieces of each wall so screen-reader labels stay distinct.
  const pairKey = (s: WallSegment) => [s.a, s.b].sort().join('|');
  const pairTotals = new Map<string, number>();
  const pieceIndex = new Map<string, number>();
  for (const s of segments) {
    const n = (pairTotals.get(pairKey(s)) ?? 0) + 1;
    pairTotals.set(pairKey(s), n);
    pieceIndex.set(s.key, n);
  }

  const freeCells: [number, number][] = [];
  for (let y = 0; y < plan.depth; y++) for (let x = 0; x < plan.width; x++) if (spaceAt(layout, plan, x, y) === CIRCULATION) freeCells.push([x, y]);
  // Circulation label: at the centre of the free cells, or on the nearest free cell if that centre falls in a room.
  let labelAt: [number, number] | null = null;
  if (freeCells.length) {
    const mx = freeCells.reduce((sum, c) => sum + c[0] + 0.5, 0) / freeCells.length;
    const my = freeCells.reduce((sum, c) => sum + c[1] + 0.5, 0) / freeCells.length;
    const nearest = freeCells.reduce((best, c) => (Math.hypot(c[0] + 0.5 - mx, c[1] + 0.5 - my) < Math.hypot(best[0] + 0.5 - mx, best[1] + 0.5 - my) ? c : best));
    labelAt = spaceAt(layout, plan, Math.floor(mx), Math.floor(my)) === CIRCULATION ? [mx, my] : [nearest[0] + 0.5, nearest[1] + 0.5];
  }
  const wallPath = (outer: boolean) => segments
    .filter(s => !doors.includes(s.key) && !!s.side === outer)
    .map(s => `M${px(s.x1)} ${px(s.y1)}L${px(s.x2)} ${px(s.y2)}`)
    .join('');

  function toggle(key: string) {
    setDoors(current => (current.includes(key) ? current.filter(k => k !== key) : [...current, key]));
    setChecked(false);
  }

  function onKey(e: KeyboardEvent, key: string) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    toggle(key);
  }

  function reset() {
    setDoors([]);
    setChecked(false);
    setHint(-1);
  }

  /** A door swings into a room if it can, never towards the outside. */
  const isRoom = (space: string) => space !== OUTSIDE && space !== CIRCULATION;
  const swingInto = (s: WallSegment): 'a' | 'b' => (isRoom(s.b) ? 'b' : isRoom(s.a) ? 'a' : s.a === OUTSIDE ? 'b' : 'a');

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <p className="floorplan-help">{t.doorsHelp}</p>
        <div className="drawing">
          <PlanFrame plan={plan} lang={lang}>
            {freeCells.map(([x, y]) => (
              <rect key={`${x}:${y}`} x={px(x)} y={px(y)} width={SCALE} height={SCALE} className={`fp-circulation${reached.has(CIRCULATION) ? '' : ' unreached'}`} />
            ))}
            {layout.map(r => (
              <rect key={r.id} x={px(r.x)} y={px(r.y)} width={r.width * SCALE} height={r.depth * SCALE} fill={colorsOf(rooms.find(s => s.id === r.id)!).fill} className={reached.has(r.id) ? '' : 'unreached'} />
            ))}
            {layout.map(r => <RoomLabel key={r.id} rect={r} label={rooms.find(s => s.id === r.id)!.label[lang]} />)}
            {labelAt && circulation && <RoomLabel rect={{ x: labelAt[0] - 0.5, y: labelAt[1] - 0.5, width: 1, depth: 1 }} label={circulation[lang]} />}
            <path d={wallPath(false)} className="fp-wall" />
            <path d={wallPath(true)} className="fp-wall outer" />
            {segments.filter(s => doors.includes(s.key)).map(s => <DoorShape key={s.key} s={s} into={swingInto(s)} />)}
            {segments.map(s => {
              const open = doors.includes(s.key);
              return (
                <line
                  key={`hit-${s.key}`}
                  x1={px(s.x1)} y1={px(s.y1)} x2={px(s.x2)} y2={px(s.y2)}
                  className="fp-wall-hit"
                  tabIndex={0}
                  role="button"
                  aria-pressed={open}
                  aria-label={`${t.wall(nameOf(s.a), nameOf(s.b), pieceIndex.get(s.key)!, pairTotals.get(pairKey(s))!)}${open ? `, ${t.door}` : ''}`}
                  onClick={() => toggle(s.key)}
                  onKeyDown={e => onKey(e, s.key)}
                />
              );
            })}
          </PlanFrame>
        </div>
        <div className="metrics">
          <div><small>{t.doors}</small><strong>{doors.length}{maxDoors?.type === 'max_doors' && ` / ${maxDoors.value}`}</strong></div>
          <div><small>{t.reached}</small><strong>{spaces.filter(s => reached.has(s)).length} / {spaces.length}</strong></div>
        </div>
      </section>
      <aside className="controls">
        <h2>{t.doorsTitle}</h2>
        {spaces.some(s => !reached.has(s)) && <div className="note unreached-note">{t.unreached}</div>}
        <NeedsList lang={lang} items={game.constraints.map((c, i) => ({ label: c.label[lang], ok: result.constraints[i] }))} />
        <Feedback
          game={game}
          lang={lang}
          solved={result.solved}
          checked={checked}
          onCheck={() => setChecked(true)}
          hint={hint}
          onHint={() => setHint(h => Math.min(h + 1, game.hints[lang].length - 1))}
          onReset={reset}
        />
      </aside>
    </div>
  );
}
