import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import type { Lang } from '../../types.ts';
import type { Season, SunActivity, SunRoom } from './types.ts';
import type { Scene, SunPosition, WindowLight } from './rules.ts';
import { MIN_ALTITUDE, TIME_STEP, evaluateSun, roomLight, shadowPolygon, sunPosition, times, toSite, towardsSun, windowCentre, windowLight } from './rules.ts';
import { Feedback, NeedsList } from '../../components/Feedback.tsx';
import { colorsOf } from '../floorplan/shared.tsx';

const ui = {
  fr: {
    mission: 'Ta mission', title: 'Le soleil et la maison', check: 'Vérifier l’orientation',
    help: 'Tourne la maison avec les boutons, les flèches du clavier ou la poignée ●. Fais défiler les heures et change de saison pour voir où entre le soleil.',
    rotation: 'Orientation de la maison', left: 'Tourner à gauche', right: 'Tourner à droite',
    seasons: { winter: 'Hiver', equinox: 'Printemps / automne', summer: 'Été' },
    time: 'Heure solaire', play: 'Lancer la journée', pause: 'Pause', night: 'nuit',
    sun: (alt: number, dir: string) => `Soleil : ${alt}° au-dessus de l’horizon, vers le ${dir}`,
    dirs: ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'],
    timelines: 'Soleil dans chaque pièce', legend: { sun: 'soleil direct', shade: 'à l’ombre de l’immeuble', none: 'pas de soleil de ce côté' },
    paths: { winter: 'hiver', summer: 'été' }, compass: { N: 'N', E: 'E', S: 'S', W: 'O' },
    house: (r: number) => `Maison tournée de ${r}°`,
  },
  en: {
    mission: 'Your mission', title: 'The sun and the house', check: 'Check the orientation',
    help: 'Turn the house with the buttons, the arrow keys or the ● handle. Move through the hours and change season to see where the sun comes in.',
    rotation: 'House orientation', left: 'Turn left', right: 'Turn right',
    seasons: { winter: 'Winter', equinox: 'Spring / autumn', summer: 'Summer' },
    time: 'Solar time', play: 'Play the day', pause: 'Pause', night: 'night',
    sun: (alt: number, dir: string) => `Sun: ${alt}° above the horizon, towards the ${dir}`,
    dirs: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'],
    timelines: 'Sun in each room', legend: { sun: 'direct sun', shade: 'in the building’s shadow', none: 'no sun on this side' },
    paths: { winter: 'winter', summer: 'summer' }, compass: { N: 'N', E: 'E', S: 'S', W: 'W' },
    house: (r: number) => `House turned by ${r}°`,
  },
};

const SCALE = 14;
const PAD = 46;
const DAY: [number, number] = [5, 21];
const SEASONS: Season[] = ['winter', 'equinox', 'summer'];

const hourLabel = (h: number) => `${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Timeline of one room for a season: a cell per quarter of an hour. */
function RoomTimeline({ scene, room, season, time, label }: { scene: Scene; room: SunRoom; season: Season; time: number; label: string }) {
  const slots = times(6, 20);
  const W = 4;
  return (
    <div className="sun-timeline">
      <span>{label}</span>
      <svg viewBox={`0 0 ${slots.length * W} 16`} preserveAspectRatio="none" aria-hidden="true">
        {slots.map((t, i) => {
          const sun = sunPosition(scene.latitude, season, t + TIME_STEP / 2);
          const light: WindowLight | 'night' = sun.altitude < MIN_ALTITUDE ? 'night' : roomLight(scene, room, sun);
          return <rect key={t} x={i * W} y={0} width={W - 0.4} height={16} className={`slot ${light}`} />;
        })}
        {time >= 6 && time <= 20 && <line x1={(time - 6) / TIME_STEP * W} x2={(time - 6) / TIME_STEP * W} y1={0} y2={16} className="slot-now" />}
      </svg>
    </div>
  );
}

/** Sun engine: turn a house on its site and see which rooms get direct sun, hour by hour and season by season. */
export function SunGame({ game, lang }: { game: SunActivity; lang: Lang }) {
  const t = ui[lang];
  const { latitude, site, house_at: houseAt, house, obstacles, initial_rotation: initialRotation, rotation_step: step } = game.parameters;
  const [rotation, setRotation] = useState(initialRotation);
  const [season, setSeason] = useState<Season>('equinox');
  const [time, setTime] = useState(9);
  const [playing, setPlaying] = useState(false);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(-1);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setTime(h => {
      if (h + TIME_STEP > DAY[1]) { setPlaying(false); return DAY[1]; }
      return h + TIME_STEP;
    }), 90);
    return () => window.clearInterval(id);
  }, [playing]);

  const scene: Scene = { latitude, rotation, houseAt, house, obstacles };
  const result = evaluateSun(game.constraints, scene);
  const sun: SunPosition = sunPosition(latitude, season, time);
  const up = sun.altitude >= MIN_ALTITUDE;
  const p = (m: number) => PAD + m * SCALE;
  const cx = p(site.width / 2), cy = p(site.depth / 2);
  const radius = (Math.max(site.width, site.depth) / 2) * SCALE + 18;
  /** Sun drawn on the sky dome seen from above: far from the centre when low, close to it when high. */
  const skyPoint = (s: SunPosition): [number, number] => {
    const [dx, dy] = towardsSun(s.azimuth), r = radius * (1 - Math.max(0, s.altitude) / 90);
    return [cx + dx * r, cy + dy * r];
  };
  const revealAt = game.parameters.reveal_paths_hint;
  const showPaths = revealAt !== undefined && hint + 1 >= revealAt;
  const direction = t.dirs[Math.round(sun.azimuth / 45) % 8];

  function turn(delta: number) {
    setRotation(r => (((r + delta) % 360) + 360) % 360);
    setChecked(false);
  }

  function onPointer(e: PointerEvent) {
    if (!dragging.current) return;
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const angle = (Math.atan2(pt.x - p(houseAt.x), -(pt.y - p(houseAt.y))) * 180) / Math.PI;
    const snapped = (((Math.round(angle / step) * step) % 360) + 360) % 360;
    if (snapped !== rotation) { setRotation(snapped); setChecked(false); }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      turn(e.key === 'ArrowLeft' ? -step : step);
    }
  }

  function reset() {
    setRotation(initialRotation);
    setSeason('equinox');
    setTime(9);
    setPlaying(false);
    setChecked(false);
    setHint(-1);
  }

  const path = (s: Season) => times(DAY[0], DAY[1] + TIME_STEP).map(h => sunPosition(latitude, s, h)).filter(sp => sp.altitude >= 0).map(skyPoint);
  const hx = p(houseAt.x), hy = p(houseAt.y);

  return (
    <div className="play-layout">
      <section className="playboard">
        <div className="board-heading"><span>✦ {t.mission}</span><span className="tiny-tag">{game.engine}</span></div>
        <p>{game.mission[lang]}</p>
        <p className="floorplan-help">{t.help}</p>
        <div className="drawing sun-drawing">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${site.width * SCALE + 2 * PAD} ${site.depth * SCALE + 2 * PAD}`}
            className="sun-svg"
            role="group"
            aria-label={`${t.house(rotation)}. ${up ? t.sun(Math.round(sun.altitude), direction) : t.night}`}
            onPointerMove={onPointer}
            onPointerUp={() => { dragging.current = false; }}
            onPointerCancel={() => { dragging.current = false; }}
          >
            <circle cx={cx} cy={cy} r={radius} className={`sun-dome${up ? '' : ' night'}`} />
            <rect x={p(0)} y={p(0)} width={site.width * SCALE} height={site.depth * SCALE} rx="6" className="sun-ground" />
            {(['N', 'E', 'S', 'W'] as const).map((k, i) => {
              const [dx, dy] = towardsSun(i * 90);
              return <text key={k} x={cx + dx * (radius + 14)} y={cy + dy * (radius + 14) + 5} textAnchor="middle" className="sun-compass">{t.compass[k]}</text>;
            })}
            {showPaths && (['winter', 'summer'] as const).map(s => {
              const pts = path(s);
              const [lx, ly] = pts[Math.floor(pts.length / 2)];
              return (
                <g key={s} className={`sun-path ${s}`}>
                  <polyline points={pts.map(q => q.join(',')).join(' ')} />
                  <text x={lx} y={ly - 8} textAnchor="middle">{t.paths[s]}</text>
                </g>
              );
            })}
            {up && obstacles.map(o => {
              const poly = shadowPolygon(o, sun);
              return poly && <polygon key={`shadow-${o.id}`} points={poly.map(([x, y]) => `${p(x)},${p(y)}`).join(' ')} className="sun-shadow" />;
            })}
            {obstacles.map(o => (
              <g key={o.id} className="sun-obstacle">
                <rect x={p(o.box.x)} y={p(o.box.y)} width={o.box.width * SCALE} height={o.box.depth * SCALE} />
                <text x={p(o.box.x + o.box.width / 2)} y={p(o.box.y + o.box.depth / 2) + 4} textAnchor="middle">{o.label[lang]}</text>
              </g>
            ))}
            {up && house.rooms.flatMap(room => room.windows.map((w, i) => {
              const light = windowLight(scene, room, w, sun);
              if (light === 'none') return null;
              const [wx, wy] = toSite(windowCentre(room, w, house), rotation, houseAt);
              const [dx, dy] = towardsSun(sun.azimuth);
              return <line key={`${room.id}-${i}`} x1={p(wx)} y1={p(wy)} x2={p(wx + dx * 9)} y2={p(wy + dy * 9)} className={`sun-ray ${light}`} />;
            }))}
            <g
              transform={`translate(${hx} ${hy}) rotate(${rotation})`}
              className="sun-house"
              tabIndex={0}
              role="slider"
              aria-label={t.rotation}
              aria-valuemin={0}
              aria-valuemax={359}
              aria-valuenow={rotation}
              aria-valuetext={t.house(rotation)}
              onKeyDown={onKey}
            >
              {house.rooms.map(room => {
                const light = up ? roomLight(scene, room, sun) : 'none';
                const x = (room.box.x - house.width / 2) * SCALE, y = (room.box.y - house.depth / 2) * SCALE;
                const w = room.box.width * SCALE, h = room.box.depth * SCALE;
                return (
                  <g key={room.id}>
                    <rect x={x} y={y} width={w} height={h} fill={colorsOf(room).fill} className={`sun-room${light === 'sun' ? ' lit' : ''}`} />
                    {/* rooms narrower than 3 m (the hall) are too small for a label */}
                    {Math.min(room.box.width, room.box.depth) >= 3 && (
                      <text x={x + w / 2} y={y + h / 2 + 4} transform={`rotate(${-rotation} ${x + w / 2} ${y + h / 2})`} textAnchor="middle" className="sun-room-label">{room.label[lang]}{light === 'sun' ? ' ☀' : ''}</text>
                    )}
                  </g>
                );
              })}
              <rect x={(-house.width / 2) * SCALE} y={(-house.depth / 2) * SCALE} width={house.width * SCALE} height={house.depth * SCALE} className="sun-walls" />
              {house.rooms.flatMap(room => room.windows.map((w, i) => {
                const b = room.box, ox = -house.width / 2, oy = -house.depth / 2;
                const [x1, y1, x2, y2] = w.facade === 'north' ? [w.from, b.y, w.to, b.y] : w.facade === 'south' ? [w.from, b.y + b.depth, w.to, b.y + b.depth]
                  : w.facade === 'west' ? [b.x, w.from, b.x, w.to] : [b.x + b.width, w.from, b.x + b.width, w.to];
                const light = up ? windowLight(scene, room, w, sun) : 'none';
                return <line key={`${room.id}-w${i}`} x1={(x1 + ox) * SCALE} y1={(y1 + oy) * SCALE} x2={(x2 + ox) * SCALE} y2={(y2 + oy) * SCALE} className={`sun-window ${light}`} />;
              }))}
              <line x1={0} y1={(-house.depth / 2) * SCALE} x2={0} y2={(-house.depth / 2 - 2.2) * SCALE} className="sun-handle-arm" />
              <circle cx={0} cy={(-house.depth / 2 - 2.6) * SCALE} r={9} className="sun-handle" onPointerDown={e => { dragging.current = true; svgRef.current?.setPointerCapture(e.pointerId); }} />
            </g>
            {up && (() => { const [sx, sy] = skyPoint(sun); return <g className="sun-icon"><circle cx={sx} cy={sy} r={13} /><text x={sx} y={sy + 5} textAnchor="middle">☀</text></g>; })()}
          </svg>
        </div>
        <div className="sun-controls">
          <div className="sun-rotation">
            <span>{t.rotation}</span>
            <button className="subtle" aria-label={t.left} onClick={() => turn(-step)}><RotateCcw size={16} /></button>
            <strong>{rotation}°</strong>
            <button className="subtle" aria-label={t.right} onClick={() => turn(step)}><RotateCw size={16} /></button>
          </div>
          <div className="model-tabs" role="group">
            {SEASONS.map(s => <button key={s} className={season === s ? 'active' : ''} aria-pressed={season === s} onClick={() => setSeason(s)}>{t.seasons[s]}</button>)}
          </div>
          <div className="sun-time">
            <button className="subtle" onClick={() => { if (time >= DAY[1]) setTime(DAY[0]); setPlaying(v => !v); }} aria-label={playing ? t.pause : t.play}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <label htmlFor="sun-time">{t.time}</label>
            <input id="sun-time" type="range" min={DAY[0]} max={DAY[1]} step={TIME_STEP} value={time} onChange={e => { setTime(Number(e.target.value)); setPlaying(false); }} />
            <strong>{hourLabel(time)}</strong>
          </div>
          <p className="sun-status">{up ? t.sun(Math.round(sun.altitude), direction) : t.night}</p>
        </div>
      </section>
      <aside className="controls">
        <h2>{t.title}</h2>
        <div className="sun-timelines">
          <div className="needs-head"><span>{t.timelines} · {t.seasons[season]}</span></div>
          {house.rooms.filter(r => r.windows.length).map(room => <RoomTimeline key={room.id} scene={scene} room={room} season={season} time={time} label={room.label[lang]} />)}
          <div className="sun-hours">{[6, 9, 12, 15, 18].map(h => <span key={h} style={{ left: `${((h - 6) / 14) * 100}%` }}>{h} h</span>)}</div>
          <div className="view-legend">
            {(['sun', 'shade', 'none'] as const).map(k => <span key={k}><i className={`slot-swatch ${k}`} />{t.legend[k]}</span>)}
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
