import { useState } from 'react';
import type { Lang, Localized } from '../../types.ts';
import type { CarbonActivity, Design } from './types.ts';
import type { Footprint } from './rules.ts';
import { evaluateCarbon, footprint, initialDesign } from './rules.ts';
import { Feedback, NeedsList } from '../../components/Feedback.tsx';

const ui = {
  fr: {
    mission: 'Ta mission', title: 'Le bilan carbone', check: 'Calculer le bilan', design: 'Tes choix de conception',
    shape: 'Forme', structure: 'Structure', insulation: 'Isolant', thickness: 'Épaisseur d’isolant', glazing: 'Part de vitrage', windows: 'Fenêtres', heating: 'Chauffage',
    total: (y: number) => `Total sur ${y} ans`, built: 'Construction', use: (y: number) => `Chauffage pendant ${y} ans`,
    items: { structure: 'structure', insulation: 'isolant', windows: 'fenêtres', heating: 'équipement de chauffage' },
    need: 'Besoin de chauffage', needUnit: 'kWh/m² par an', target: 'objectif', start: 'au départ', change: (pct: number) => `${signed(pct)} % par rapport au départ`,
    house: 'La maison', unit: 't',
  },
  en: {
    mission: 'Your mission', title: 'The carbon footprint', check: 'Work out the footprint', design: 'Your design choices',
    shape: 'Shape', structure: 'Structure', insulation: 'Insulation', thickness: 'Insulation thickness', glazing: 'Share of glazing', windows: 'Windows', heating: 'Heating',
    total: (y: number) => `Total over ${y} years`, built: 'Building it', use: (y: number) => `Heating for ${y} years`,
    items: { structure: 'structure', insulation: 'insulation', windows: 'windows', heating: 'heating equipment' },
    need: 'Heating need', needUnit: 'kWh/m² per year', target: 'target', start: 'at the start', change: (pct: number) => `${signed(pct)}% compared with the start`,
    house: 'The house', unit: 't',
  },
};

/** Percentages with a real minus sign (−) or a plus sign. */
const signed = (n: number) => (n < 0 ? `−${-n}` : n > 0 ? `+${n}` : '0');
const tonnes = (kg: number, lang: Lang) => Number((kg / 1000).toFixed(1)).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA');
const INSULATION_COLOR: Record<string, string> = { polystyrene: '#eef2f6', mineral: '#f1d46b', biobased: '#a8794a' };

/** Front view of the house: its shape, structure colour, insulation thickness, windows and heating change with the design. */
function House({ game, design, f, lang }: { game: CarbonActivity; design: Design; f: Footprint; lang: Lang }) {
  const p = game.parameters;
  const shape = p.shapes.find(s => s.id === design.shape)!, structure = p.structures.find(s => s.id === design.structure)!;
  const windows = p.windows.find(w => w.id === design.windows)!, heating = p.heatings.find(h => h.id === design.heating)!;
  const ground = 230, storey = 66;
  const body = shape.kind === 'compact' ? { x: 130, w: 150 } : shape.kind === 'long' ? { x: 50, w: 300 } : { x: 50, w: 220 };
  const height = storey * shape.storeys;
  const top = ground - height;
  const wall = 2 + design.thickness * 0.38; // insulation drawn as a thick outline
  const count = Math.max(1, Math.round(design.glazing / 5));
  const rows = shape.storeys;
  const perRow = Math.ceil(count / rows);
  const winW = Math.min(46, (body.w - 30) / perRow - 12), winH = 30 + design.glazing * 0.35;
  const smoke = heating.kind === 'gas' ? Math.min(1, f.operational / 150000) : heating.kind === 'wood' ? 0.35 : 0;
  const label = `${shape.label[lang]}, ${structure.label[lang]}, ${design.thickness} cm, ${design.glazing} %, ${windows.label[lang]}, ${heating.label[lang]}`;
  return (
    <svg viewBox="0 0 400 260" className="carbon-house" role="img" aria-label={label}>
      <rect x={0} y={0} width={400} height={ground} className="carbon-sky" />
      <rect x={0} y={ground} width={400} height={30} className="carbon-ground" />
      {shape.kind === 'ell' && (
        <g className="carbon-wing">
          <rect x={270} y={ground - storey + 10} width={90} height={storey - 10} fill={structure.color} stroke={INSULATION_COLOR[design.insulation]} strokeWidth={wall} />
          <path d={`M262 ${ground - storey + 10}L315 ${ground - storey - 22}L368 ${ground - storey + 10}Z`} className="carbon-roof wing" />
        </g>
      )}
      <rect x={body.x} y={top} width={body.w} height={height} fill={structure.color} stroke={INSULATION_COLOR[design.insulation]} strokeWidth={wall} className="carbon-walls" />
      <path d={`M${body.x - 14} ${top}L${body.x + body.w / 2} ${top - 54}L${body.x + body.w + 14} ${top}Z`} className="carbon-roof" />
      {Array.from({ length: count }, (_, i) => {
        const row = Math.floor(i / perRow), col = i % perRow, inRow = Math.min(perRow, count - row * perRow);
        const gap = (body.w - inRow * winW) / (inRow + 1);
        const x = body.x + gap + col * (winW + gap), y = top + row * storey + (storey - winH) / 2 + (shape.storeys === 1 ? 0 : 0);
        return (
          <g key={i} className="carbon-window">
            <rect x={x} y={y} width={winW} height={Math.min(winH, storey - 14)} />
            {Array.from({ length: windows.panes - 1 }, (_, k) => <line key={k} x1={x + ((k + 1) * winW) / windows.panes} y1={y} x2={x + ((k + 1) * winW) / windows.panes} y2={y + Math.min(winH, storey - 14)} />)}
          </g>
        );
      })}
      {heating.kind === 'gas' || heating.kind === 'wood' ? (
        <g>
          <rect x={body.x + body.w * 0.72} y={top - 46} width={16} height={34} className="carbon-chimney" />
          {[0, 1, 2].map(i => <circle key={i} cx={body.x + body.w * 0.72 + 8 + i * 9} cy={top - 58 - i * 16} r={8 + i * 4} className="carbon-smoke" style={{ opacity: smoke * (1 - i * 0.25) }} />)}
        </g>
      ) : heating.kind === 'heat-pump' ? (
        <g className="carbon-unit">
          <rect x={body.x + body.w + 14} y={ground - 30} width={38} height={30} rx={3} />
          <circle cx={body.x + body.w + 33} cy={ground - 15} r={10} />
        </g>
      ) : (
        <text x={body.x + body.w + 20} y={ground - 10} className="carbon-plug">⚡</text>
      )}
    </svg>
  );
}

/** A horizontal stacked bar with a target line. */
function StackBar({ parts, max, target, targetLabel }: { parts: { value: number; cls: string; label: string }[]; max: number; target?: number; targetLabel: string }) {
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  let left = 0;
  return (
    <div className="carbon-bar" role="img" aria-label={parts.map(p => p.label).join(', ')}>
      {parts.map(p => {
        const el = <span key={p.cls} className={`seg ${p.cls}`} style={{ left: pct(left), width: pct(p.value) }} title={p.label} />;
        left += p.value;
        return el;
      })}
      {target !== undefined && <i className="target" style={{ left: pct(target) }} title={targetLabel} />}
    </div>
  );
}

function Choice<T extends { id: string; label: Localized }>({ name, options, value, onChange, lang }: { name: string; options: T[]; value: string; onChange: (id: string) => void; lang: Lang }) {
  return (
    <fieldset className="carbon-choice">
      <legend>{name}</legend>
      <div role="radiogroup" aria-label={name}>
        {options.map(o => (
          <button key={o.id} role="radio" aria-checked={o.id === value} className={o.id === value ? 'active' : ''} onClick={() => onChange(o.id)}>{o.label[lang]}</button>
        ))}
      </div>
    </fieldset>
  );
}

/** Carbon engine: tune a house's design and see its simplified carbon footprint, building plus heating over its lifetime. */
export function CarbonGame({ game, lang }: { game: CarbonActivity; lang: Lang }) {
  const t = ui[lang];
  const p = game.parameters;
  const [design, setDesign] = useState<Design>(() => initialDesign(p));
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);
  const result = evaluateCarbon(game.constraints, p, design);
  const f = result.footprint;
  const start = footprint(p, initialDesign(p));
  const target = (metric: string) => game.constraints.find(c => c.type === 'max' && c.metric === metric)?.value;
  const set = <K extends keyof Design>(k: K, v: Design[K]) => { setDesign(d => ({ ...d, [k]: v })); setChecked(false); };
  const totalMax = Math.max(start.total, f.total) / 1000;
  const builtMax = Math.max(start.embodiedTotal, f.embodiedTotal, (target('embodied') ?? 0) * 1000) / 1000 * 1.05;
  const change = Math.round(((f.total - start.total) / start.total) * 100);
  const needTarget = target('heating_need');

  function reset() {
    setDesign(initialDesign(p));
    setChecked(false);
    setHint(-1);
  }

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <div className="drawing"><House game={game} design={design} f={f} lang={lang} /></div>
        <h2 className="carbon-subtitle">{t.design}</h2>
        <div className="carbon-controls">
          <Choice name={t.shape} options={p.shapes} value={design.shape} onChange={v => set('shape', v)} lang={lang} />
          <Choice name={t.structure} options={p.structures} value={design.structure} onChange={v => set('structure', v)} lang={lang} />
          <Choice name={t.insulation} options={p.insulations} value={design.insulation} onChange={v => set('insulation', v)} lang={lang} />
          <div className="control">
            <div className="control-label"><label htmlFor="carbon-thickness">{t.thickness}</label><strong>{design.thickness} cm</strong></div>
            <input id="carbon-thickness" type="range" min={p.thickness.min} max={p.thickness.max} step={p.thickness.step} value={design.thickness} onChange={e => set('thickness', Number(e.target.value))} />
          </div>
          <div className="control">
            <div className="control-label"><label htmlFor="carbon-glazing">{t.glazing}</label><strong>{design.glazing} %</strong></div>
            <input id="carbon-glazing" type="range" min={p.glazing.min} max={p.glazing.max} step={p.glazing.step} value={design.glazing} onChange={e => set('glazing', Number(e.target.value))} />
          </div>
          <Choice name={t.windows} options={p.windows} value={design.windows} onChange={v => set('windows', v)} lang={lang} />
          <Choice name={t.heating} options={p.heatings} value={design.heating} onChange={v => set('heating', v)} lang={lang} />
        </div>
      </section>
      <aside className="controls">
        <h2>{t.title}</h2>
        <div className="carbon-chart">
          <div className="carbon-row">
            <div className="carbon-row-head"><span>{t.total(p.lifetime)}</span><strong>{tonnes(f.total, lang)} {t.unit}</strong></div>
            <StackBar
              max={totalMax}
              target={target('total')}
              targetLabel={`${t.target} ${target('total')} ${t.unit}`}
              parts={[
                { value: f.embodiedTotal / 1000, cls: 'built', label: `${t.built} ${tonnes(f.embodiedTotal, lang)} ${t.unit}` },
                { value: f.operational / 1000, cls: 'use', label: `${t.use(p.lifetime)} ${tonnes(f.operational, lang)} ${t.unit}` },
              ]}
            />
            <small className={change < 0 ? 'down' : ''}>{t.change(change)} · {t.start} {tonnes(start.total, lang)} {t.unit} · {t.target} {target('total')} {t.unit}</small>
          </div>
          <div className="carbon-legend">
            <span><i className="seg built" />{t.built} : {tonnes(f.embodiedTotal, lang)} {t.unit}</span>
            <span><i className="seg use" />{t.use(p.lifetime)} : {tonnes(f.operational, lang)} {t.unit}</span>
          </div>
          <div className="carbon-row">
            <div className="carbon-row-head"><span>{t.built}</span><strong>{tonnes(f.embodiedTotal, lang)} {t.unit}</strong></div>
            <StackBar
              max={builtMax}
              target={target('embodied')}
              targetLabel={`${t.target} ${target('embodied')} ${t.unit}`}
              parts={(['structure', 'insulation', 'windows', 'heating'] as const).map(k => ({ value: f.embodied[k] / 1000, cls: k, label: `${t.items[k]} ${tonnes(f.embodied[k], lang)} ${t.unit}` }))}
            />
            <div className="carbon-legend">
              {(['structure', 'insulation', 'windows', 'heating'] as const).map(k => <span key={k}><i className={`seg ${k}`} />{t.items[k]} : {tonnes(f.embodied[k], lang)} {t.unit}</span>)}
            </div>
          </div>
          <div className="carbon-row">
            <div className="carbon-row-head"><span>{t.need}</span><strong>{Math.round(f.heatingNeed)} {t.needUnit}</strong></div>
            <StackBar
              max={Math.max(start.heatingNeed, f.heatingNeed)}
              target={needTarget}
              targetLabel={`${t.target} ${needTarget}`}
              parts={[{ value: f.heatingNeed, cls: 'need', label: `${Math.round(f.heatingNeed)} ${t.needUnit}` }]}
            />
          </div>
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
          checkLabel={t.check}
        />
      </aside>
    </div>
  );
}
