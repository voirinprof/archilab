import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { CheckCircle2, Circle, Lightbulb, Minus, Plus, RotateCcw, XCircle } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { FloorplanActivity, PlacedRoom, Rect, RoomSpec } from './types.ts';
import { area, canPlace, clamp, clampPosition, evaluate, hasValidSize, initialLayout } from './rules.ts';

const ui = {
  fr: {
    mission: 'Ta mission', design: 'À toi d’aménager', help: 'Glisse une pièce pour la déplacer et tire sa poignée ◢ pour l’agrandir. Au clavier : flèches pour déplacer, Maj + flèches pour redimensionner.',
    selected: 'Pièce sélectionnée', width: 'Largeur', depth: 'Profondeur', more: 'Agrandir', less: 'Réduire',
    home: 'Logement', rooms: 'Pièces', free: 'Circulation', needs: 'Besoins des occupants',
    inside: 'Toutes les pièces restent dans le logement.', noOverlap: 'Aucune pièce ne se chevauche.',
    blocked: 'Pas de place ici : une pièce ne peut ni sortir du logement ni en chevaucher une autre.',
    check: 'Vérifier mon plan', hint: 'Un indice', reset: 'Recommencer', success: 'Mission accomplie !', retry: 'Pas encore !',
    principle: 'Le principe', concepts: 'Notions explorées', south: 'SUD', north: 'N', remaining: (n: number) => `${n} besoin${n > 1 ? 's' : ''} à résoudre`,
    plan: 'Plan du logement',
  },
  en: {
    mission: 'Your mission', design: 'Time to lay it out', help: 'Drag a room to move it and pull its ◢ handle to resize it. With a keyboard: arrows to move, Shift + arrows to resize.',
    selected: 'Selected room', width: 'Width', depth: 'Depth', more: 'Enlarge', less: 'Shrink',
    home: 'Home', rooms: 'Rooms', free: 'Circulation', needs: 'Occupants’ needs',
    inside: 'Every room stays inside the home.', noOverlap: 'No rooms overlap.',
    blocked: 'No room here: a room can’t leave the home or overlap another one.',
    check: 'Check my plan', hint: 'Get a hint', reset: 'Start over', success: 'Mission complete!', retry: 'Not quite!',
    principle: 'The idea', concepts: 'Concepts explored', south: 'SOUTH', north: 'N', remaining: (n: number) => `${n} need${n > 1 ? 's' : ''} left to meet`,
    plan: 'Home floor plan',
  },
};

const SCALE = 40;
const PAD = 36;
const HANDLE = 22;
const palette: Record<string, { fill: string; stroke: string }> = {
  yellow: { fill: '#f4e2a1', stroke: '#b8953a' },
  coral: { fill: '#f2c9b4', stroke: '#b9765a' },
  blue: { fill: '#c9dcea', stroke: '#5b819d' },
  mint: { fill: '#cfe5da', stroke: '#5f9480' },
};
const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

type Drag = { id: string; mode: 'move' | 'resize'; startX: number; startY: number; origin: Rect };

export function FloorplanGame({ game, lang }: { game: FloorplanActivity; lang: Lang }) {
  const t = ui[lang];
  const { plan, rooms } = game.parameters;
  const [layout, setLayout] = useState<PlacedRoom[]>(() => initialLayout(rooms));
  const [selected, setSelected] = useState<string>(rooms[0].id);
  const [ghost, setGhost] = useState<Rect | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);

  const specOf = (id: string): RoomSpec => rooms.find(r => r.id === id)!;
  const rectOf = (id: string): PlacedRoom => layout.find(r => r.id === id)!;
  const result = evaluate(game.constraints, layout, plan);
  const remaining = result.constraints.filter(ok => !ok).length + (result.inside ? 0 : 1) + (result.noOverlap ? 0 : 1);
  const roomsArea = layout.reduce((sum, r) => sum + area(r), 0);

  function place(id: string, rect: Rect): boolean {
    if (!hasValidSize(rect, specOf(id)) || !canPlace(layout, id, rect, plan)) return false;
    setLayout(current => current.map(r => (r.id === id ? { ...r, ...rect } : r)));
    setChecked(false);
    return true;
  }

  function tryPlace(id: string, rect: Rect) {
    setBlocked(!place(id, rect));
  }

  function reset() {
    setLayout(initialLayout(rooms));
    setSelected(rooms[0].id);
    setGhost(null);
    setBlocked(false);
    setChecked(false);
    setHint(-1);
  }

  function toMetres(e: PointerEvent): { x: number; y: number } | null {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: (p.x - PAD) / SCALE, y: (p.y - PAD) / SCALE };
  }

  function startDrag(e: PointerEvent, id: string, mode: Drag['mode']) {
    const p = toMetres(e);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(id);
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { id, mode, startX: p.x, startY: p.y, origin: rectOf(id) };
  }

  function moveDrag(e: PointerEvent) {
    const d = drag.current;
    const p = d && toMetres(e);
    if (!d || !p) return;
    const dx = Math.round(p.x - d.startX);
    const dy = Math.round(p.y - d.startY);
    const o = d.origin;
    const spec = specOf(d.id);
    const candidate: Rect = d.mode === 'move'
      ? clampPosition({ ...o, x: o.x + dx, y: o.y + dy }, plan)
      : {
          ...o,
          width: clamp(o.width + dx, { min: spec.width.min, max: Math.min(spec.width.max, plan.width - o.x) }),
          depth: clamp(o.depth + dy, { min: spec.depth.min, max: Math.min(spec.depth.max, plan.depth - o.y) }),
        };
    const current = rectOf(d.id);
    if (candidate.x === current.x && candidate.y === current.y && candidate.width === current.width && candidate.depth === current.depth) {
      setGhost(null);
      return;
    }
    const ok = place(d.id, candidate);
    setGhost(ok ? null : candidate);
    setBlocked(!ok);
  }

  function endDrag() {
    drag.current = null;
    setGhost(null);
  }

  function onKey(e: KeyboardEvent, id: string) {
    const delta = arrows[e.key];
    if (!delta) return;
    e.preventDefault();
    const r = rectOf(id);
    const [dx, dy] = delta;
    tryPlace(id, e.shiftKey ? { ...r, width: r.width + dx, depth: r.depth + dy } : { ...r, x: r.x + dx, y: r.y + dy });
  }

  const sel = rectOf(selected);
  const selSpec = specOf(selected);
  const viewW = plan.width * SCALE + PAD * 2;
  const viewH = plan.depth * SCALE + PAD * 2;
  const px = (m: number) => PAD + m * SCALE;

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <p className="floorplan-help">{t.help}</p>
        <div className="drawing">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${viewW} ${viewH}`}
            className="floorplan-svg"
            role="group"
            aria-label={`${t.plan} ${plan.width} m × ${plan.depth} m`}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <defs>
              <pattern id="fp-grid" x={PAD} y={PAD} width={SCALE} height={SCALE} patternUnits="userSpaceOnUse">
                <path d={`M${SCALE} 0H0V${SCALE}`} fill="none" stroke="#8caaa6" strokeWidth=".8" opacity=".35" />
              </pattern>
            </defs>
            <rect x={px(0)} y={px(0)} width={plan.width * SCALE} height={plan.depth * SCALE} fill="#fbfaf6" />
            <rect x={px(0)} y={px(0)} width={plan.width * SCALE} height={plan.depth * SCALE} fill="url(#fp-grid)" />
            <rect x={px(0)} y={px(0)} width={plan.width * SCALE} height={plan.depth * SCALE} fill="none" stroke="#37545b" strokeWidth="6" />
            <text x={viewW / 2} y={PAD - 14} textAnchor="middle" className="fp-dim">{plan.width} m</text>
            <text x={viewW - PAD + 18} y={viewH / 2} transform={`rotate(90 ${viewW - PAD + 18} ${viewH / 2})`} textAnchor="middle" className="fp-dim">{plan.depth} m</text>
            <text x={PAD - 18} y={PAD - 12} textAnchor="middle" className="fp-compass">↑ {t.north}</text>
            <text x={viewW / 2} y={viewH - 10} textAnchor="middle" className="fp-sun">☀ {t.south}</text>
            {layout.map(r => {
              const spec = specOf(r.id);
              const colors = palette[spec.color] ?? palette.blue;
              const isSel = r.id === selected;
              const x = px(r.x), y = px(r.y), w = r.width * SCALE, h = r.depth * SCALE;
              const small = w < 3 * SCALE;
              return (
                <g
                  key={r.id}
                  className={`fp-room${isSel ? ' selected' : ''}`}
                  tabIndex={0}
                  role="button"
                  aria-label={`${spec.label[lang]}, ${r.width} m × ${r.depth} m, ${area(r)} m²`}
                  onPointerDown={e => startDrag(e, r.id, 'move')}
                  onFocus={() => setSelected(r.id)}
                  onKeyDown={e => onKey(e, r.id)}
                >
                  <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx="4" fill={colors.fill} stroke={isSel ? '#142e37' : colors.stroke} strokeWidth={isSel ? 3.5 : 2} />
                  <text x={x + w / 2} y={y + h / 2 - 4} textAnchor="middle" className="fp-label" fontSize={small ? 10 : 13}>{spec.label[lang]}</text>
                  <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" className="fp-area" fontSize={small ? 11 : 14}>{area(r)} m²</text>
                  {isSel && (
                    <path
                      className="fp-handle"
                      d={`M${x + w - 3} ${y + h - 3 - HANDLE}V${y + h - 3}H${x + w - 3 - HANDLE}Z`}
                      onPointerDown={e => startDrag(e, r.id, 'resize')}
                    />
                  )}
                </g>
              );
            })}
            {ghost && <rect x={px(ghost.x) + 2} y={px(ghost.y) + 2} width={ghost.width * SCALE - 4} height={ghost.depth * SCALE - 4} rx="4" className="fp-ghost" />}
          </svg>
        </div>
        <div className="metrics three">
          <div><small>{t.home}</small><strong>{plan.width * plan.depth} m²</strong></div>
          <div><small>{t.rooms}</small><strong>{roomsArea} m²</strong></div>
          <div><small>{t.free}</small><strong>{plan.width * plan.depth - roomsArea} m²</strong></div>
        </div>
      </section>
      <aside className="controls">
        <h2>{t.design}</h2>
        <div className="room-chips" role="group" aria-label={t.selected}>
          {rooms.map(room => (
            <button key={room.id} className={room.id === selected ? 'active' : ''} aria-pressed={room.id === selected} onClick={() => setSelected(room.id)}>
              <span style={{ background: (palette[room.color] ?? palette.blue).fill }} />{room.label[lang]}
            </button>
          ))}
        </div>
        <div className="room-editor">
          <div className="control-label"><span>{selSpec.label[lang]}</span><strong>{area(sel)} m²</strong></div>
          {(['width', 'depth'] as const).map(k => (
            <div className="stepper" key={k}>
              <span>{t[k]}</span>
              <button aria-label={`${t.less} (${t[k].toLowerCase()})`} disabled={sel[k] <= selSpec[k].min} onClick={() => tryPlace(selected, { ...sel, [k]: sel[k] - 1 })}><Minus size={16} /></button>
              <strong>{sel[k]} m</strong>
              <button aria-label={`${t.more} (${t[k].toLowerCase()})`} disabled={sel[k] >= selSpec[k].max} onClick={() => tryPlace(selected, { ...sel, [k]: sel[k] + 1 })}><Plus size={16} /></button>
            </div>
          ))}
        </div>
        {blocked && <div className="note warn" role="status">{t.blocked}</div>}
        <div className="needs">
          <div className="needs-head"><span>{t.needs}</span><small>{remaining === 0 ? '✓' : t.remaining(remaining)}</small></div>
          <ul>
            <li className={result.inside ? 'ok' : ''}>{result.inside ? <CheckCircle2 size={18} /> : <Circle size={18} />}{t.inside}</li>
            <li className={result.noOverlap ? 'ok' : ''}>{result.noOverlap ? <CheckCircle2 size={18} /> : <Circle size={18} />}{t.noOverlap}</li>
            {game.constraints.map((c, i) => (
              <li key={i} className={result.constraints[i] ? 'ok' : ''}>{result.constraints[i] ? <CheckCircle2 size={18} /> : <Circle size={18} />}{c.label[lang]}</li>
            ))}
          </ul>
        </div>
        <button className="primary full" onClick={() => setChecked(true)}><CheckCircle2 size={18} />{t.check}</button>
        <button className="subtle full" onClick={() => setHint(h => Math.min(h + 1, game.hints[lang].length - 1))}><Lightbulb size={17} />{t.hint}{hint >= 0 && ` (${hint + 1}/${game.hints[lang].length})`}</button>
        {hint >= 0 && <div className="note">{game.hints[lang][hint]}</div>}
        {checked && (
          <div className={`result ${result.solved ? 'won' : 'try'}`} role="status">
            {result.solved ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
            <div><strong>{result.solved ? t.success : t.retry}</strong><p>{result.solved ? game.feedback.success[lang] : game.feedback.failure[lang]}</p></div>
          </div>
        )}
        {checked && result.solved && <div className="note principle"><strong>{t.principle}</strong><p>{game.explanation[lang]}</p></div>}
        <button className="subtle full" onClick={reset}><RotateCcw size={17} />{t.reset}</button>
        <div className="concepts"><span>{t.concepts}</span><div>{game.concepts[lang].map(c => <em key={c}>{c}</em>)}</div></div>
      </aside>
    </div>
  );
}
