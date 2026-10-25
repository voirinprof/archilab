/** Side view of a house being built: each layer appears once its step is done; a step that can't be done is drawn in red. */
export function HouseIllustration({ done, problem, label }: { done: Set<string>; problem: string | null; label: string }) {
  const show = (layer: string) => done.has(layer) || problem === layer;
  const cls = (layer: string) => (problem === layer ? 'seq-problem' : '');
  const ground = 190;
  // once the finishes are done, the insulation, pipes and cables are hidden inside the walls
  const inside = (layer: string) => show(layer) && (!done.has('finishes') || problem === layer);
  return (
    <svg viewBox="0 0 400 250" className="seq-house" role="img" aria-label={label}>
      <rect x={0} y={0} width={400} height={ground} className="seq-sky" />
      <rect x={0} y={ground} width={400} height={60} className="seq-soil" />
      {show('excavation') && <path d={`M105 ${ground}L115 ${ground + 30}H285L295 ${ground}Z`} className={`seq-hole ${cls('excavation')}`} />}
      {show('foundations') && <g className={cls('foundations')}><rect x={115} y={ground + 14} width={170} height={16} className="seq-concrete" /><rect x={115} y={ground} width={14} height={30} className="seq-concrete" /><rect x={271} y={ground} width={14} height={30} className="seq-concrete" /></g>}
      {show('slab') && <rect x={108} y={ground - 8} width={184} height={10} className={`seq-concrete ${cls('slab')}`} />}
      {show('walls') && (
        <g className={cls('walls')}>
          <rect x={115} y={100} width={170} height={82} className={done.has('finishes') ? 'seq-walls painted' : 'seq-walls'} />
          {!done.has('finishes') && [112, 124, 136, 148, 160, 172].map(y => <line key={y} x1={115} y1={y} x2={285} y2={y} className="seq-brick" />)}
        </g>
      )}
      {inside('insulation') && <rect x={124} y={108} width={152} height={68} className={`seq-insulation ${cls('insulation')}`} />}
      {inside('pipes') && <path d="M140 182V120H175M250 182V130" className={`seq-pipes ${cls('pipes')}`} />}
      {inside('wires') && <path d="M160 108V150H200M230 108V160H260" className={`seq-wires ${cls('wires')}`} />}
      {show('windows') && (
        <g className={cls('windows')}>
          <rect x={140} y={118} width={36} height={30} className="seq-window" />
          <rect x={224} y={118} width={36} height={30} className="seq-window" />
          <rect x={186} y={140} width={28} height={42} className="seq-door" />
        </g>
      )}
      {show('roof') && <path d={`M100 ${done.has('walls') ? 100 : 60}L200 ${done.has('walls') ? 46 : 6}L300 ${done.has('walls') ? 100 : 60}Z`} className={`seq-roof ${cls('roof')}`} />}
      {show('sign') && (
        <g className={cls('sign')}>
          <rect x={32} y={140} width={4} height={50} className="seq-post" />
          <rect x={14} y={122} width={40} height={26} rx={3} className="seq-sign" />
          <text x={34} y={140} textAnchor="middle" className="seq-sign-text">✓</text>
        </g>
      )}
      {done.has('finishes') && <text x={320} y={ground - 4} className="seq-plant">🌷</text>}
    </svg>
  );
}
