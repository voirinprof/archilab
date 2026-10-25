import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Undo2 } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { Bar, Point, TrussActivity } from './types.ts';
import type { BarResult } from './rules.ts';
import { analyse, barKey, canAddBar, evaluateTruss, length, pointKey, sameBar } from './rules.ts';
import { Feedback, NeedsList } from '../../components/Feedback.tsx';

const ui = {
  fr: {
    mission: 'Ta mission', title: 'À toi de construire',
    scenes: {
      ravine: { check: 'Faire passer le camion', stable: 'Le pont tient debout.', collapse: 'Le pont s’effondre : les points orange peuvent bouger. Ajoute des triangles !', drawing: 'Côté du pont', given: 'route', cause: 'sous le camion' },
      ground: { check: 'Faire souffler le vent', stable: 'La tour tient debout.', collapse: 'La tour se couche : les points orange peuvent bouger. Ajoute des triangles !', drawing: 'Façade de la tour', given: 'structure existante', cause: 'sous la poussée du vent' },
    },
    help: 'Touche un point, puis un autre pour poser une poutre entre eux. Touche une poutre pour la retirer. Au clavier : flèches pour choisir un point, Entrée pour commencer ou finir une poutre, Échap pour annuler, Suppr pour retirer la dernière poutre.',
    bars: 'Poutres', worst: 'Poutre la plus sollicitée', undo: 'Retirer la dernière poutre', deform: 'Montrer la déformation (exagérée)',
    broken: (n: number, cause: string) => `${n} poutre${n > 1 ? 's cassent' : ' casse'} ${cause}.`,
    tooLong: 'Trop long : une poutre ne peut pas dépasser', exists: 'Cette poutre existe déjà.', budget: 'Plus de poutres disponibles.',
    legend: { tension: 'traction (tirée)', compression: 'compression (poussée)', broken: 'cassée' },
    load: (name: string, n: number, load: number) => `${name} : ${n} × ${load} kN`, point: (x: number, y: number) => `Point ${x}, ${y}`,
    start: 'début de la poutre',
  },
  en: {
    mission: 'Your mission', title: 'Time to build',
    scenes: {
      ravine: { check: 'Send the truck across', stable: 'The bridge stands.', collapse: 'The bridge collapses: the orange points can move. Add triangles!', drawing: 'Side view of the bridge', given: 'road', cause: 'under the truck' },
      ground: { check: 'Let the wind blow', stable: 'The tower stands.', collapse: 'The tower falls over: the orange points can move. Add triangles!', drawing: 'Side of the tower', given: 'existing structure', cause: 'under the push of the wind' },
    },
    help: 'Tap a point, then another to put a beam between them. Tap a beam to remove it. With a keyboard: arrows to pick a point, Enter to start or finish a beam, Escape to cancel, Delete to remove the last beam.',
    bars: 'Beams', worst: 'Most loaded beam', undo: 'Remove the last beam', deform: 'Show the deformation (exaggerated)',
    broken: (n: number, cause: string) => `${n} beam${n > 1 ? 's break' : ' breaks'} ${cause}.`,
    tooLong: 'Too long: a beam can’t be longer than', exists: 'This beam already exists.', budget: 'No beams left.',
    legend: { tension: 'tension (pulled)', compression: 'compression (pushed)', broken: 'broken' },
    load: (name: string, n: number, load: number) => `${name}: ${n} × ${load} kN`, point: (x: number, y: number) => `Point ${x}, ${y}`,
    start: 'start of the beam',
  },
};

const S = 58;
const PAD = 40;

/** Truss engine: build a bridge with beams between grid points; a simplified truss analysis shows forces and failures live. */
export function TrussGame({ game, lang }: { game: TrussActivity; lang: Lang }) {
  const t = ui[lang];
  const P = game.parameters;
  const scene = P.scene ?? 'ravine';
  const st = t.scenes[scene];
  const [ldx, ldy] = P.load_direction ?? [0, -1];
  const budget = game.constraints.find(c => c.type === 'max_bars');
  const maxBars = budget?.type === 'max_bars' ? budget.value : Infinity;
  const [bars, setBars] = useState<Bar[]>([]);
  const [start, setStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point>([P.grid.x[0], 0]);
  const [hover, setHover] = useState<Point | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deform, setDeform] = useState(false);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);
  const svgRef = useRef<SVGSVGElement>(null);

  const analysis = analyse({
    bars: [...P.deck, ...bars], supports: P.supports, loads: P.loads, load: P.load, loadDirection: P.load_direction,
    tensionLimit: P.tension_limit, compressionLimit: P.compression_limit, strongBars: { bars: P.deck, factor: P.deck_strength ?? 1 },
  });
  const result = evaluateTruss(game.constraints, analysis, bars.length);
  const forceOf = (bar: Bar): BarResult | undefined => (analysis.stable ? analysis.bars.find(r => sameBar(r.bar, bar)) : undefined);
  const brokenCount = analysis.stable ? analysis.bars.filter(r => r.ratio > 1 + 1e-9).length : 0;
  const loose = new Set(analysis.stable ? [] : analysis.loose.map(pointKey));

  const xs = [P.grid.x[0] - 1, P.grid.x[1] + 1], top = P.grid.y[1] + 0.6, bottom = P.grid.y[0] - 1.1;
  const X = (x: number) => PAD + (x - xs[0]) * S;
  const Y = (y: number) => PAD + (top - y) * S;
  const width = (xs[1] - xs[0]) * S + 2 * PAD, height = (top - bottom) * S + 2 * PAD;
  const points: Point[] = [];
  for (let y = P.grid.y[1]; y >= P.grid.y[0]; y--) for (let x = P.grid.x[0]; x <= P.grid.x[1]; x++) points.push([x, y]);
  const revealAt = P.reveal_pattern_hint;
  const showPattern = !!P.pattern && revealAt !== undefined && hint + 1 >= revealAt;

  // exaggerated deformation: the largest displacement is drawn as 0.35 grid units
  const peak = analysis.stable ? Math.max(1e-9, ...[...analysis.displacements.values()].map(([dx, dy]) => Math.hypot(dx, dy))) : 1;
  const moved = ([x, y]: Point): Point => {
    if (!analysis.stable) return [x, y];
    const [dx, dy] = analysis.displacements.get(pointKey([x, y])) ?? [0, 0];
    return [x + (dx / peak) * 0.35, y + (dy / peak) * 0.35];
  };

  function addBar(bar: Bar) {
    if (bars.length >= maxBars) return setMessage(t.budget);
    if (bars.some(b => sameBar(b, bar)) || P.deck.some(b => sameBar(b, bar))) return setMessage(t.exists);
    if (!canAddBar(bar, [], P.grid, P.max_length)) return setMessage(`${t.tooLong} ${(P.max_length * P.unit).toLocaleString(lang)} m.`);
    setBars(list => [...list, bar]);
    setMessage(null);
    setChecked(false);
  }

  function pick(p: Point) {
    setCursor(p);
    if (!start) { setStart(p); setMessage(null); return; }
    if (pointKey(start) === pointKey(p)) { setStart(null); return; }
    addBar([start, p]);
    setStart(p); // chain beams: the end of one is the start of the next
  }

  function removeBar(bar: Bar) {
    setBars(list => list.filter(b => !sameBar(b, bar)));
    setChecked(false);
  }

  function toGrid(e: PointerEvent): Point | null {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const x = Math.round((pt.x - PAD) / S + xs[0]), y = Math.round(top - (pt.y - PAD) / S);
    return x >= P.grid.x[0] && x <= P.grid.x[1] && y >= P.grid.y[0] && y <= P.grid.y[1] ? [x, y] : null;
  }

  function onKey(e: KeyboardEvent) {
    const moves: Record<string, Point> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (moves[e.key]) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      setCursor(([x, y]) => [Math.min(P.grid.x[1], Math.max(P.grid.x[0], x + dx)), Math.min(P.grid.y[1], Math.max(P.grid.y[0], y + dy))]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(cursor);
    } else if (e.key === 'Escape') {
      setStart(null);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      setBars(list => list.slice(0, -1));
      setChecked(false);
    }
  }

  function reset() {
    setBars([]);
    setStart(null);
    setMessage(null);
    setDeform(false);
    setChecked(false);
    setHint(-1);
  }

  const preview = start && hover && pointKey(start) !== pointKey(hover) ? [start, hover] as Bar : null;
  const previewOk = preview && bars.length < maxBars && canAddBar(preview, [...bars, ...P.deck], P.grid, P.max_length);
  const line = (bar: Bar, cls: string, key?: string, extra = {}) => {
    const [a, b] = deform ? [moved(bar[0]), moved(bar[1])] : bar;
    return <line key={key} x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} className={cls} {...extra} />;
  };
  const worst = analysis.stable ? Math.round(analysis.maxRatio * 100) : null;

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <p className="floorplan-help">{t.help}</p>
        <div className="drawing truss-drawing">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="truss-svg"
            role="group"
            aria-label={st.drawing}
            onPointerMove={e => setHover(toGrid(e))}
            onPointerLeave={() => setHover(null)}
          >
            <rect x={0} y={0} width={width} height={height} className="truss-sky" />
            {scene === 'ravine' ? (
              <>
                <rect x={X(P.grid.x[0])} y={Y(bottom + 0.35)} width={(P.grid.x[1] - P.grid.x[0]) * S} height={0.75 * S} className="truss-river" />
                <polygon points={`0,${Y(0)} ${X(P.grid.x[0])},${Y(0)} ${X(P.grid.x[0])},${height} 0,${height}`} className="truss-cliff" />
                <polygon points={`${X(P.grid.x[1])},${Y(0)} ${width},${Y(0)} ${width},${height} ${X(P.grid.x[1])},${height}`} className="truss-cliff" />
                <text x={X((P.grid.x[0] + P.grid.x[1]) / 2)} y={Y(bottom + 0.35) + 0.45 * S} textAnchor="middle" className="truss-span">
                  ← {(P.grid.x[1] - P.grid.x[0]) * P.unit} m →
                </text>
              </>
            ) : (
              <>
                <rect x={0} y={Y(0)} width={width} height={height - Y(0)} className="truss-ground" />
                <text x={X(P.grid.x[1]) + 0.5 * S} y={Y((P.grid.y[0] + P.grid.y[1]) / 2)} textAnchor="middle" transform={`rotate(-90 ${X(P.grid.x[1]) + 0.5 * S} ${Y((P.grid.y[0] + P.grid.y[1]) / 2)})`} className="truss-span">
                  ← {(P.grid.y[1] - P.grid.y[0]) * P.unit} m →
                </text>
              </>
            )}
            {points.map(p => <circle key={pointKey(p)} cx={X(p[0])} cy={Y(p[1])} r={3} className="truss-dot" />)}
            {showPattern && P.pattern!.map(b => line(b, 'truss-pattern', `pattern-${barKey(b)}`))}
            {P.deck.map(b => line(b, scene === 'ravine' ? 'truss-road' : 'truss-frame', `deck-${barKey(b)}`))}
            {bars.map(b => {
              const r = forceOf(b);
              const kind = !r ? 'idle' : r.ratio > 1 + 1e-9 ? 'broken' : r.force >= 0 ? 'tension' : 'compression';
              const strength = r ? Math.min(1, r.ratio) : 0;
              const [a, c] = deform ? [moved(b[0]), moved(b[1])] : b;
              return (
                <g key={barKey(b)} className={`truss-bar ${kind}`} onClick={() => removeBar(b)}>
                  <line x1={X(a[0])} y1={Y(a[1])} x2={X(c[0])} y2={Y(c[1])} className="truss-hit" />
                  <line x1={X(a[0])} y1={Y(a[1])} x2={X(c[0])} y2={Y(c[1])} className="truss-beam" style={{ strokeWidth: 4 + 5 * strength, opacity: 0.55 + 0.45 * strength }} />
                  {kind === 'broken' && <text x={(X(a[0]) + X(c[0])) / 2} y={(Y(a[1]) + Y(c[1])) / 2 + 6} textAnchor="middle" className="truss-x">✕</text>}
                  <title>{r ? `${Math.round(Math.abs(r.force))} kN · ${Math.round(r.ratio * 100)} %` : `${(length(b) * P.unit).toLocaleString(lang)} m`}</title>
                </g>
              );
            })}
            {preview && <line x1={X(preview[0][0])} y1={Y(preview[0][1])} x2={X(preview[1][0])} y2={Y(preview[1][1])} className={`truss-preview${previewOk ? '' : ' bad'}`} />}
            {P.supports.map(p => (
              <path
                key={`s-${pointKey(p)}`}
                d={scene === 'ground' ? `M${X(p[0])} ${Y(p[1])}l-8 12h16z` : `M${X(p[0])} ${Y(p[1])}l${p[0] <= P.grid.x[0] ? -12 : 12} -8v16z`}
                className="truss-support"
              />
            ))}
            {P.loads.map(p => {
              const [x, y] = deform ? moved(p) : p;
              // arrow of 26 px ending at the point, along the load direction (screen y points down)
              const ex = X(x) - ldx * 8, ey = Y(y) + ldy * 8, sx = ex - ldx * 26, sy = ey + ldy * 26;
              const hx = -ldx * 8, hy = ldy * 8, px = -ldy * 6, py = -ldx * 6;
              return <path key={`l-${pointKey(p)}`} d={`M${sx} ${sy}L${ex} ${ey}M${ex + hx + px} ${ey + hy + py}L${ex} ${ey}L${ex + hx - px} ${ey + hy - py}`} className="truss-load" />;
            })}
            <text x={X(P.grid.x[0])} y={Y(P.grid.y[1]) - 16} className="truss-truck">{scene === 'ravine' ? '🚚' : '🌬️'} {t.load(P.load_label?.[lang] ?? '', P.loads.length, P.load)}</text>
            {points.map(p => {
              const k = pointKey(p);
              const isStart = !!start && pointKey(start) === k;
              return (
                <circle
                  key={`hit-${k}`}
                  cx={X(p[0])} cy={Y(p[1])} r={22}
                  className={`truss-node${isStart ? ' start' : ''}${loose.has(k) ? ' loose' : ''}`}
                  onClick={() => pick(p)}
                />
              );
            })}
            <rect
              x={X(cursor[0]) - 15} y={Y(cursor[1]) - 15} width={30} height={30} rx={8}
              className="truss-cursor" tabIndex={0} role="button"
              aria-label={`${t.point(cursor[0], cursor[1])}${start && pointKey(start) === pointKey(cursor) ? `, ${t.start}` : ''}`}
              onKeyDown={onKey}
              onClick={() => pick(cursor)}
            />
          </svg>
        </div>
        <div className="truss-legend view-legend">
          <span><i className="swatch tension" />{t.legend.tension}</span>
          <span><i className="swatch compression" />{t.legend.compression}</span>
          <span><i className="swatch broken" />{t.legend.broken}</span>
          <span><i className="swatch road" />{st.given}</span>
        </div>
        <div className="metrics three">
          <div><small>{t.bars}</small><strong>{bars.length}{Number.isFinite(maxBars) && ` / ${maxBars}`}</strong></div>
          <div><small>{t.worst}</small><strong className={worst !== null && worst > 100 ? 'over' : ''}>{worst === null ? '—' : `${worst} %`}</strong></div>
          <div className="truss-actions">
            <button className="subtle" onClick={() => { setBars(list => list.slice(0, -1)); setChecked(false); }} disabled={!bars.length}><Undo2 size={16} />{t.undo}</button>
          </div>
        </div>
      </section>
      <aside className="controls">
        <h2>{t.title}</h2>
        <p className={`note ${analysis.stable ? (brokenCount ? 'warn' : 'truss-ok') : 'warn'}`} role="status">
          {!analysis.stable ? st.collapse : brokenCount ? t.broken(brokenCount, st.cause) : st.stable}
        </p>
        {message && <p className="note warn">{message}</p>}
        <label className="truss-toggle"><input type="checkbox" checked={deform} onChange={e => setDeform(e.target.checked)} disabled={!analysis.stable} /> {t.deform}</label>
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
          checkLabel={st.check}
        />
      </aside>
    </div>
  );
}
