import { useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { ArrowRight, Eraser, Minus, Plus, RotateCw } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { BlocksActivity, Heights } from './types.ts';
import type { CellStatus } from './rules.ts';
import { blockCount, compareProfile, compareTop, eastView, emptyHeights, evaluateBlocks, rotateHeights, southView } from './rules.ts';
import { Isometric } from './Isometric.tsx';
import { Feedback, NeedsList } from '../../components/Feedback.tsx';

const ui = {
  fr: {
    mission: 'Ta mission', build: 'À toi de construire', check: 'Vérifier ma construction', rules: 'Ce qui doit correspondre',
    help: 'Clique sur une case du plan pour poser un bloc ; Maj + clic (ou le mode « Retirer ») pour en enlever. Au clavier : flèches pour choisir une case, + et − pour changer la hauteur.',
    add: 'Ajouter', remove: 'Retirer', rotateView: 'Tourner la vue', clear: 'Vider ce bâtiment', next: 'Bâtiment suivant',
    drawings: 'Les dessins de l’architecte', top: 'Plan (vue de dessus)', south: 'Façade sud', east: 'Façade est',
    legend: { match: 'correspond', missing: 'manque', extra: 'en trop' },
    blocks: 'Blocs posés', done: 'Bâtiments réussis', modelDone: 'Bâtiment réussi : les trois vues correspondent !',
    yourBuild: 'Ta construction en 3D', editor: 'Plan de construction', building: 'Bâtiment',
    sides: { north: 'N', east: 'E', south: 'S', west: 'O' },
    cell: (col: string, row: number, h: number) => `Case ${col}${row}, ${h} bloc${h > 1 ? 's' : ''}`,
  },
  en: {
    mission: 'Your mission', build: 'Time to build', check: 'Check my building', rules: 'What must match',
    help: 'Click a cell of the plan to add a block; Shift + click (or Remove mode) to take one away. With a keyboard: arrows to pick a cell, + and − to change the height.',
    add: 'Add', remove: 'Remove', rotateView: 'Turn the view', clear: 'Clear this building', next: 'Next building',
    drawings: 'The architect’s drawings', top: 'Plan (top view)', south: 'South façade', east: 'East façade',
    legend: { match: 'matches', missing: 'missing', extra: 'too much' },
    blocks: 'Blocks placed', done: 'Buildings done', modelDone: 'Building done: all three views match!',
    yourBuild: 'Your building in 3D', editor: 'Building plan', building: 'Building',
    sides: { north: 'N', east: 'E', south: 'S', west: 'W' },
    cell: (col: string, row: number, h: number) => `Cell ${col}${row}, ${h} block${h > 1 ? 's' : ''}`,
  },
};

const CELL = 22;
const COLUMNS = 'ABCDEFGHIJ';

/** A drawing of one view: a grid of cells coloured by their comparison status. */
function ViewGrid({ title, cells, caption }: { title: string; cells: CellStatus[][]; caption?: [string, string] }) {
  // cells[col][row]: columns left to right, rows top to bottom
  const cols = cells.length, rows = cells[0].length;
  return (
    <figure className="view-grid">
      <figcaption>{title}</figcaption>
      <svg viewBox={`-2 -2 ${cols * CELL + 4} ${rows * CELL + (caption ? 18 : 4)}`} role="img" aria-label={title}>
        {cells.map((col, i) => col.map((s, j) => (
          <rect key={`${i}:${j}`} x={i * CELL + 1} y={j * CELL + 1} width={CELL - 2} height={CELL - 2} rx="3" className={`view-cell ${s}`} />
        )))}
        {caption && (
          <>
            <text x={0} y={rows * CELL + 13} className="view-caption">{caption[0]}</text>
            <text x={cols * CELL} y={rows * CELL + 13} textAnchor="end" className="view-caption">{caption[1]}</text>
          </>
        )}
      </svg>
    </figure>
  );
}

/** Blocks engine: rebuild a building from its plan and two façades by stacking cubes on a grid. */
export function BlocksGame({ game, lang }: { game: BlocksActivity; lang: Lang }) {
  const t = ui[lang];
  const { grid, max_height: maxHeight, models } = game.parameters;
  const fresh = () => models.map(() => emptyHeights(grid.width, grid.depth));
  const [builds, setBuilds] = useState<Heights[]>(fresh);
  const [current, setCurrent] = useState(0);
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [turns, setTurns] = useState(0);
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const model = models[current];
  const built = builds[current];
  const results = models.map((m, i) => evaluateBlocks(game.constraints, builds[i], m.heights));
  const result = results[current];
  const solvedCount = results.filter(r => r.solved).length;
  const allSolved = solvedCount === models.length;
  const revealAt = game.parameters.reveal_model_hint;
  const showGhost = revealAt !== undefined && hint + 1 >= revealAt;

  function change(x: number, y: number, delta: number) {
    setBuilds(all => all.map((h, i) => (i !== current ? h : h.map((row, yy) => row.map((n, xx) => (xx === x && yy === y ? Math.max(0, Math.min(maxHeight, n + delta)) : n))))));
    setChecked(false);
  }

  function onCellClick(e: MouseEvent, x: number, y: number) {
    setFocus([x, y]);
    change(x, y, e.shiftKey || mode === 'remove' ? -1 : 1);
  }

  function onCellKey(e: KeyboardEvent, x: number, y: number) {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[e.key]) {
      e.preventDefault();
      const nx = Math.max(0, Math.min(grid.width - 1, x + moves[e.key][0])), ny = Math.max(0, Math.min(grid.depth - 1, y + moves[e.key][1]));
      setFocus([nx, ny]);
      cellRefs.current[ny * grid.width + nx]?.focus();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      change(x, y, 1);
    } else if (e.key === '-' || e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      change(x, y, -1);
    }
  }

  function reset() {
    setBuilds(fresh());
    setCurrent(0);
    setTurns(0);
    setChecked(false);
    setHint(-1);
  }

  const southCells = compareProfile(southView(built), southView(model.heights), maxHeight).map(col => [...col].reverse());
  // seen from the east, south is on the left and north on the right
  const eastCells = compareProfile(eastView(built), eastView(model.heights), maxHeight).map(col => [...col].reverse()).reverse();
  const topStatus = compareTop(built, model.heights);
  const topCells = topStatus[0].map((_, x) => topStatus.map(row => row[x]));

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <p className="floorplan-help">{t.help}</p>
        <div className="model-tabs" role="group" aria-label={t.building}>
          {models.map((m, i) => (
            <button key={m.id} className={i === current ? 'active' : ''} aria-pressed={i === current} onClick={() => { setCurrent(i); setChecked(false); }}>
              {i + 1}. {m.label[lang]}{results[i].solved && ' ✓'}
            </button>
          ))}
        </div>
        <div className="blocks-stage">
          <div className="drawing iso-box">
            <Isometric
              heights={rotateHeights(built, turns)}
              ghost={showGhost ? rotateHeights(model.heights, turns) : undefined}
              maxHeight={maxHeight}
              turns={turns}
              sideLabels={t.sides}
              label={t.yourBuild}
            />
            <button className="subtle iso-turn" onClick={() => setTurns(n => (n + 1) % 4)}><RotateCw size={16} />{t.rotateView}</button>
          </div>
          <div className="block-editor">
            <div className="editor-head">
              <span>{t.editor}</span>
              <div className="mode-switch" role="group">
                <button className={mode === 'add' ? 'active' : ''} aria-pressed={mode === 'add'} onClick={() => setMode('add')}><Plus size={15} />{t.add}</button>
                <button className={mode === 'remove' ? 'active' : ''} aria-pressed={mode === 'remove'} onClick={() => setMode('remove')}><Minus size={15} />{t.remove}</button>
              </div>
            </div>
            <div className="editor-compass top">{t.sides.north}</div>
            <div className="editor-row">
              <span className="editor-compass">{t.sides.west}</span>
              <div className="editor-grid" style={{ gridTemplateColumns: `repeat(${grid.width}, 1fr)` }}>
                {built.map((row, y) => row.map((n, x) => (
                  <button
                    key={`${x}:${y}`}
                    ref={el => { cellRefs.current[y * grid.width + x] = el; }}
                    className={`editor-cell h${n}`}
                    tabIndex={focus[0] === x && focus[1] === y ? 0 : -1}
                    aria-label={t.cell(COLUMNS[x], y + 1, n)}
                    onClick={e => onCellClick(e, x, y)}
                    onKeyDown={e => onCellKey(e, x, y)}
                  >
                    {n > 0 ? n : ''}
                  </button>
                )))}
              </div>
              <span className="editor-compass">{t.sides.east}</span>
            </div>
            <div className="editor-compass">{t.sides.south}</div>
            <button className="subtle full" onClick={() => { setBuilds(all => all.map((h, i) => (i === current ? emptyHeights(grid.width, grid.depth) : h))); setChecked(false); }}><Eraser size={16} />{t.clear}</button>
          </div>
        </div>
        <div className="metrics">
          <div><small>{t.blocks}</small><strong>{blockCount(built)}</strong></div>
          <div><small>{t.done}</small><strong>{solvedCount} / {models.length}</strong></div>
        </div>
      </section>
      <aside className="controls">
        <h2>{t.drawings}</h2>
        <div className="views">
          <ViewGrid title={t.top} cells={topCells} />
          <ViewGrid title={t.south} cells={southCells} caption={[t.sides.west, t.sides.east]} />
          <ViewGrid title={t.east} cells={eastCells} caption={[t.sides.south, t.sides.north]} />
        </div>
        <div className="view-legend">
          <span><i className="view-cell match" />{t.legend.match}</span>
          <span><i className="view-cell missing" />{t.legend.missing}</span>
          <span><i className="view-cell extra" />{t.legend.extra}</span>
        </div>
        <NeedsList lang={lang} title={t.rules} items={game.constraints.map((c, i) => ({ label: c.label[lang], ok: result.constraints[i] }))} />
        {result.solved && !allSolved && (
          <div className="note model-done" role="status">
            <strong>{t.modelDone}</strong>
            {current < models.length - 1 && <button className="subtle full" onClick={() => { setCurrent(current + 1); setChecked(false); }}>{t.next}<ArrowRight size={16} /></button>}
          </div>
        )}
        <Feedback
          game={game}
          lang={lang}
          solved={allSolved}
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
