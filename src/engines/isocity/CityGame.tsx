import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { ArrowRight, Eraser, Hand, Redo2, RotateCw, Undo2 } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { CityElement, IsoCityActivity, Placed, Rotation } from './types.ts';
import type { Cell, Issue, Refusal } from './rules.ts';
import { canPlace, cellAt, check, elementOf, footprint, itemAt, nextRotation, occupancy, place, relocate, remove, rotateDirs } from './rules.ts';
import { pathOf, toScreen, UNIT_Z } from './iso.ts';
import { FlatArt, hasVolume, VolumeArt } from './Art.tsx';
import { columnName, IsoView } from './IsoView.tsx';
import { PlanLegend, planCellText, PlanView } from './PlanView.tsx';
import { Feedback, NeedsList } from '../../components/Feedback.tsx';

const ui = {
  fr: {
    mission: 'Ta mission', step: (n: number, total: number) => `Étape ${n} sur ${total}`, steps: 'Étapes du défi',
    planTitle: 'Le plan (vue de dessus)', isoTitle: 'Ton quartier (vue isométrique)', legend: 'Légende du plan',
    showPlan: 'Plan', showIso: 'Vue 3D', palette: 'Éléments à placer', tools: 'Outils',
    move: 'Déplacer', erase: 'Gomme', rotate: 'Pivoter', undo: 'Annuler', redo: 'Rétablir',
    check: 'Vérifier l’étape', checkFinal: 'Vérifier le quartier', next: 'Étape suivante', checks: 'À vérifier',
    placed: 'Cases conformes au plan', issues: 'Cases à revoir',
    help: 'Choisis un élément, puis touche une case de la vue 3D pour le poser (tu peux glisser pour poser plusieurs routes). Pivoter tourne l’élément avant de le poser. Au clavier : flèches pour choisir une case (haut = nord), Entrée pour poser, R pour pivoter, Suppr pour effacer, Ctrl+Z pour annuler, chiffres pour changer d’élément.',
    moveHelp: 'Touche un élément pour le prendre, puis la case où le poser (son coin nord-ouest).',
    selected: (name: string, turn: boolean) => `${name} sélectionné : touche la case où le poser${turn ? ', ou Pivoter' : ''}.`,
    empty: 'vide', cell: (name: string, what: string) => `Case ${name} : ${what}`, onPlan: (name: string, what: string) => `Sur le plan, ${name} : ${what}`,
    plan: 'Plan de référence du quartier', iso: 'Vue isométrique du quartier, à construire',
    legendIssues: 'rouge : à corriger · orange : il manque quelque chose',
    refusal: {
      outside: 'Ça dépasse du terrain : choisis une autre case ou pivote l’élément.',
      occupied: 'La case est déjà occupée : efface ou déplace d’abord ce qui s’y trouve.',
      onRoad: 'Pas sur la route ! Choisis une case libre à côté.',
      onBuilding: 'Un arbre ne pousse pas sur un bâtiment.',
      needsIntersection: 'Un feu se place sur une intersection (en T ou en croix).',
      locked: 'Cet élément appartient à une autre étape : reviens à cette étape pour le changer.',
    } as Record<Refusal | 'locked', string>,
  },
  en: {
    mission: 'Your mission', step: (n: number, total: number) => `Step ${n} of ${total}`, steps: 'Challenge steps',
    planTitle: 'The plan (top view)', isoTitle: 'Your neighbourhood (isometric view)', legend: 'Plan legend',
    showPlan: 'Plan', showIso: '3D view', palette: 'Elements to place', tools: 'Tools',
    move: 'Move', erase: 'Eraser', rotate: 'Rotate', undo: 'Undo', redo: 'Redo',
    check: 'Check this step', checkFinal: 'Check the neighbourhood', next: 'Next step', checks: 'To check',
    placed: 'Cells matching the plan', issues: 'Cells to review',
    help: 'Pick an element, then tap a cell of the 3D view to place it (drag to lay several roads). Rotate turns the element before placing it. With a keyboard: arrows to pick a cell (up = north), Enter to place, R to rotate, Delete to erase, Ctrl+Z to undo, numbers to change element.',
    moveHelp: 'Tap an element to pick it up, then the cell where it goes (its north-west corner).',
    selected: (name: string, turn: boolean) => `${name} selected: tap the cell where it goes${turn ? ', or Rotate' : ''}.`,
    empty: 'empty', cell: (name: string, what: string) => `Cell ${name}: ${what}`, onPlan: (name: string, what: string) => `On the plan, ${name}: ${what}`,
    plan: 'Reference plan of the neighbourhood', iso: 'Isometric view of the neighbourhood, to build',
    legendIssues: 'red: to fix · orange: something is missing',
    refusal: {
      outside: 'It goes off the site: pick another cell or rotate the element.',
      occupied: 'The cell is taken: erase or move what is there first.',
      onRoad: 'Not on the road! Pick a free cell next to it.',
      onBuilding: 'A tree doesn’t grow on a building.',
      needsIntersection: 'A traffic light goes on an intersection (T or crossroads).',
      locked: 'This element belongs to another step: go back to that step to change it.',
    } as Record<Refusal | 'locked', string>,
  },
};

const MOVE = '__move';
const ERASE = '__erase';
const HISTORY = 100;

/** Small isometric drawing of an element, as it will be placed (with the current rotation). */
function Preview({ el, rotation }: { el: CityElement; rotation: Rotation }) {
  const r = footprint(el, { x: 0, y: 0, rotation });
  const pts = [toScreen(0, 0), toScreen(r.w, 0), toScreen(r.w, r.d), toScreen(0, r.d)];
  const top = -((el.height ?? 0) + (el.shape === 'house' ? 0.6 : el.shape === 'school' ? 0.9 : 0.1)) * UNIT_Z;
  const minX = Math.min(...pts.map(p => p[0])) - 4, maxX = Math.max(...pts.map(p => p[0])) + 4;
  const maxY = Math.max(...pts.map(p => p[1])) + 4, minY = Math.min(top, ...pts.map(p => p[1])) - 6;
  return (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="ic-preview" aria-hidden="true">
      {el.kind !== 'road' && <path d={pathOf(pts)} className="ic-ground" />}
      <FlatArt el={el} r={r} dirs={rotateDirs(el.connections ?? [], rotation)} />
      {hasVolume(el) && <VolumeArt el={el} r={r} rotation={rotation} />}
    </svg>
  );
}

/** Isocity engine: read a 2D plan and build the same neighbourhood in an isometric view, step by step. */
export function CityGame({ game, lang }: { game: IsoCityActivity; lang: Lang }) {
  const t = ui[lang];
  const sc = game.parameters;
  const steps = sc.steps;
  const [city, setCity] = useState<Placed[]>([]);
  const [past, setPast] = useState<Placed[][]>([]);
  const [future, setFuture] = useState<Placed[][]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [reached, setReached] = useState(0);
  const [tool, setTool] = useState<string>(steps[0].elements[0]);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState<Cell | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [planHover, setPlanHover] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);
  const [view, setView] = useState<'iso' | 'plan'>('iso');
  const cityRef = useRef(city);
  cityRef.current = city;
  const uid = useRef(1);
  const painting = useRef(false);
  const saved = useRef(false);

  const step = steps[stepIndex];
  const final = !!step.final;
  const stepElements = final ? sc.elements.map(e => e.id) : step.elements;
  const constraints = final ? game.constraints : step.constraints.map(id => game.constraints.find(c => c.id === id)!);
  const results = constraints.map(c => check(sc, city, c));
  const solved = results.every(r => r.ok);
  const counted = results.filter(r => r.total !== undefined);
  const done = counted.reduce((s, r) => s + (r.done ?? 0), 0), total = counted.reduce((s, r) => s + (r.total ?? 0), 0);
  const issues: Issue[] = [];
  if (checked) for (const r of results) for (const i of r.issues) if (!issues.some(j => j.x === i.x && j.y === i.y)) issues.push(i);

  useEffect(() => {
    const stop = () => { painting.current = false; };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const editable = (p: Placed) => final || stepElements.includes(p.element);
  const toolEl = tool !== MOVE && tool !== ERASE ? elementOf(sc, tool) : null;
  const toolRotation: Rotation = toolEl?.rotatable ? rotation : 0;

  /** Records the change; one undo step per click, drag or key press. */
  function commit(next: Placed[]) {
    if (!saved.current) {
      const before = cityRef.current;
      setPast(p => [...p.slice(-HISTORY + 1), before]);
      setFuture([]);
      saved.current = true;
    }
    cityRef.current = next;
    setCity(next);
    setMessage(null);
  }

  function act([x, y]: Cell, first: boolean) {
    const now = cityRef.current;
    if (tool === ERASE) {
      const item = itemAt(sc, now, x, y);
      if (!item) return;
      if (!editable(item)) { if (first) setMessage(t.refusal.locked); return; }
      commit(remove(sc, now, item.uid));
      return;
    }
    if (tool === MOVE) {
      if (!first) return;
      const item = itemAt(sc, now, x, y);
      const chosen = now.find(p => p.uid === selected);
      if (!chosen) {
        if (!item) return;
        if (!editable(item)) { setMessage(t.refusal.locked); return; }
        setSelected(item.uid);
        setMessage(t.selected(elementOf(sc, item.element).label[lang], !!elementOf(sc, item.element).rotatable));
        return;
      }
      if (item?.uid === chosen.uid && chosen.x === x && chosen.y === y) { setSelected(null); setMessage(null); return; }
      const res = canPlace(sc, now, { ...chosen, x, y }, chosen.uid);
      if (!res.ok) { setMessage(t.refusal[res.reason]); return; }
      commit(relocate(sc, now, chosen.uid, { x, y })!);
      setSelected(null);
      return;
    }
    if (now.some(p => p.element === tool && p.x === x && p.y === y && p.rotation === toolRotation)) return;
    const cand = { element: tool, x, y, rotation: toolRotation };
    const res = canPlace(sc, now, cand);
    if (!res.ok) { if (first || res.reason !== 'occupied') setMessage(t.refusal[res.reason]); return; }
    commit(place(sc, now, { ...cand, uid: uid.current++ })!);
  }

  function onCellDown(cell: Cell, e: PointerEvent) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    saved.current = false;
    setCursor(null);
    painting.current = tool === ERASE || (!!toolEl && footprint(toolEl, { x: 0, y: 0, rotation: 0 }).w * footprint(toolEl, { x: 0, y: 0, rotation: 0 }).d === 1);
    act(cell, true);
  }
  function onCellHover(cell: Cell | null) {
    setHover(cell);
    setPlanHover(false);
    if (cell && painting.current) act(cell, false);
  }

  function rotate() {
    const chosen = city.find(p => p.uid === selected);
    if (tool === MOVE && chosen) {
      if (!elementOf(sc, chosen.element).rotatable) return;
      saved.current = false;
      const next = relocate(sc, city, chosen.uid, { rotation: nextRotation(chosen.rotation) });
      if (next) commit(next); else setMessage(t.refusal.outside);
      return;
    }
    if (toolEl?.rotatable) setRotation(nextRotation(rotation));
  }
  function undo() {
    if (!past.length) return;
    setFuture(f => [city, ...f]);
    setCity(past[past.length - 1]);
    setPast(p => p.slice(0, -1));
    setSelected(null);
  }
  function redo() {
    if (!future.length) return;
    setPast(p => [...p, city]);
    setCity(future[0]);
    setFuture(f => f.slice(1));
    setSelected(null);
  }
  function pickTool(id: string) {
    setTool(id);
    setSelected(null);
    setMessage(id === MOVE ? t.moveHelp : null);
  }
  function goTo(i: number) {
    setStepIndex(i);
    setChecked(false);
    setHint(-1);
    setSelected(null);
    setMessage(null);
    setTool(steps[i].final ? sc.elements[0].id : steps[i].elements[0]);
  }
  function verify() {
    setChecked(true);
    if (solved) setReached(r => Math.max(r, Math.min(stepIndex + 1, steps.length - 1)));
  }
  function reset() {
    setCity([]);
    setPast([]);
    setFuture([]);
    setReached(0);
    setRotation(0);
    goTo(0);
  }

  function onKeyDown(e: KeyboardEvent) {
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
    const moves: Record<string, Cell> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const at: Cell = cursor ?? hover ?? [0, 0];
    if (moves[k]) {
      e.preventDefault();
      const next: Cell = [Math.max(0, Math.min(sc.grid.width - 1, at[0] + moves[k][0])), Math.max(0, Math.min(sc.grid.depth - 1, at[1] + moves[k][1]))];
      setCursor(cursor ? next : at);
      setMessage(null);
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      setCursor(at);
      saved.current = false;
      act(at, true);
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      const item = itemAt(sc, city, at[0], at[1]);
      if (!item) return;
      if (!editable(item)) { setMessage(t.refusal.locked); return; }
      saved.current = false;
      commit(remove(sc, city, item.uid));
    } else if (k === 'r' || k === 'R') {
      rotate();
    } else if (k === 'Escape') {
      setSelected(null);
      setMessage(null);
    } else if (/^[1-9]$/.test(k)) {
      const id = stepElements[Number(k) - 1];
      if (id) pickTool(id);
    }
  }

  const spot = hover ?? cursor;
  const chosen = city.find(p => p.uid === selected);
  let ghost: { cand: Omit<Placed, 'uid'>; ok: boolean } | null = null;
  if (spot && toolEl) {
    const cand = { element: tool, x: spot[0], y: spot[1], rotation: toolRotation };
    ghost = { cand, ok: canPlace(sc, city, cand).ok };
  } else if (spot && tool === MOVE && chosen) {
    const cand = { ...chosen, x: spot[0], y: spot[1] };
    ghost = { cand, ok: canPlace(sc, city, cand, chosen.uid).ok };
  }

  const describe = (c: Cell) => {
    const { base, overlay } = cellAt(occupancy(sc, city), c[0], c[1]);
    const names = [base, overlay].filter(Boolean).map(p => elementOf(sc, p!.element).label[lang]);
    return t.cell(`${columnName(c[0])}${c[1] + 1}`, names.length ? names.join(' + ') : t.empty);
  };
  const status = message ?? (cursor ? describe(cursor) : hover && planHover ? t.onPlan(`${columnName(hover[0])}${hover[1] + 1}`, planCellText(sc, lang, hover[0], hover[1])) : hover ? describe(hover) : '');
  const content = final ? game : { hints: step.hints, feedback: { success: step.success, failure: game.feedback.failure }, explanation: step.explanation, concepts: game.concepts };

  return (
    <div className="ic-layout">
      <section className="playboard ic-board">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <ol className="ic-steps" aria-label={t.steps}>
          {steps.map((s, i) => (
            <li key={s.id}>
              <button className={i === stepIndex ? 'active' : i < reached ? 'done' : ''} disabled={i > reached} aria-current={i === stepIndex ? 'step' : undefined} onClick={() => goTo(i)}>
                <span>{i < reached && i !== stepIndex ? '✓' : i + 1}</span>{s.label[lang]}
              </button>
            </li>
          ))}
        </ol>
        <div className="note ic-intro"><strong>{t.step(stepIndex + 1, steps.length)} · {step.label[lang]}</strong><p>{step.intro[lang]}</p></div>
        <div className="ic-switch" role="group">
          <button className={view === 'plan' ? 'active' : ''} aria-pressed={view === 'plan'} onClick={() => setView('plan')}>{t.showPlan}</button>
          <button className={view === 'iso' ? 'active' : ''} aria-pressed={view === 'iso'} onClick={() => setView('iso')}>{t.showIso}</button>
        </div>
        <div className={`ic-views show-${view}`}>
          <figure className="ic-pane plan">
            <figcaption>{t.planTitle}</figcaption>
            <PlanView sc={sc} focus={final ? null : new Set(stepElements)} hover={hover ?? cursor} issues={issues} label={t.plan} onCellHover={c => { setHover(c); setPlanHover(!!c); }} />
            <details className="ic-legend-box" open>
              <summary>{t.legend}</summary>
              <PlanLegend sc={sc} lang={lang} />
            </details>
          </figure>
          <figure className="ic-pane iso">
            <figcaption>{t.isoTitle}</figcaption>
            <IsoView sc={sc} city={city} ghost={ghost} selected={selected} cursor={cursor} hover={hover} issues={issues} label={t.iso} onCellDown={onCellDown} onCellHover={onCellHover} onKeyDown={onKeyDown} />
            {checked && issues.length > 0 && <small className="ic-issues-legend">{t.legendIssues}</small>}
          </figure>
        </div>
        <p className="ic-status" role="status" aria-live="polite">{status}</p>
        <div className="ic-palette" role="toolbar" aria-label={t.palette}>
          {stepElements.map((id, i) => {
            const el = elementOf(sc, id);
            return (
              <button key={id} className={tool === id ? 'active' : ''} aria-pressed={tool === id} onClick={() => pickTool(id)} title={`${i + 1}`}>
                <Preview el={el} rotation={tool === id ? toolRotation : 0} />
                <span>{el.label[lang]}</span>
              </button>
            );
          })}
        </div>
        <div className="ic-tools" role="toolbar" aria-label={t.tools}>
          <button className={tool === MOVE ? 'active' : ''} aria-pressed={tool === MOVE} onClick={() => pickTool(MOVE)}><Hand size={16} />{t.move}</button>
          <button className={tool === ERASE ? 'active' : ''} aria-pressed={tool === ERASE} onClick={() => pickTool(ERASE)}><Eraser size={16} />{t.erase}</button>
          <button onClick={rotate} disabled={!(toolEl?.rotatable || (tool === MOVE && chosen && elementOf(sc, chosen.element).rotatable))}><RotateCw size={16} />{t.rotate}</button>
          <button onClick={undo} disabled={!past.length}><Undo2 size={16} />{t.undo}</button>
          <button onClick={redo} disabled={!future.length}><Redo2 size={16} />{t.redo}</button>
        </div>
        <p className="floorplan-help">{t.help}</p>
      </section>
      <aside className="controls ic-controls">
        <div>
          <h2>{step.label[lang]}</h2>
          <div className="metrics">
            <div><small>{t.placed}</small><strong>{total ? `${done} / ${total}` : '—'}</strong></div>
            <div><small>{t.issues}</small><strong>{checked ? issues.length : '—'}</strong></div>
          </div>
          <NeedsList lang={lang} title={t.checks} items={constraints.map((c, i) => ({ label: c.label[lang], ok: results[i].ok }))} />
        </div>
        <div>
          <Feedback
            game={content}
            lang={lang}
            solved={solved}
            checked={checked}
            onCheck={verify}
            hint={hint}
            onHint={() => setHint(h => Math.min(h + 1, content.hints[lang].length - 1))}
            onReset={reset}
            checkLabel={final ? t.checkFinal : t.check}
          />
          {checked && solved && !final && <button className="primary full ic-next" onClick={() => goTo(stepIndex + 1)}>{t.next}<ArrowRight size={18} /></button>}
        </div>
      </aside>
    </div>
  );
}
