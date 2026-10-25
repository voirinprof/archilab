import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { DoorOpen, Eraser, Hammer, Tag } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { RenovateActivity, Works } from './types.ts';
import type { Space, Usage } from './renovate.ts';
import {
  assignUse, canEditDoor, canEditWall, evaluateRenovate, hasDoor, hasWindow, interiorSegments, makeBuilding, noWorks,
  segmentGeometry, spaceUse, spaces, toggleDoor, toggleWall, touchesWater, wallKind, worksCost,
} from './renovate.ts';
import { DoorShape } from './DoorsGame.tsx';
import { Feedback, NeedsList, PlanFrame, SCALE, colorsOf, px } from './shared.tsx';

const ui = {
  fr: {
    mission: 'Ta mission', title: 'À toi de transformer',
    help: 'Choisis un outil. « Murs » : touche une cloison pour la démolir, ou une ligne vide pour construire. « Portes » : touche une cloison pour y percer ou fermer une porte. « Pièces » : touche une pièce puis choisis sa fonction. Au clavier : flèches pour choisir une case, Maj + flèche pour agir sur le mur de ce côté, 1 à 6 pour la fonction.',
    tools: { walls: 'Murs', doors: 'Portes', rooms: 'Pièces' },
    room: 'Pièce sélectionnée', none: 'Aucune pièce sélectionnée : touche une pièce du plan.', unassigned: 'à définir', clearUse: 'Effacer',
    window: 'fenêtre', water: 'tuyaux', yes: '✓', no: '✗',
    cost: 'Coût des travaux', demolished: 'Murs démolis', built: 'Murs construits',
    legend: { bearing: 'mur porteur', water: 'mur des tuyaux', partition: 'cloison', new: 'cloison neuve', removed: 'démolie' },
    plan: 'Plan du logement', north: 'N', south: 'SUD', entrance: 'Entrée',
    cell: (x: number, y: number, use: string, area: number) => `Case ${x + 1}, ${y + 1} : ${use}, ${area} m²`,
  },
  en: {
    mission: 'Your mission', title: 'Time to transform',
    help: 'Pick a tool. Walls: tap a partition to demolish it, or an empty line to build one. Doors: tap a partition to open or close a door in it. Rooms: tap a room, then choose its function. With a keyboard: arrows to pick a cell, Shift + arrow to act on the wall on that side, 1 to 6 for the function.',
    tools: { walls: 'Walls', doors: 'Doors', rooms: 'Rooms' },
    room: 'Selected room', none: 'No room selected: tap a room on the plan.', unassigned: 'to decide', clearUse: 'Clear',
    window: 'window', water: 'pipes', yes: '✓', no: '✗',
    cost: 'Works cost', demolished: 'Walls demolished', built: 'Walls built',
    legend: { bearing: 'load-bearing wall', water: 'pipe wall', partition: 'partition', new: 'new partition', removed: 'demolished' },
    plan: 'Home plan', north: 'N', south: 'SOUTH', entrance: 'Entrance',
    cell: (x: number, y: number, use: string, area: number) => `Cell ${x + 1}, ${y + 1}: ${use}, ${area} m²`,
  },
};

type Tool = 'walls' | 'doors' | 'rooms';
const SIDES: Record<string, (x: number, y: number) => string> = {
  ArrowUp: (x, y) => `h:${x}:${y}`, ArrowDown: (x, y) => `h:${x}:${y + 1}`, ArrowLeft: (x, y) => `v:${x}:${y}`, ArrowRight: (x, y) => `v:${x + 1}:${y}`,
};

/** Renovate mode: an existing building is transformed by moving partitions and doors, then rooms get a new use. */
export function RenovateGame({ game, lang }: { game: RenovateActivity; lang: Lang }) {
  const t = ui[lang];
  const params = game.parameters;
  const { plan, uses, costs } = params;
  const scale = params.scale ?? SCALE;
  const p = (m: number) => px(m, scale);
  const [building] = useState(() => makeBuilding(params));
  const [works, setWorks] = useState<Works>(noWorks);
  const [usage, setUsage] = useState<Usage>({});
  const [tool, setTool] = useState<Tool>('walls');
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);
  const svgRef = useRef<SVGSVGElement>(null);

  const all = spaces(building, works);
  const spaceAt = (x: number, y: number) => all.find(s => s.cells.some(([cx, cy]) => cx === x && cy === y))!;
  const useOf = (s: Space) => spaceUse(s, usage);
  const useSpec = (id?: string) => uses.find(u => u.id === id);
  const result = evaluateRenovate(game.constraints, { building, works, usage, costs });
  const cost = worksCost(works, costs);
  const budget = game.constraints.find(c => c.type === 'max_cost');
  const selSpace = selected ? spaceAt(...selected) : null;

  function change(next: Works) {
    setWorks(next);
    setChecked(false);
  }

  function actOnSegment(key: string) {
    if (tool === 'walls') change(toggleWall(building, works, key));
    else if (tool === 'doors') change(toggleDoor(building, works, key));
  }

  function setUse(use: string | undefined) {
    if (!selSpace) return;
    setUsage(u => assignUse(selSpace, use, u));
    setChecked(false);
  }

  function reset() {
    setWorks(noWorks());
    setUsage({});
    setSelected(null);
    setChecked(false);
    setHint(-1);
  }

  function onKey(e: KeyboardEvent) {
    const [x, y] = focus;
    if (SIDES[e.key]) {
      e.preventDefault();
      if (e.shiftKey) return actOnSegment(SIDES[e.key](x, y));
      const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]!;
      setFocus([Math.max(0, Math.min(plan.width - 1, x + d[0])), Math.max(0, Math.min(plan.depth - 1, y + d[1]))]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelected([x, y]);
    } else if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const space = spaceAt(x, y);
      setSelected([x, y]);
      const use = e.key === '0' ? undefined : uses[Number(e.key) - 1]?.id;
      if (e.key === '0' || use) { setUsage(u => assignUse(space, use, u)); setChecked(false); }
    }
  }

  // walls to draw, by kind; a segment holding a door is drawn as a door instead
  const allKeys = [...building.base.keys(), ...works.added];
  const wallPath = (kinds: string[]) => allKeys
    .filter(k => kinds.includes(wallKind(building, works, k) ?? '') && !hasDoor(building, works, k))
    .map(k => { const g = segmentGeometry(k); return `M${p(g.x1)} ${p(g.y1)}L${p(g.x2)} ${p(g.y2)}`; }).join('');
  const removedPath = works.removed.map(k => { const g = segmentGeometry(k); return `M${p(g.x1)} ${p(g.y1)}L${p(g.x2)} ${p(g.y2)}`; }).join('');
  const windowKeys = [...building.windows];
  const doorKeys = allKeys.filter(k => hasDoor(building, works, k));
  const editable = interiorSegments(plan).filter(k => (tool === 'walls' ? canEditWall(building, k) : tool === 'doors' ? canEditDoor(building, works, k) : false));
  const entrance = doorKeys.find(k => wallKind(building, works, k) === 'exterior');

  // label each room at the free cell closest to its centre
  const labelCell = (s: Space): [number, number] => {
    const mx = s.cells.reduce((a, c) => a + c[0], 0) / s.area, my = s.cells.reduce((a, c) => a + c[1], 0) / s.area;
    return s.cells.reduce((best, c) => (Math.hypot(c[0] - mx, c[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? c : best));
  };
  const showGood = params.good_cost !== undefined && cost <= params.good_cost;
  /** Doors swing into the building: on the south and east outer walls, that is towards the north or west side. */
  const opensWestOrNorth = (k: string) => {
    const g = segmentGeometry(k);
    return (g.x1 === g.x2 && g.x1 === plan.width) || (g.y1 === g.y2 && g.y1 === plan.depth);
  };

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <p className="floorplan-help">{t.help}</p>
        <div className="tool-switch" role="group">
          {(['walls', 'doors', 'rooms'] as Tool[]).map(id => (
            <button key={id} className={tool === id ? 'active' : ''} aria-pressed={tool === id} onClick={() => setTool(id)}>
              {id === 'walls' ? <Hammer size={15} /> : id === 'doors' ? <DoorOpen size={15} /> : <Tag size={15} />}{t.tools[id]}
            </button>
          ))}
        </div>
        <div className="drawing">
          <PlanFrame plan={plan} lang={lang} svgRef={svgRef} scale={scale} className={`renovate tool-${tool}`}>
            {all.map(s => {
              const use = useSpec(useOf(s));
              const isSel = !!selSpace && selSpace.id === s.id;
              return s.cells.map(([x, y]) => (
                <rect
                  key={`${x},${y}`}
                  x={p(x)} y={p(y)} width={scale} height={scale}
                  fill={use ? colorsOf(use).fill : '#f3f5f1'}
                  className={`rn-cell${isSel ? ' selected' : ''}`}
                  onClick={() => { setSelected([x, y]); setFocus([x, y]); }}
                />
              ));
            })}
            {params.former?.filter(f => !useOf(spaceAt(f.at[0], f.at[1]))).map(f => (
              <text key={`${f.at}`} x={p(f.at[0] + 0.5)} y={p(f.at[1] + 0.5) + 22} textAnchor="middle" className="rn-former">{f.label[lang]}</text>
            ))}
            {all.map(s => {
              const [x, y] = labelCell(s);
              const use = useSpec(useOf(s));
              return (
                <g key={`label-${s.id}`} className="rn-label">
                  <text x={p(x + 0.5)} y={p(y + 0.5) - 2} textAnchor="middle" className={use ? 'fp-label' : 'fp-label rn-unknown'} fontSize={12}>{use ? use.label[lang] : '?'}</text>
                  <text x={p(x + 0.5)} y={p(y + 0.5) + 13} textAnchor="middle" className="fp-area" fontSize={12}>{s.area} m²</text>
                </g>
              );
            })}
            <path d={removedPath} className="rn-wall removed" />
            <path d={wallPath(['partition'])} className="rn-wall partition" />
            <path d={wallPath(['new'])} className="rn-wall new" />
            <path d={wallPath(['bearing'])} className="rn-wall bearing" />
            <path d={wallPath(['bearing'])} className="rn-wall bearing-core" />
            <path d={wallPath(['water'])} className="rn-wall water" />
            <path d={wallPath(['exterior'])} className="rn-wall exterior" />
            {windowKeys.map(k => { const g = segmentGeometry(k); return <line key={k} x1={p(g.x1)} y1={p(g.y1)} x2={p(g.x2)} y2={p(g.y2)} className="fp-window-glass" />; })}
            {doorKeys.map(k => <DoorShape key={k} s={segmentGeometry(k)} into={opensWestOrNorth(k) ? 'a' : 'b'} scale={scale} />)}
            {entrance && (() => {
              // written along the outer wall, just outside it
              const g = segmentGeometry(entrance);
              const vertical = g.x1 === g.x2;
              const out = (v: number, max: number) => (v === 0 ? -12 : v === max ? 18 : 0);
              const x = p((g.x1 + g.x2) / 2) + (vertical ? out(g.x1, plan.width) : 0), y = p((g.y1 + g.y2) / 2) + (vertical ? 0 : out(g.y1, plan.depth));
              return <text x={x} y={y} transform={vertical ? `rotate(-90 ${x} ${y})` : undefined} textAnchor="middle" className="fp-door-label">{t.entrance}</text>;
            })()}
            {editable.map(k => {
              const g = segmentGeometry(k);
              return <line key={`hit-${k}`} x1={p(g.x1)} y1={p(g.y1)} x2={p(g.x2)} y2={p(g.y2)} className="fp-wall-hit" onClick={() => actOnSegment(k)} />;
            })}
            <rect
              x={p(focus[0])} y={p(focus[1])} width={scale} height={scale}
              className="rn-focus" tabIndex={0} role="button"
              aria-label={t.cell(focus[0], focus[1], useSpec(useOf(spaceAt(...focus)))?.label[lang] ?? t.unassigned, spaceAt(...focus).area)}
              onKeyDown={onKey}
              onClick={() => setSelected(focus)}
            />
          </PlanFrame>
        </div>
        <div className="rn-legend">
          {(['bearing', 'water', 'partition', 'new', 'removed'] as const).map(k => <span key={k}><i className={`rn-swatch ${k}`} />{t.legend[k]}</span>)}
        </div>
        <div className="metrics three">
          <div><small>{t.cost}</small><strong className={budget?.type === 'max_cost' && cost > budget.value ? 'over' : ''}>{cost}{budget?.type === 'max_cost' && ` / ${budget.value}`}</strong></div>
          <div><small>{t.demolished}</small><strong>{works.removed.length} m</strong></div>
          <div><small>{t.built}</small><strong>{works.added.length} m</strong></div>
        </div>
      </section>
      <aside className="controls">
        <h2>{t.title}</h2>
        <div className="room-editor">
          {selSpace ? (
            <>
              <div className="control-label">
                <span>{t.room} : {useSpec(useOf(selSpace))?.label[lang] ?? t.unassigned}</span>
                <strong>{selSpace.area} m²</strong>
              </div>
              <div className="rn-facts">
                <span>{t.window} {hasWindow(building, selSpace) ? t.yes : t.no}</span>
                <span>{t.water} {touchesWater(building, selSpace) ? t.yes : t.no}</span>
              </div>
              <div className="room-chips">
                {uses.map((u, i) => (
                  <button key={u.id} className={useOf(selSpace) === u.id ? 'active' : ''} aria-pressed={useOf(selSpace) === u.id} onClick={() => setUse(u.id)}>
                    <span style={{ background: colorsOf(u).fill }} />{i + 1}. {u.label[lang]}
                  </button>
                ))}
                <button onClick={() => setUse(undefined)}><Eraser size={13} />{t.clearUse}</button>
              </div>
            </>
          ) : <p className="rn-none">{t.none}</p>}
        </div>
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
          extra={showGood ? game.feedback.best?.[lang] : undefined}
        />
      </aside>
    </div>
  );
}
