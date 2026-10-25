import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { Dependency, SequenceActivity } from './types.ts';
import { evaluateSequence, moveItem, respected, simulate } from './rules.ts';
import { HouseIllustration } from './HouseIllustration.tsx';
import { Feedback, NeedsList } from '../../components/Feedback.tsx';

const ui = {
  fr: {
    mission: 'Ta mission', title: 'Le planning', run: 'Lancer le chantier',
    help: 'Glisse les cartes par la poignée ⋮⋮, ou utilise les flèches ▲▼. Au clavier : sélectionne une carte avec Tab, puis déplace-la avec les flèches haut et bas.',
    up: 'Monter', down: 'Descendre', links: 'Liens logiques respectés', step: (n: number, total: number) => `Étape ${n} sur ${total}`,
    idle: 'Le terrain est prêt. Remets les étapes dans l’ordre, puis lance le chantier !', running: 'Chantier en cours…',
    blocked: (step: string) => `Le chantier s’arrête à l’étape « ${step} ».`, finished: 'Le chantier est terminé : la maison est construite !',
    drawing: 'La maison en construction', goal: 'Objectif', missing: (step: string) => `Il faut d’abord : ${step}.`,
  },
  en: {
    mission: 'Your mission', title: 'The schedule', run: 'Start the building site',
    help: 'Drag the cards by their ⋮⋮ handle, or use the ▲▼ arrows. With a keyboard: pick a card with Tab, then move it with the up and down arrows.',
    up: 'Move up', down: 'Move down', links: 'Logical links respected', step: (n: number, total: number) => `Stage ${n} of ${total}`,
    idle: 'The plot is ready. Put the stages in order, then start the site!', running: 'Site in progress…',
    blocked: (step: string) => `The site stops at « ${step} ».`, finished: 'The site is finished: the house is built!',
    drawing: 'The house being built', goal: 'Goal', missing: (step: string) => `First you need: ${step}.`,
  },
};

type Run = { shown: number; done: number; blockedBy: Dependency | null; over: boolean };

/** Sequence engine: put steps in an order that respects their dependencies, then watch the process run step by step. */
export function SequenceGame({ game, lang }: { game: SequenceActivity; lang: Lang }) {
  const t = ui[lang];
  const { steps, dependencies, initial_order: initialOrder } = game.parameters;
  const [order, setOrder] = useState<string[]>(initialOrder);
  const [run, setRun] = useState<Run | null>(null);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);
  const cardRefs = useRef<(HTMLLIElement | null)[]>([]);
  const dragging = useRef<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const stepOf = (id: string) => steps.find(s => s.id === id)!;
  const ok = respected(order, dependencies);
  const result = evaluateSequence(game.constraints, order, dependencies);

  // the site is built one stage at a time, then stops at the first impossible stage
  useEffect(() => {
    if (!run || run.over) return;
    const id = window.setTimeout(() => {
      setRun(r => (r && r.shown < r.done ? { ...r, shown: r.shown + 1 } : r && { ...r, over: true }));
    }, 450);
    return () => window.clearTimeout(id);
  }, [run]);
  useEffect(() => { if (run?.over) setChecked(true); }, [run?.over]);
  useEffect(() => {
    if (focusId) cardRefs.current[order.indexOf(focusId)]?.focus();
  }, [order, focusId]);

  function change(next: string[]) {
    setOrder(next);
    setRun(null);
    setChecked(false);
  }

  function start() {
    const sim = simulate(order, dependencies);
    setChecked(false);
    setRun({ shown: 0, done: sim.done, blockedBy: sim.blockedBy, over: false });
  }

  function onKey(e: KeyboardEvent, i: number) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    setFocusId(order[i]);
    change(moveItem(order, i, e.key === 'ArrowUp' ? i - 1 : i + 1));
  }

  function onPointerMove(e: PointerEvent) {
    const id = dragging.current;
    if (!id) return;
    const from = order.indexOf(id);
    // the card goes where the pointer is, among the other cards' middles
    let to = order.length - 1;
    for (let i = 0; i < order.length; i++) {
      const rect = cardRefs.current[i]?.getBoundingClientRect();
      if (rect && e.clientY < rect.top + rect.height / 2) { to = i > from ? i - 1 : i; break; }
    }
    if (to !== from) change(moveItem(order, from, to));
  }

  function reset() {
    setOrder(initialOrder);
    setRun(null);
    setChecked(false);
    setHint(-1);
  }

  const shownLayers = new Set(run ? order.slice(0, run.shown).map(id => stepOf(id).layer) : []);
  const blockedId = run?.over && run.blockedBy ? order[run.done] : null;
  const problemLayer = blockedId ? stepOf(blockedId).layer : null;
  const status = !run ? t.idle : !run.over ? t.running : run.blockedBy ? t.blocked(stepOf(blockedId!).label[lang]) : t.finished;

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <div className="drawing"><HouseIllustration done={shownLayers} problem={problemLayer} label={t.drawing} /></div>
        <div className={`note seq-status ${run?.over ? (run.blockedBy ? 'warn' : 'seq-ok') : ''}`} role="status">
          <strong>{status}</strong>
          {run?.over && run.blockedBy && <><p>{t.missing(stepOf(run.blockedBy.before).label[lang])}</p><p>{run.blockedBy.reason[lang]}</p></>}
        </div>
        <p className="floorplan-help">{t.help}</p>
        <ol
          className="seq-list"
          onPointerMove={onPointerMove}
          onPointerUp={() => { dragging.current = null; }}
          onPointerCancel={() => { dragging.current = null; }}
        >
          {order.map((id, i) => {
            const s = stepOf(id);
            const built = !!run && i < run.shown;
            const blocked = id === blockedId;
            return (
              <li
                key={id}
                ref={el => { cardRefs.current[i] = el; }}
                className={`seq-card${built ? ' built' : ''}${blocked ? ' blocked' : ''}`}
                tabIndex={0}
                aria-label={`${i + 1}. ${s.label[lang]} : ${s.detail[lang]}`}
                onKeyDown={e => onKey(e, i)}
                onFocus={() => setFocusId(id)}
              >
                <span
                  className="seq-handle"
                  aria-hidden="true"
                  onPointerDown={e => { e.preventDefault(); dragging.current = id; (e.currentTarget.closest('ol') as HTMLElement).setPointerCapture(e.pointerId); }}
                ><GripVertical size={18} /></span>
                <span className="seq-number">{i + 1}</span>
                <span className="seq-icon" aria-hidden="true">{s.icon}</span>
                <span className="seq-text"><strong>{s.label[lang]}</strong><small>{s.detail[lang]}</small></span>
                <span className="seq-state" aria-hidden="true">{built ? '✓' : blocked ? '✕' : ''}</span>
                <span className="seq-moves">
                  <button aria-label={`${t.up} : ${s.label[lang]}`} disabled={i === 0} onClick={() => { setFocusId(null); change(moveItem(order, i, i - 1)); }}><ChevronUp size={16} /></button>
                  <button aria-label={`${t.down} : ${s.label[lang]}`} disabled={i === order.length - 1} onClick={() => { setFocusId(null); change(moveItem(order, i, i + 1)); }}><ChevronDown size={16} /></button>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
      <aside className="controls">
        <h2>{t.title}</h2>
        <div className="metrics seq-metrics">
          <div><small>{t.links}</small><strong>{ok.filter(Boolean).length} / {dependencies.length}</strong></div>
          <div><small>{run ? t.step(Math.min(run.shown, order.length), order.length) : '—'}</small><strong>{run ? (run.over && !run.blockedBy ? '🏁' : run.over ? '⛔' : '🚧') : '🚧'}</strong></div>
        </div>
        <NeedsList lang={lang} title={t.goal} items={game.constraints.map((c, i) => ({ label: c.label[lang], ok: result.constraints[i] }))} />
        <Feedback
          game={game}
          lang={lang}
          solved={result.solved}
          checked={checked}
          onCheck={start}
          hint={hint}
          onHint={() => setHint(h => Math.min(h + 1, game.hints[lang].length - 1))}
          onReset={reset}
          checkLabel={t.run}
        />
      </aside>
    </div>
  );
}
