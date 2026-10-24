import type { ReactNode, Ref, SVGProps } from 'react';
import { CheckCircle2, Circle, Lightbulb, RotateCcw, XCircle } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { FloorplanActivity, Plan, Rect, RoomSpec } from './types.ts';

export const ui = {
  fr: {
    mission: 'Ta mission', needs: 'Besoins des occupants', check: 'Vérifier mon plan', hint: 'Un indice', reset: 'Recommencer',
    success: 'Mission accomplie !', retry: 'Pas encore !', principle: 'Le principe', concepts: 'Notions explorées',
    south: 'SUD', north: 'N', plan: 'Plan du logement', remaining: (n: number) => `${n} besoin${n > 1 ? 's' : ''} à résoudre`,
    // layout mode
    design: 'À toi d’aménager', layoutHelp: 'Glisse une pièce pour la déplacer et tire sa poignée ◢ pour l’agrandir. Au clavier : flèches pour déplacer, Maj + flèches pour redimensionner.',
    selected: 'Pièce sélectionnée', width: 'Largeur', depth: 'Profondeur', more: 'Agrandir', less: 'Réduire',
    home: 'Logement', rooms: 'Pièces', free: 'Circulation',
    inside: 'Toutes les pièces restent dans le logement.', noOverlap: 'Aucune pièce ne se chevauche.',
    blocked: 'Pas de place ici : une pièce ne peut ni sortir du logement ni en chevaucher une autre.',
    // doors mode
    doorsTitle: 'À toi de percer les portes', doorsHelp: 'Touche un morceau de mur pour y percer une porte, touche-le encore pour la retirer. Au clavier : Tab pour choisir un mur, Entrée pour ajouter ou retirer la porte.',
    doors: 'Portes', reached: 'Pièces accessibles', outside: 'l’extérieur',
    unreached: 'Les pièces grisées ne sont pas encore accessibles depuis l’entrée.',
    wall: (a: string, b: string, n: number, total: number) => `Mur entre ${a} et ${b}${total > 1 ? `, morceau ${n} sur ${total}` : ''}`,
    door: 'porte',
  },
  en: {
    mission: 'Your mission', needs: 'Occupants’ needs', check: 'Check my plan', hint: 'Get a hint', reset: 'Start over',
    success: 'Mission complete!', retry: 'Not quite!', principle: 'The idea', concepts: 'Concepts explored',
    south: 'SOUTH', north: 'N', plan: 'Home floor plan', remaining: (n: number) => `${n} need${n > 1 ? 's' : ''} left to meet`,
    design: 'Time to lay it out', layoutHelp: 'Drag a room to move it and pull its ◢ handle to resize it. With a keyboard: arrows to move, Shift + arrows to resize.',
    selected: 'Selected room', width: 'Width', depth: 'Depth', more: 'Enlarge', less: 'Shrink',
    home: 'Home', rooms: 'Rooms', free: 'Circulation',
    inside: 'Every room stays inside the home.', noOverlap: 'No rooms overlap.',
    blocked: 'No room here: a room can’t leave the home or overlap another one.',
    doorsTitle: 'Time to add the doors', doorsHelp: 'Tap a piece of wall to put a door in it, tap it again to remove it. With a keyboard: Tab to pick a wall, Enter to add or remove the door.',
    doors: 'Doors', reached: 'Reachable rooms', outside: 'the outside',
    unreached: 'Greyed-out rooms can’t be reached from the entrance yet.',
    wall: (a: string, b: string, n: number, total: number) => `Wall between ${a} and ${b}${total > 1 ? `, piece ${n} of ${total}` : ''}`,
    door: 'door',
  },
};

export const SCALE = 40;
export const PAD = 36;
export const px = (m: number) => PAD + m * SCALE;

const palette: Record<string, { fill: string; stroke: string }> = {
  yellow: { fill: '#f4e2a1', stroke: '#b8953a' },
  coral: { fill: '#f2c9b4', stroke: '#b9765a' },
  blue: { fill: '#c9dcea', stroke: '#5b819d' },
  mint: { fill: '#cfe5da', stroke: '#5f9480' },
};
export const colorsOf = (spec: RoomSpec) => palette[spec.color] ?? palette.blue;

type PlanFrameProps = { plan: Plan; lang: Lang; svgRef?: Ref<SVGSVGElement>; children: ReactNode } & Omit<SVGProps<SVGSVGElement>, 'ref'>;

/** The plan background shared by every floorplan mode: grid, outline, dimensions and orientation. */
export function PlanFrame({ plan, lang, svgRef, children, className, ...rest }: PlanFrameProps) {
  const t = ui[lang];
  const viewW = plan.width * SCALE + PAD * 2;
  const viewH = plan.depth * SCALE + PAD * 2;
  const w = plan.width * SCALE, h = plan.depth * SCALE;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${viewW} ${viewH}`} className={`floorplan-svg ${className ?? ''}`} role="group" aria-label={`${t.plan} ${plan.width} m × ${plan.depth} m`} {...rest}>
      <defs>
        <pattern id="fp-grid" x={PAD} y={PAD} width={SCALE} height={SCALE} patternUnits="userSpaceOnUse">
          <path d={`M${SCALE} 0H0V${SCALE}`} fill="none" stroke="#8caaa6" strokeWidth=".8" opacity=".35" />
        </pattern>
      </defs>
      <rect x={px(0)} y={px(0)} width={w} height={h} fill="#fbfaf6" />
      <rect x={px(0)} y={px(0)} width={w} height={h} fill="url(#fp-grid)" />
      <text x={viewW / 2} y={PAD - 14} textAnchor="middle" className="fp-dim">{plan.width} m</text>
      <text x={viewW - PAD + 18} y={viewH / 2} transform={`rotate(90 ${viewW - PAD + 18} ${viewH / 2})`} textAnchor="middle" className="fp-dim">{plan.depth} m</text>
      <text x={PAD - 18} y={PAD - 12} textAnchor="middle" className="fp-compass">↑ {t.north}</text>
      <text x={viewW / 2} y={viewH - 10} textAnchor="middle" className="fp-sun">☀ {t.south}</text>
      {children}
    </svg>
  );
}

/** Room name (and optionally its area) centred in a rectangle. */
export function RoomLabel({ rect, label, detail }: { rect: Rect; label: string; detail?: string }) {
  const x = px(rect.x), y = px(rect.y), w = rect.width * SCALE, h = rect.depth * SCALE;
  const small = w < 3 * SCALE;
  const cy = detail ? y + h / 2 - 4 : y + h / 2 + 4;
  return (
    <>
      <text x={x + w / 2} y={cy} textAnchor="middle" className="fp-label" fontSize={small ? 10 : 13}>{label}</text>
      {detail && <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" className="fp-area" fontSize={small ? 11 : 14}>{detail}</text>}
    </>
  );
}

export function NeedsList({ lang, items }: { lang: Lang; items: { label: string; ok: boolean }[] }) {
  const t = ui[lang];
  const remaining = items.filter(i => !i.ok).length;
  return (
    <div className="needs">
      <div className="needs-head"><span>{t.needs}</span><small>{remaining === 0 ? '✓' : t.remaining(remaining)}</small></div>
      <ul>
        {items.map((item, i) => (
          <li key={i} className={item.ok ? 'ok' : ''}>{item.ok ? <CheckCircle2 size={18} /> : <Circle size={18} />}{item.label}</li>
        ))}
      </ul>
    </div>
  );
}

type FeedbackProps = {
  game: FloorplanActivity;
  lang: Lang;
  solved: boolean;
  checked: boolean;
  onCheck: () => void;
  hint: number;
  onHint: () => void;
  onReset: () => void;
};

/** Check button, progressive hints, verdict, explanation, reset and concepts. */
export function Feedback({ game, lang, solved, checked, onCheck, hint, onHint, onReset }: FeedbackProps) {
  const t = ui[lang];
  const hints = game.hints[lang];
  return (
    <>
      <button className="primary full" onClick={onCheck}><CheckCircle2 size={18} />{t.check}</button>
      <button className="subtle full" onClick={onHint}><Lightbulb size={17} />{t.hint}{hint >= 0 && ` (${hint + 1}/${hints.length})`}</button>
      {hint >= 0 && <div className="note">{hints[hint]}</div>}
      {checked && (
        <div className={`result ${solved ? 'won' : 'try'}`} role="status">
          {solved ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
          <div><strong>{solved ? t.success : t.retry}</strong><p>{solved ? game.feedback.success[lang] : game.feedback.failure[lang]}</p></div>
        </div>
      )}
      {checked && solved && <div className="note principle"><strong>{t.principle}</strong><p>{game.explanation[lang]}</p></div>}
      <button className="subtle full" onClick={onReset}><RotateCcw size={17} />{t.reset}</button>
      <div className="concepts"><span>{t.concepts}</span><div>{game.concepts[lang].map(c => <em key={c}>{c}</em>)}</div></div>
    </>
  );
}
