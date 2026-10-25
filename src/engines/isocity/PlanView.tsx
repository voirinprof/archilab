import type { Lang } from '../../types.ts';
import type { Dir } from './types.ts';
import type { Cell, Issue, Scenario } from './rules.ts';
import { elementOf, expectedPlan, footprint, roadPieceFor, solutionOf } from './rules.ts';
import { columnName } from './IsoView.tsx';

const C = 26;
const M = 20;
const GRASS = '#dfe9d6';

type Props = {
  sc: Scenario;
  /** Elements of the current step; the others are faded. Null shows everything. */
  focus: Set<string> | null;
  hover: Cell | null;
  issues: Issue[];
  label: string;
  onCellHover: (cell: Cell | null) => void;
};

/** Road markings of one plan cell: a white line from the centre towards each connected side. */
function lanes(x: number, y: number, dirs: Dir[]) {
  const cx = M + x * C + C / 2, cy = M + y * C + C / 2;
  const to: Record<Dir, [number, number]> = { n: [cx, cy - C / 2], e: [cx + C / 2, cy], s: [cx, cy + C / 2], w: [cx - C / 2, cy] };
  return dirs.map(d => `M${cx} ${cy}L${to[d].join(' ')}`).join('');
}

/** The reference plan seen from above, north at the top, with the same column letters and row numbers as the isometric view. */
export function PlanView({ sc, focus, hover, issues, label, onCellHover }: Props) {
  const { width, depth } = sc.grid;
  const plan = expectedPlan(sc);
  const solution = solutionOf(sc);
  const faded = (id: string) => !!focus && !focus.has(id);
  const roadFaded = !!focus && !sc.elements.some(e => e.kind === 'road' && e.shape === 'road' && focus.has(e.id));
  return (
    <svg viewBox={`0 0 ${M + width * C + 4} ${M + depth * C + 4}`} className="ic-plan" role="img" aria-label={label} onPointerLeave={() => onCellHover(null)}>
      <rect x={M} y={M} width={width * C} height={depth * C} fill={GRASS} />
      {Array.from({ length: width }, (_, x) => <text key={`c${x}`} x={M + x * C + C / 2} y={M - 6} className="ic-coord" textAnchor="middle">{columnName(x)}</text>)}
      {Array.from({ length: depth }, (_, y) => <text key={`r${y}`} x={M - 5} y={M + y * C + C / 2 + 4} className="ic-coord" textAnchor="end">{y + 1}</text>)}
      {solution.map(p => {
        const el = elementOf(sc, p.element);
        const r = footprint(el, p);
        const x = M + r.x * C, y = M + r.y * C;
        if (el.kind === 'road') {
          const dirs = plan[r.y][r.x].dirs;
          const crossing = el.shape === 'crosswalk';
          const along = dirs.includes('n');
          return (
            <g key={p.uid} className={roadFaded && faded(el.id) ? 'ic-faded' : undefined}>
              <rect x={x} y={y} width={C} height={C} fill={el.color} />
              {crossing
                ? <path d={[0.2, 0.42, 0.64].map(o => along ? `M${x + o * C} ${y + 4}h${C * 0.16}v${C - 8}h${-C * 0.16}Z` : `M${x + 4} ${y + o * C}v${C * 0.16}h${C - 8}v${-C * 0.16}Z`).join('')} fill="#fff" />
                : <path d={lanes(r.x, r.y, dirs)} className="ic-plan-lane" />}
            </g>
          );
        }
        if (el.kind === 'tree' || el.kind === 'signal') {
          return (
            <g key={p.uid} className={faded(el.id) ? 'ic-faded' : undefined}>
              {el.kind === 'tree'
                ? <circle cx={x + C / 2} cy={y + C / 2} r={C * 0.34} fill={el.color} className="ic-plan-tree" />
                : <><rect x={x + C - 10} y={y + 2} width={8} height={14} rx={2} fill={el.color} /><circle cx={x + C - 6} cy={y + 6} r={2} fill="#ef4444" /><circle cx={x + C - 6} cy={y + 12} r={2} fill="#34c06a" /></>}
            </g>
          );
        }
        return (
          <g key={p.uid} className={faded(el.id) ? 'ic-faded' : undefined}>
            <rect x={x + 1.5} y={y + 1.5} width={r.w * C - 3} height={r.d * C - 3} rx={4} fill={el.color} className="ic-plan-lot" />
            <text x={x + (r.w * C) / 2} y={y + (r.d * C) / 2 + 5} textAnchor="middle" className="ic-plan-icon">{el.icon}</text>
          </g>
        );
      })}
      {issues.map(({ x, y, kind }) => <rect key={`i${x},${y}`} x={M + x * C + 2} y={M + y * C + 2} width={C - 4} height={C - 4} rx={4} className={`ic-plan-issue ${kind}`} />)}
      {hover && <rect x={M + hover[0] * C} y={M + hover[1] * C} width={C} height={C} className="ic-plan-hover" />}
      {Array.from({ length: depth }, (_, y) => Array.from({ length: width }, (_, x) => (
        <rect key={`h${x},${y}`} x={M + x * C} y={M + y * C} width={C} height={C} fill="transparent" onPointerEnter={() => onCellHover([x, y])} />
      )))}
      <text x={2} y={11} className="ic-north">N ↑</text>
    </svg>
  );
}

/** What the plan asks for on a cell, in words. */
export function planCellText(sc: Scenario, lang: Lang, x: number, y: number) {
  const exp = expectedPlan(sc)[y][x];
  const piece = exp.road && !exp.element ? roadPieceFor(sc, exp.dirs, sc.elements.filter(e => e.kind === 'road' && e.shape === 'road')) : null;
  const road = piece && elementOf(sc, piece.element);
  const names = [road?.label[lang], exp.element && elementOf(sc, exp.element).label[lang], exp.overlay && elementOf(sc, exp.overlay).label[lang]].filter(Boolean);
  return names.length ? names.join(' + ') : sc.empty_label[lang];
}

/** Legend of the plan, built from the scenario's symbols. */
export function PlanLegend({ sc, lang }: { sc: Scenario; lang: Lang }) {
  const swatch = (symbol: string | null) => {
    const s = symbol === null ? null : sc.symbols.find(x => x.symbol === symbol)!;
    const el = s?.element ? elementOf(sc, s.element) : s?.overlay ? elementOf(sc, s.overlay) : null;
    const road = s?.road ? sc.elements.find(e => e.kind === 'road')! : null;
    return (
      <svg viewBox="0 0 20 20" width={20} height={20} aria-hidden="true">
        <rect width={20} height={20} rx={3} fill={road ? road.color : el && el.kind !== 'tree' && el.kind !== 'signal' ? el.color : GRASS} />
        {s?.road && !s.element && !s.overlay && <path d="M10 0V20" className="ic-plan-lane" />}
        {el?.shape === 'crosswalk' && <path d="M4 4h3v12h-3ZM9 4h3v12h-3ZM14 4h3v12h-3Z" fill="#fff" />}
        {el?.kind === 'tree' && <circle cx={10} cy={10} r={7} fill={el.color} className="ic-plan-tree" />}
        {el?.kind === 'signal' && <><rect x={6} y={2} width={8} height={16} rx={2} fill={el.color} /><circle cx={10} cy={6} r={2} fill="#ef4444" /><circle cx={10} cy={14} r={2} fill="#34c06a" /></>}
        {el && el.kind !== 'tree' && el.kind !== 'signal' && el.kind !== 'road' && <text x={10} y={15} textAnchor="middle" fontSize={12}>{el.icon}</text>}
      </svg>
    );
  };
  return (
    <ul className="ic-legend">
      <li>{swatch(null)}{sc.empty_label[lang]}</li>
      {sc.symbols.map(s => <li key={s.symbol}>{swatch(s.symbol)}{s.label[lang]}</li>)}
    </ul>
  );
}
