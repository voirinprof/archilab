import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Eraser, Search } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { Cell, DistrictActivity } from './types.ts';
import type { Plots } from './rules.ts';
import { EMPTY, canPlace, evaluateDistrict, greenShare, heatMap, homeAccess, impermeableShare, initialPlots, isFixed, isNoisy, place, population } from './rules.ts';
import { Feedback, NeedsList } from '../../components/Feedback.tsx';

const ui = {
  fr: {
    mission: 'Ta mission', title: 'Ton plan de quartier', check: 'Inaugurer le quartier',
    help: 'Choisis un type de parcelle, puis touche ou glisse sur le terrain pour le poser. L’outil « Observer » montre les temps de marche d’un logement sans rien changer. Au clavier : flèches pour choisir une parcelle, chiffres pour le type (0 pour observer), Entrée pour poser, Suppr pour effacer.',
    palette: 'Parcelles', erase: 'Effacer', inspect: 'Observer', layers: 'Calque', layer: { none: 'Aucun', walk: 'À pied', noise: 'Bruit', heat: 'Chaleur' },
    population: 'Habitants', green: 'Espaces verts', sealed: 'Sol imperméable', served: 'Logements bien servis',
    plot: 'Parcelle', minutes: (m: number) => `${m} min`, unreachable: 'inaccessible', residents: (n: number) => `${n} habitants`,
    noisy: 'exposée au bruit', walkFrom: 'À pied depuis ce logement :', needsStreet: 'Un arrêt de bus doit toucher la rue principale.', fixed: 'Cette parcelle ne peut pas changer.',
    map: 'Plan du quartier', cell: (x: number, y: number, name: string) => `Parcelle ${x + 1}, ${y + 1} : ${name}`,
    legendWalk: (limit: number) => `vert : tout à ${limit} min ou moins · rouge : un service trop loin`, legendNoise: 'rouge : bruit de la voie rapide', legendHeat: 'plus foncé : plus chaud en été',
  },
  en: {
    mission: 'Your mission', title: 'Your neighbourhood plan', check: 'Open the neighbourhood',
    help: 'Pick a kind of plot, then tap or drag on the land to place it. The Inspect tool shows a home’s walking times without changing anything. With a keyboard: arrows to pick a plot, numbers for the kind (0 to inspect), Enter to place, Delete to clear.',
    palette: 'Plots', erase: 'Clear', inspect: 'Inspect', layers: 'Layer', layer: { none: 'None', walk: 'On foot', noise: 'Noise', heat: 'Heat' },
    population: 'Residents', green: 'Green space', sealed: 'Sealed ground', served: 'Well-served homes',
    plot: 'Plot', minutes: (m: number) => `${m} min`, unreachable: 'unreachable', residents: (n: number) => `${n} residents`,
    noisy: 'exposed to noise', walkFrom: 'On foot from this home:', needsStreet: 'A bus stop must touch the main street.', fixed: 'This plot can’t change.',
    map: 'Neighbourhood plan', cell: (x: number, y: number, name: string) => `Plot ${x + 1}, ${y + 1}: ${name}`,
    legendWalk: (limit: number) => `green: everything within ${limit} min · red: a service too far`, legendNoise: 'red: motorway noise', legendHeat: 'darker: hotter in summer',
  },
};

const C = 56;
/** Tool that only selects a plot to see its details. */
const INSPECT = '__inspect';
const PAD = 8;
type Layer = 'none' | 'walk' | 'noise' | 'heat';

/** District engine: paint plots on a grid; walking distances to services, noise, heat, density and green space are worked out live. */
export function DistrictGame({ game, lang }: { game: DistrictActivity; lang: Lang }) {
  const t = ui[lang];
  const p = game.parameters;
  const palette = p.tiles.filter(tl => !tl.fixed);
  const [plots, setPlots] = useState<Plots>(() => initialPlots(p));
  const [tool, setTool] = useState<string | null>(palette[0].id);
  const [layer, setLayer] = useState<Layer>('walk');
  const [cursor, setCursor] = useState<Cell>([0, 1]);
  const [message, setMessage] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);
  const painting = useRef(false);

  const access = game.constraints.find(c => c.type === 'services_within');
  const services = access?.type === 'services_within' ? access.services : [];
  const limit = access?.type === 'services_within' ? access.value : Infinity;
  const result = evaluateDistrict(game.constraints, p, plots);
  const homeInfo = new Map(homeAccess(p, plots, services).map(h => [h.cell.join(','), h]));
  const worst = (key: string) => { const h = homeInfo.get(key); return h ? Math.max(...Object.values(h.distances)) : null; };
  const served = [...homeInfo.keys()].filter(k => (worst(k) ?? Infinity) <= limit).length;
  const heat = heatMap(p, plots);
  const target = game.constraints.find(c => c.type === 'min_population');
  const typeOf = (id: string | null) => (id ? p.tiles.find(tl => tl.id === id) ?? EMPTY : EMPTY);
  const minutes = (plotsAway: number) => Math.round(plotsAway * p.minutes_per_plot);

  function paint(cell: Cell, type: string | null = tool) {
    setCursor(cell);
    if (type === INSPECT) return setMessage(null);
    if (isFixed(p, cell)) return setMessage(t.fixed);
    if (!canPlace(p, plots, cell, type)) return setMessage(t.needsStreet);
    setPlots(current => place(p, current, cell, type));
    setMessage(null);
    setChecked(false);
  }

  function onKey(e: KeyboardEvent) {
    const moves: Record<string, Cell> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      setCursor(([x, y]) => [Math.min(p.grid.width - 1, Math.max(0, x + moves[e.key][0])), Math.min(p.grid.height - 1, Math.max(0, y + moves[e.key][1]))]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      paint(cursor);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      paint(cursor, null);
    } else if (e.key === '0') {
      setTool(INSPECT);
    } else if (/^[1-9]$/.test(e.key) && palette[Number(e.key) - 1]) {
      setTool(palette[Number(e.key) - 1].id);
    }
  }

  function reset() {
    setPlots(initialPlots(p));
    setMessage(null);
    setChecked(false);
    setHint(-1);
  }

  const cursorKey = cursor.join(',');
  const cursorType = typeOf(plots[cursor[1]][cursor[0]]);
  const cursorHome = homeInfo.get(cursorKey);
  const width = p.grid.width * C + 2 * PAD, height = p.grid.height * C + 2 * PAD;
  const pct = (v: number) => `${Math.round(v * 100)} %`;

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <p className="floorplan-help">{t.help}</p>
        <div className="district-palette" role="radiogroup" aria-label={t.palette}>
          <button role="radio" aria-checked={tool === INSPECT} className={`inspect${tool === INSPECT ? ' active' : ''}`} onClick={() => setTool(INSPECT)}><Search size={14} />{t.inspect}</button>
          {palette.map((tl, i) => (
            <button key={tl.id} role="radio" aria-checked={tool === tl.id} className={tool === tl.id ? 'active' : ''} onClick={() => setTool(tl.id)}>
              <span className="swatch" style={{ background: tl.color }} aria-hidden="true">{tl.icon}</span>{i + 1}. {tl.label[lang]}
            </button>
          ))}
          <button role="radio" aria-checked={tool === null} className={tool === null ? 'active' : ''} onClick={() => setTool(null)}><Eraser size={14} />{t.erase}</button>
        </div>
        <div className="drawing district-drawing">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="district-svg"
            role="group"
            aria-label={t.map}
            onPointerUp={() => { painting.current = false; }}
            onPointerLeave={() => { painting.current = false; }}
          >
            {plots.map((row, y) => row.map((id, x) => {
              const tl = typeOf(id);
              const key = `${x},${y}`;
              const w = worst(key);
              const noisy = layer === 'noise' && !tl.fixed && isNoisy(p, plots, [x, y]);
              return (
                <g
                  key={key}
                  className={`district-cell ${tl.id}${tl.fixed ? ' fixed' : ''}`}
                  onPointerDown={e => { e.preventDefault(); painting.current = true; (e.target as Element).releasePointerCapture?.(e.pointerId); paint([x, y]); }}
                  onPointerEnter={() => { if (painting.current) paint([x, y]); }}
                >
                  <rect x={PAD + x * C + 1} y={PAD + y * C + 1} width={C - 2} height={C - 2} rx={tl.fixed ? 0 : 6} fill={tl.color} />
                  {tl.id === 'street' && <line x1={PAD + x * C} y1={PAD + y * C + C / 2} x2={PAD + x * C + C} y2={PAD + y * C + C / 2} className="district-lane" />}
                  {tl.icon && <text x={PAD + x * C + C / 2} y={PAD + y * C + C / 2 + 8} textAnchor="middle" className="district-icon">{tl.icon}</text>}
                  {layer === 'heat' && <rect x={PAD + x * C + 1} y={PAD + y * C + 1} width={C - 2} height={C - 2} rx={6} className="district-heat" style={{ opacity: Math.min(0.75, heat[y][x] / 4) }} />}
                  {noisy && <rect x={PAD + x * C + 1} y={PAD + y * C + 1} width={C - 2} height={C - 2} rx={6} className="district-noise" />}
                  {layer === 'walk' && w !== null && (
                    <g className={`district-badge ${w <= limit ? 'ok' : 'far'}`}>
                      <rect x={PAD + x * C + 4} y={PAD + y * C + C - 20} width={C - 8} height={16} rx={8} />
                      <text x={PAD + x * C + C / 2} y={PAD + y * C + C - 8} textAnchor="middle">{Number.isFinite(w) ? t.minutes(minutes(w)) : '∞'}</text>
                    </g>
                  )}
                </g>
              );
            }))}
            <rect
              x={PAD + cursor[0] * C + 1} y={PAD + cursor[1] * C + 1} width={C - 2} height={C - 2} rx={6}
              className="district-cursor" tabIndex={0} role="button"
              aria-label={t.cell(cursor[0], cursor[1], cursorType.label[lang])}
              onKeyDown={onKey}
            />
          </svg>
        </div>
        <div className="district-layers" role="radiogroup" aria-label={t.layers}>
          <span>{t.layers} :</span>
          {(['none', 'walk', 'noise', 'heat'] as Layer[]).map(l => (
            <button key={l} role="radio" aria-checked={layer === l} className={layer === l ? 'active' : ''} onClick={() => setLayer(l)}>{t.layer[l]}</button>
          ))}
          <small>{layer === 'walk' ? t.legendWalk(minutes(limit)) : layer === 'noise' ? t.legendNoise : layer === 'heat' ? t.legendHeat : ''}</small>
        </div>
        <div className="metrics district-metrics">
          <div><small>{t.population}</small><strong>{population(p, plots)}{target?.type === 'min_population' && ` / ${target.value}`}</strong></div>
          <div><small>{t.green}</small><strong>{pct(greenShare(p, plots))}</strong></div>
          <div><small>{t.sealed}</small><strong>{pct(impermeableShare(p, plots))}</strong></div>
          <div><small>{t.served}</small><strong>{served} / {homeInfo.size}</strong></div>
        </div>
      </section>
      <aside className="controls">
        <h2>{t.title}</h2>
        <div className="room-editor district-detail" aria-live="polite">
          <div className="control-label"><span>{t.plot} {cursor[0] + 1}, {cursor[1] + 1} : {cursorType.label[lang]}</span>{cursorType.residents ? <strong>{t.residents(cursorType.residents)}</strong> : null}</div>
          {cursorHome && (
            <>
              <p>{t.walkFrom}{isNoisy(p, plots, cursor) && <em className="district-warn"> · {t.noisy}</em>}</p>
              <ul>
                {services.map(s => {
                  const d = cursorHome.distances[s];
                  return <li key={s} className={d <= limit ? 'ok' : 'far'}>{typeOf(s).icon} {typeOf(s).label[lang]} : {Number.isFinite(d) ? t.minutes(minutes(d)) : t.unreachable}</li>;
                })}
              </ul>
            </>
          )}
        </div>
        {message && <p className="note warn">{message}</p>}
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
          checkLabel={t.check}
        />
      </aside>
    </div>
  );
}
