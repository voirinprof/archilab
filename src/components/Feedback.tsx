import { CheckCircle2, Circle, Lightbulb, RotateCcw, XCircle } from 'lucide-react';
import type { Lang, Localized, LocalizedList } from '../types.ts';

const ui = {
  fr: {
    needs: 'Besoins des occupants', check: 'Vérifier mon plan', hint: 'Un indice', reset: 'Recommencer',
    success: 'Mission accomplie !', retry: 'Pas encore !', principle: 'Le principe', concepts: 'Notions explorées',
    remaining: (n: number) => `${n} besoin${n > 1 ? 's' : ''} à résoudre`,
  },
  en: {
    needs: 'Occupants’ needs', check: 'Check my plan', hint: 'Get a hint', reset: 'Start over',
    success: 'Mission complete!', retry: 'Not quite!', principle: 'The idea', concepts: 'Concepts explored',
    remaining: (n: number) => `${n} need${n > 1 ? 's' : ''} left to meet`,
  },
};

/** Live checklist of a challenge's rules. */
export function NeedsList({ lang, items, title }: { lang: Lang; items: { label: string; ok: boolean }[]; title?: string }) {
  const t = ui[lang];
  const remaining = items.filter(i => !i.ok).length;
  return (
    <div className="needs">
      <div className="needs-head"><span>{title ?? t.needs}</span><small>{remaining === 0 ? '✓' : t.remaining(remaining)}</small></div>
      <ul>
        {items.map((item, i) => (
          <li key={i} className={item.ok ? 'ok' : ''}>{item.ok ? <CheckCircle2 size={18} /> : <Circle size={18} />}{item.label}</li>
        ))}
      </ul>
    </div>
  );
}

/** The pedagogical content every challenge provides for its feedback. */
export type FeedbackContent = {
  hints: LocalizedList;
  feedback: { success: Localized; failure: Localized };
  explanation: Localized;
  concepts: LocalizedList;
};

type FeedbackProps = {
  game: FeedbackContent;
  lang: Lang;
  solved: boolean;
  checked: boolean;
  onCheck: () => void;
  hint: number;
  onHint: () => void;
  onReset: () => void;
  /** Shown under the success message, e.g. when the best possible result is reached. */
  extra?: string;
  /** Replaces the default « Vérifier mon plan » label. */
  checkLabel?: string;
};

/** Check button, progressive hints, verdict, explanation, reset and concepts. */
export function Feedback({ game, lang, solved, checked, onCheck, hint, onHint, onReset, extra, checkLabel }: FeedbackProps) {
  const t = ui[lang];
  const hints = game.hints[lang];
  return (
    <>
      <button className="primary full" onClick={onCheck}><CheckCircle2 size={18} />{checkLabel ?? t.check}</button>
      <button className="subtle full" onClick={onHint}><Lightbulb size={17} />{t.hint}{hint >= 0 && ` (${hint + 1}/${hints.length})`}</button>
      {hint >= 0 && <div className="note">{hints[hint]}</div>}
      {checked && (
        <div className={`result ${solved ? 'won' : 'try'}`} role="status">
          {solved ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
          <div><strong>{solved ? t.success : t.retry}</strong><p>{solved ? game.feedback.success[lang] : game.feedback.failure[lang]}</p>{solved && extra && <p className="result-extra">{extra}</p>}</div>
        </div>
      )}
      {checked && solved && <div className="note principle"><strong>{t.principle}</strong><p>{game.explanation[lang]}</p></div>}
      <button className="subtle full" onClick={onReset}><RotateCcw size={17} />{t.reset}</button>
      <div className="concepts"><span>{t.concepts}</span><div>{game.concepts[lang].map(c => <em key={c}>{c}</em>)}</div></div>
    </>
  );
}
