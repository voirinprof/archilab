import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
const dir = new URL('../activities/', import.meta.url);
const files = (await readdir(dir)).filter(f=>f.endsWith('.yaml')||f.endsWith('.yml')).sort();
const ids = new Set();
const known = new Set(['area_equals','min_width','min_area','perimeter_equals','square','not_square']);
const categories = new Set(['client','site','spaces','shapes','light','structure','materials','comfort','plans','city']); // keep in sync with src/main.tsx
const localized=(v)=>typeof v?.fr==='string'&&v.fr!==''&&typeof v?.en==='string'&&v.en!=='';
const isInt=(v)=>Number.isInteger(v);
function validateDimensions(a,fail){
  for(const key of ['width','length']){
    const p=a.parameters?.[key];
    if(!p || ![p.min,p.max,p.step,p.initial].every(Number.isFinite)||p.min>p.max||p.step<=0||p.initial<p.min||p.initial>p.max)fail(`Invalid parameter ${key}`);
  }
  for(const c of a.constraints)if(!known.has(c.type)||(!['square','not_square'].includes(c.type)&&!Number.isFinite(c.value)))fail('Invalid constraint');
}
const floorplanSides = new Set(['north','south','east','west']);
const CIRCULATION='circulation';
/** Free cells of a fixed plan must form one connected circulation space. */
function circulationIsConnected(plan,rooms){
  const used=(x,y)=>rooms.some(r=>{const i=r.initial;return x>=i.x&&x<i.x+i.width&&y>=i.y&&y<i.y+i.depth});
  const free=[];
  for(let y=0;y<plan.depth;y++)for(let x=0;x<plan.width;x++)if(!used(x,y))free.push(`${x}:${y}`);
  if(!free.length)return true;
  const freeSet=new Set(free),seen=new Set([free[0]]),queue=[free[0]];
  while(queue.length){
    const [x,y]=queue.shift().split(':').map(Number);
    for(const n of [`${x+1}:${y}`,`${x-1}:${y}`,`${x}:${y+1}`,`${x}:${y-1}`])if(freeSet.has(n)&&!seen.has(n)){seen.add(n);queue.push(n)}
  }
  return seen.size===free.length;
}
function validateCommonContent(a,fail){
  if(!localized(a.feedback?.failure))fail('Missing translations: feedback.failure');
  if(!localized(a.explanation))fail('Missing translations: explanation');
  if(!Array.isArray(a.concepts?.fr)||!Array.isArray(a.concepts?.en))fail('Missing translations: concepts');
  if(a.hints.fr.length!==a.hints.en.length)fail('Hints must have the same count in fr and en');
}
/** Furnish mode: fixed-size items on a grid, with rotation and usage zones. */
function validateFurnish(a,fail){
  const {plan,step,items,openings,reveal_passage_hint:reveal}=a.parameters;
  if(!(Number.isFinite(step)&&step>0))fail('Invalid step');
  const onGrid=v=>Number.isFinite(v)&&Math.abs(v/step-Math.round(v/step))<1e-9;
  if(!plan||!onGrid(plan.width)||!onGrid(plan.depth)||plan.width<=0||plan.depth<=0)fail('Invalid plan size');
  if(!Array.isArray(items)||!items.length)fail('Missing items');
  if(!Array.isArray(openings)||!openings.some(o=>o.kind==='door'))fail('Missing door');
  const ids=new Set();
  const rects=[];
  for(const o of openings){
    if(!/^[a-z0-9-]+$/.test(o?.id||'')||ids.has(o.id))fail(`Invalid or duplicate opening id ${o?.id}`);
    ids.add(o.id);
    if(!['door','window'].includes(o.kind)||!localized(o.label)||!floorplanSides.has(o.side))fail(`Invalid opening ${o.id}`);
    const wall=['north','south'].includes(o.side)?plan.width:plan.depth;
    if(!onGrid(o.at)||!onGrid(o.width)||o.width<=0||o.at<0||o.at+o.width>wall)fail(`Opening outside its wall: ${o.id}`);
    if(o.swing!==undefined&&(o.kind!=='door'||!onGrid(o.swing)||o.swing<=0))fail(`Invalid swing: ${o.id}`);
  }
  for(const i of items){
    if(!/^[a-z0-9-]+$/.test(i?.id||'')||ids.has(i.id))fail(`Invalid or duplicate item id ${i?.id}`);
    ids.add(i.id);
    if(!localized(i.label)||typeof i.color!=='string')fail(`Invalid item ${i.id}`);
    if(!i.size||!onGrid(i.size.width)||!onGrid(i.size.depth)||i.size.width<=0||i.size.depth<=0)fail(`Invalid size: ${i.id}`);
    const p=i.initial;
    if(!p||!onGrid(p.x)||!onGrid(p.y)||![0,90,180,270].includes(p.rotation))fail(`Invalid initial placement: ${i.id}`);
    for(const [k,v] of Object.entries(i.usage??{}))if(!['front','back','left','right'].includes(k)||!onGrid(v)||v<=0)fail(`Invalid usage ${k}: ${i.id}`);
    const turned=p.rotation%180!==0;
    const r={x:p.x,y:p.y,width:turned?i.size.depth:i.size.width,depth:turned?i.size.width:i.size.depth};
    if(r.x<0||r.y<0||r.x+r.width>plan.width+1e-9||r.y+r.depth>plan.depth+1e-9)fail(`Item starts outside the room: ${i.id}`);
    for(const o of rects)if(r.x<o.r.x+o.r.width&&o.r.x<r.x+r.width&&r.y<o.r.y+o.r.depth&&o.r.y<r.y+r.depth)fail(`Items overlap at start: ${i.id} / ${o.id}`);
    rects.push({id:i.id,r});
  }
  if(!items.some(i=>!i.fixed))fail('No movable item');
  for(const c of a.constraints){
    if(!localized(c.label))fail(`Missing translations: constraint ${c.type}`);
    switch(c.type){
      case 'usage_clear':
        if(!Array.isArray(c.items)||!c.items.length||!c.items.every(id=>ids.has(id)))fail('Invalid constraint usage_clear');break;
      case 'min_passage':
        if(!ids.has(c.from)||!Array.isArray(c.to)||!c.to.every(id=>ids.has(id))||!(Number.isFinite(c.width)&&c.width>0))fail('Invalid constraint min_passage');break;
      case 'min_distance': case 'max_distance':
        if(!Array.isArray(c.rooms)||c.rooms.length!==2||c.rooms[0]===c.rooms[1]||!c.rooms.every(id=>ids.has(id))||!(Number.isFinite(c.value)&&c.value>=0))fail(`Invalid constraint ${c.type}`);break;
      default: fail(`Unknown constraint ${c.type} for mode furnish`);
    }
  }
  if(reveal!==undefined&&(!isInt(reveal)||reveal<1||reveal>a.hints.fr.length))fail('Invalid reveal_passage_hint');
  validateCommonContent(a,fail);
}
/** Renovate mode: walls given as runs on grid lines, uses given to rooms, works priced. */
function validateRenovate(a,fail){
  const {plan,load_bearing,water,partitions,doors,windows,uses,costs,good_cost,former}=a.parameters;
  if(!plan||!isInt(plan.width)||!isInt(plan.depth)||plan.width<1||plan.depth<1)fail('Invalid plan size');
  const onLine=r=>Array.isArray(r)&&r.length===2&&r.every(p=>Array.isArray(p)&&p.length===2&&p.every(isInt))
    &&(r[0][0]===r[1][0]||r[0][1]===r[1][1])&&!(r[0][0]===r[1][0]&&r[0][1]===r[1][1])
    &&r.every(([x,y])=>x>=0&&y>=0&&x<=plan.width&&y<=plan.depth);
  const keys=r=>{const [[x1,y1],[x2,y2]]=r;const out=[];if(x1===x2)for(let y=Math.min(y1,y2);y<Math.max(y1,y2);y++)out.push(`v:${x1}:${y}`);else for(let x=Math.min(x1,x2);x<Math.max(x1,x2);x++)out.push(`h:${x}:${y1}`);return out;};
  const perimeter=k=>{const [d,x,y]=k.split(':');return d==='v'?(+x===0||+x===plan.width):(+y===0||+y===plan.depth);};
  for(const [name,list] of Object.entries({load_bearing,water,partitions,doors,windows})){
    if(!Array.isArray(list))fail(`Missing ${name}`);
    for(const r of list)if(!onLine(r))fail(`Invalid run in ${name}: ${JSON.stringify(r)}`);
  }
  const walls=new Set([...load_bearing,...water,...partitions].flatMap(keys));
  for(const k of walls)if(perimeter(k))fail(`Interior wall on the outer wall: ${k}`);
  for(const r of windows)for(const k of keys(r))if(!perimeter(k))fail(`Window not on the outer wall: ${k}`);
  const doorKeys=doors.flatMap(keys);
  for(const k of doorKeys)if(!perimeter(k)&&!walls.has(k))fail(`Door without a wall: ${k}`);
  if(!doorKeys.some(perimeter))fail('Missing entrance: no door on the outer wall');
  if(!Array.isArray(uses)||!uses.length)fail('Missing uses');
  const useIds=new Set();
  for(const u of uses){
    if(!/^[a-z0-9-]+$/.test(u?.id||'')||useIds.has(u.id))fail(`Invalid or duplicate use ${u?.id}`);
    useIds.add(u.id);
    if(!localized(u.label)||typeof u.color!=='string')fail(`Invalid use ${u.id}`);
  }
  if(!costs||!['demolish','build','door'].every(k=>Number.isFinite(costs[k])&&costs[k]>=0))fail('Invalid costs');
  if(good_cost!==undefined&&(!Number.isFinite(good_cost)||!localized(a.feedback?.best)))fail('good_cost needs a number and feedback.best');
  for(const f of former??[])if(!localized(f?.label)||!Array.isArray(f.at)||f.at.length!==2)fail('Invalid former use');
  for(const c of a.constraints){
    if(!localized(c.label))fail(`Missing translations: constraint ${c.type}`);
    const known=u=>useIds.has(u);
    switch(c.type){
      case 'use_count': if(!known(c.use)||!isInt(c.min)||c.min<1)fail('Invalid constraint use_count');break;
      case 'use_min_area': if(!c.areas||!Object.entries(c.areas).every(([u,v])=>known(u)&&Number.isFinite(v)&&v>0))fail('Invalid constraint use_min_area');break;
      case 'use_has_window': case 'use_touches_water': if(!Array.isArray(c.uses)||!c.uses.length||!c.uses.every(known))fail(`Invalid constraint ${c.type}`);break;
      case 'all_assigned': case 'all_reachable': break;
      case 'reachable_avoiding_use': if(!Array.isArray(c.uses)||!c.uses.every(known)||!known(c.avoid))fail('Invalid constraint reachable_avoiding_use');break;
      case 'no_door_between_uses': if(!Array.isArray(c.uses)||c.uses.length!==2||!c.uses.every(known))fail('Invalid constraint no_door_between_uses');break;
      case 'max_cost': if(!Number.isFinite(c.value)||c.value<0)fail('Invalid constraint max_cost');break;
      default: fail(`Unknown constraint ${c.type} for mode renovate`);
    }
  }
  validateCommonContent(a,fail);
}
function validateFloorplan(a,fail){
  const mode=a.parameters?.mode??'layout';
  if(mode==='furnish')return validateFurnish(a,fail);
  if(mode==='renovate')return validateRenovate(a,fail);
  if(!['layout','doors'].includes(mode))fail(`Invalid mode ${mode}`);
  const {scale,boundary,reveal_zone_hint:reveal}=a.parameters??{};
  if(scale!==undefined&&!(Number.isFinite(scale)&&scale>0))fail('Invalid scale');
  if(boundary!==undefined&&!['wall','lot'].includes(boundary))fail(`Invalid boundary ${boundary}`);
  if(reveal!==undefined&&(!isInt(reveal)||reveal<1||reveal>(a.hints?.fr?.length??0)))fail('Invalid reveal_zone_hint');
  const plan=a.parameters?.plan;
  if(!plan||!isInt(plan.width)||!isInt(plan.depth)||plan.width<=0||plan.depth<=0)fail('Invalid plan size');
  const rooms=a.parameters?.rooms;
  if(!Array.isArray(rooms)||!rooms.length)fail('Missing rooms');
  const roomIds=new Set();
  for(const r of rooms){
    if(!/^[a-z0-9-]+$/.test(r?.id||'')||roomIds.has(r.id))fail(`Invalid or duplicate room id ${r?.id}`);
    roomIds.add(r.id);
    if(!localized(r.label))fail(`Missing translations: room ${r.id}`);
    if(typeof r.color!=='string')fail(`Missing color: room ${r.id}`);
    const i=r.initial;
    if(!i||![i.x,i.y,i.width,i.depth].every(isInt)||i.width<1||i.depth<1)fail(`Invalid initial rect: room ${r.id}`);
    for(const k of ['width','depth']){
      const b=r[k];
      if(b===undefined&&mode==='doors')continue;
      if(!b||!isInt(b.min)||!isInt(b.max)||b.min<1||b.min>b.max)fail(`Invalid ${k} bounds: room ${r.id}`);
      if(i[k]<b.min||i[k]>b.max)fail(`Initial size out of bounds: room ${r.id}`);
    }
    if(i.x<0||i.y<0||i.x+i.width>plan.width||i.y+i.depth>plan.depth)fail(`Initial rect outside plan: room ${r.id}`);
  }
  const overlap=(p,q)=>p.x<q.x+q.width&&q.x<p.x+p.width&&p.y<q.y+q.depth&&q.y<p.y+p.depth;
  rooms.forEach((a1,n)=>rooms.slice(n+1).forEach(b1=>{
    if(overlap(a1.initial,b1.initial))fail(`Initial rooms overlap: ${a1.id} / ${b1.id}`);
  }));
  const context=a.parameters.context??[];
  if(!Array.isArray(context))fail('Invalid context');
  if(context.length&&mode!=='layout')fail('context requires mode: layout');
  const contextIds=new Set();
  for(const c of context){
    if(!/^[a-z0-9-]+$/.test(c?.id||'')||roomIds.has(c.id)||contextIds.has(c.id))fail(`Invalid or duplicate context id ${c?.id}`);
    contextIds.add(c.id);
    if(!['street','building','tree'].includes(c.kind))fail(`Invalid context kind: ${c.id}`);
    if(!localized(c.label))fail(`Missing translations: context ${c.id}`);
    const r=c.rect;
    if(!r||![r.x,r.y,r.width,r.depth].every(isInt)||r.width<1||r.depth<1)fail(`Invalid context rect: ${c.id}`);
    if(c.root_radius!==undefined&&(c.kind!=='tree'||!(Number.isFinite(c.root_radius)&&c.root_radius>0)))fail(`Invalid root_radius: ${c.id}`);
    for(const flag of ['blocking','heritage','hide_label'])if(c[flag]!==undefined&&typeof c[flag]!=='boolean')fail(`Invalid ${flag}: ${c.id}`);
    if(c.blocking!==false)for(const room of rooms)if(overlap(room.initial,r))fail(`Room ${room.id} starts on context element ${c.id}`);
  }
  const treeIds=new Set(context.filter(c=>c.kind==='tree').map(c=>c.id));
  const best=a.parameters.best_possible;
  if(best!==undefined){
    if(!isInt(best)||best<1||best>treeIds.size)fail('Invalid best_possible');
    if(!localized(a.feedback?.best))fail('Missing translations: feedback.best');
  }
  if(mode==='doors'){
    if(!localized(a.parameters.circulation))fail('Missing translations: circulation');
    if(!circulationIsConnected(plan,rooms))fail('Free space must form a single connected circulation');
  }
  const spaceIds=new Set([...roomIds,CIRCULATION]);
  const doorTypes=new Set(['entrance','all_reachable','door_between','no_door_between','reachable_avoiding','max_doors']);
  for(const c of a.constraints){
    if(!localized(c.label))fail(`Missing translations: constraint ${c.type}`);
    if(doorTypes.has(c.type)&&mode!=='doors')fail(`Constraint ${c.type} requires mode: doors`);
    switch(c.type){
      case 'min_area': case 'max_area':
        if(!roomIds.has(c.room)||!Number.isFinite(c.value))fail(`Invalid constraint ${c.type}`);break;
      case 'adjacent': case 'not_adjacent':
        if(!Array.isArray(c.rooms)||c.rooms.length!==2||c.rooms[0]===c.rooms[1]||!c.rooms.every(id=>roomIds.has(id)))fail(`Invalid constraint ${c.type}`);
        if(c.min_shared!==undefined&&!(Number.isFinite(c.min_shared)&&c.min_shared>0))fail(`Invalid min_shared`);break;
      case 'touches_side':
        if(!roomIds.has(c.room)||!floorplanSides.has(c.side))fail('Invalid constraint touches_side');break;
      case 'entrance':
        if(c.side!==undefined&&!floorplanSides.has(c.side))fail('Invalid constraint entrance: side');
        if(c.spaces!==undefined&&(!Array.isArray(c.spaces)||!c.spaces.length||!c.spaces.every(id=>spaceIds.has(id))))fail('Invalid constraint entrance: spaces');break;
      case 'all_reachable':break;
      case 'door_between': case 'no_door_between':
        if(!Array.isArray(c.rooms)||c.rooms.length!==2||c.rooms[0]===c.rooms[1]||!c.rooms.every(id=>spaceIds.has(id)))fail(`Invalid constraint ${c.type}`);break;
      case 'reachable_avoiding':
        if(!spaceIds.has(c.room)||!spaceIds.has(c.avoid)||c.room===c.avoid)fail('Invalid constraint reachable_avoiding');break;
      case 'max_doors':
        if(!isInt(c.value)||c.value<1)fail('Invalid constraint max_doors');break;
      case 'min_setback':
        if(!roomIds.has(c.room)||!Array.isArray(c.sides)||!c.sides.length||!c.sides.every(s=>floorplanSides.has(s))||!(Number.isFinite(c.value)&&c.value>=0))fail('Invalid constraint min_setback');break;
      case 'min_distance':
        if(!Array.isArray(c.rooms)||c.rooms.length!==2||c.rooms[0]===c.rooms[1]||!c.rooms.every(id=>roomIds.has(id)||contextIds.has(id))||!c.rooms.some(id=>roomIds.has(id))||!(Number.isFinite(c.value)&&c.value>0))fail('Invalid constraint min_distance');break;
      case 'max_coverage':
        if(!(Number.isFinite(c.value)&&c.value>0&&c.value<=100))fail('Invalid constraint max_coverage');break;
      case 'keep_trees':
        if(!Array.isArray(c.trees)||!c.trees.length||!c.trees.every(id=>treeIds.has(id)))fail('Invalid constraint keep_trees');break;
      case 'min_trees_kept':
        if(!isInt(c.value)||c.value<1||c.value>treeIds.size)fail('Invalid constraint min_trees_kept');break;
      default: fail(`Unknown constraint ${c.type}`);
    }
  }
  validateCommonContent(a,fail);
}
/** Blocks engine: target buildings given as height grids, compared through their views. */
function validateBlocks(a,fail){
  const {grid,max_height:maxH,models,reveal_model_hint:reveal}=a.parameters??{};
  if(!grid||!isInt(grid.width)||!isInt(grid.depth)||grid.width<1||grid.depth<1||grid.width>10)fail('Invalid grid');
  if(!isInt(maxH)||maxH<1)fail('Invalid max_height');
  if(!Array.isArray(models)||!models.length)fail('Missing models');
  const ids=new Set();
  for(const m of models){
    if(!/^[a-z0-9-]+$/.test(m?.id||'')||ids.has(m.id))fail(`Invalid or duplicate model id ${m?.id}`);
    ids.add(m.id);
    if(!localized(m.label))fail(`Missing translations: model ${m.id}`);
    const h=m.heights;
    if(!Array.isArray(h)||h.length!==grid.depth||!h.every(row=>Array.isArray(row)&&row.length===grid.width&&row.every(n=>isInt(n)&&n>=0&&n<=maxH)))fail(`Invalid heights: model ${m.id} must be ${grid.depth} rows of ${grid.width} integers between 0 and ${maxH}`);
    if(!h.flat().some(n=>n>0))fail(`Empty model ${m.id}`);
  }
  for(const c of a.constraints){
    if(!localized(c.label))fail(`Missing translations: constraint ${c.type}`);
    if(c.type!=='view_matches'||!['top','south','east'].includes(c.view))fail(`Invalid constraint ${c.type}`);
  }
  if(reveal!==undefined&&(!isInt(reveal)||reveal<1||reveal>a.hints.fr.length))fail('Invalid reveal_model_hint');
  validateCommonContent(a,fail);
}
/** Sun engine: a house turned on its site, rooms lit through their windows, obstacles casting shadows. */
function validateSun(a,fail){
  const P=a.parameters??{};
  const box=b=>b&&[b.x,b.y,b.width,b.depth].every(Number.isFinite)&&b.width>0&&b.depth>0;
  if(!(Number.isFinite(P.latitude)&&P.latitude>0&&P.latitude<66))fail('Invalid latitude (northern hemisphere, below the polar circle)');
  if(!P.site||!(P.site.width>0&&P.site.depth>0))fail('Invalid site');
  if(!P.house_at||![P.house_at.x,P.house_at.y].every(Number.isFinite))fail('Invalid house_at');
  if(!Number.isFinite(P.rotation_step)||P.rotation_step<=0||360%P.rotation_step!==0)fail('rotation_step must divide 360');
  if(!Number.isFinite(P.initial_rotation)||P.initial_rotation%P.rotation_step!==0)fail('initial_rotation must be a multiple of rotation_step');
  const h=P.house;
  if(!h||!(h.width>0&&h.depth>0)||!Array.isArray(h.rooms)||!h.rooms.length)fail('Invalid house');
  const ids=new Set();
  for(const r of h.rooms){
    if(!/^[a-z0-9-]+$/.test(r?.id||'')||ids.has(r.id))fail(`Invalid or duplicate room id ${r?.id}`);
    ids.add(r.id);
    if(!localized(r.label)||!box(r.box)||r.box.x<0||r.box.y<0||r.box.x+r.box.width>h.width||r.box.y+r.box.depth>h.depth)fail(`Invalid room ${r.id}`);
    for(const w of r.windows??[]){
      const along=w.facade==='north'||w.facade==='south'?[r.box.x,r.box.x+r.box.width]:[r.box.y,r.box.y+r.box.depth];
      const onWall={north:r.box.y===0,south:r.box.y+r.box.depth===h.depth,west:r.box.x===0,east:r.box.x+r.box.width===h.width}[w.facade];
      if(!onWall)fail(`Window of ${r.id} is not on an outer wall`);
      if(!(w.from>=along[0]&&w.to<=along[1]&&w.from<w.to))fail(`Window of ${r.id} is outside its room`);
    }
  }
  const hw=Math.hypot(h.width,h.depth)/2;
  for(const o of P.obstacles??[]){
    if(!localized(o.label)||!box(o.box)||!(o.height>0))fail(`Invalid obstacle ${o.id}`);
    // the house turns around its centre: an obstacle within that circle would cut through it
    const nx=Math.max(o.box.x,Math.min(P.house_at.x,o.box.x+o.box.width)),ny=Math.max(o.box.y,Math.min(P.house_at.y,o.box.y+o.box.depth));
    if(Math.hypot(nx-P.house_at.x,ny-P.house_at.y)<hw)fail(`Obstacle ${o.id} is too close to the house`);
  }
  for(const c of a.constraints){
    if(!localized(c.label))fail(`Missing translations: constraint ${c.type}`);
    if(!['min_sun_hours','max_sun_hours'].includes(c.type)||!Array.isArray(c.rooms)||!c.rooms.every(id=>ids.has(id))||!['winter','equinox','summer'].includes(c.season)
      ||!(c.from>=0&&c.to<=24&&c.from<c.to)||!(c.value>=0))fail(`Invalid constraint ${c.type}`);
  }
  if(P.reveal_paths_hint!==undefined&&(!isInt(P.reveal_paths_hint)||P.reveal_paths_hint<1||P.reveal_paths_hint>a.hints.fr.length))fail('Invalid reveal_paths_hint');
  validateCommonContent(a,fail);
}
/** Truss engine: beams between grid points, a given road, supports and loads. */
function validateTruss(a,fail){
  const P=a.parameters??{};
  const range=r=>Array.isArray(r)&&r.length===2&&r.every(isInt)&&r[0]<r[1];
  if(!P.grid||!range(P.grid.x)||!range(P.grid.y))fail('Invalid grid');
  const inGrid=p=>Array.isArray(p)&&p.length===2&&p.every(isInt)&&p[0]>=P.grid.x[0]&&p[0]<=P.grid.x[1]&&p[1]>=P.grid.y[0]&&p[1]<=P.grid.y[1];
  const bar=b=>Array.isArray(b)&&b.length===2&&b.every(inGrid)&&!(b[0][0]===b[1][0]&&b[0][1]===b[1][1]);
  if(!Array.isArray(P.deck)||!P.deck.length||!P.deck.every(bar))fail('Invalid deck');
  if(!Array.isArray(P.supports)||P.supports.length<2||!P.supports.every(inGrid))fail('Invalid supports (at least two points on the grid)');
  if(!Array.isArray(P.loads)||!P.loads.length||!P.loads.every(inGrid))fail('Invalid loads');
  for(const k of ['unit','load','max_length','tension_limit','compression_limit'])if(!(Number.isFinite(P[k])&&P[k]>0))fail(`Invalid ${k}`);
  if(P.pattern!==undefined&&(!Array.isArray(P.pattern)||!P.pattern.every(bar)))fail('Invalid pattern');
  if(P.scene!==undefined&&!['ravine','ground'].includes(P.scene))fail(`Invalid scene ${P.scene}`);
  if(P.load_direction!==undefined&&!(Array.isArray(P.load_direction)&&P.load_direction.length===2&&P.load_direction.every(Number.isFinite)&&Math.abs(Math.hypot(...P.load_direction)-1)<1e-6))fail('load_direction must be a unit vector [x, y]');
  if(P.load_label!==undefined&&!localized(P.load_label))fail('Missing translations: load_label');
  if(P.deck_strength!==undefined&&!(Number.isFinite(P.deck_strength)&&P.deck_strength>0))fail('Invalid deck_strength');
  if(P.reveal_pattern_hint!==undefined&&(!isInt(P.reveal_pattern_hint)||P.reveal_pattern_hint<1||P.reveal_pattern_hint>a.hints.fr.length||!P.pattern))fail('Invalid reveal_pattern_hint');
  for(const c of a.constraints){
    if(!localized(c.label))fail(`Missing translations: constraint ${c.type}`);
    if(!['stable','strong','max_bars'].includes(c.type)||(c.type==='max_bars'&&!(isInt(c.value)&&c.value>0)))fail(`Invalid constraint ${c.type}`);
  }
  validateCommonContent(a,fail);
}
/** Carbon engine: design options with their (simplified) carbon and thermal factors. */
function validateCarbon(a,fail){
  const P=a.parameters??{};
  const pos=v=>Number.isFinite(v)&&v>0, nonNeg=v=>Number.isFinite(v)&&v>=0;
  if(!pos(P.floor_area)||!isInt(P.lifetime)||P.lifetime<1)fail('Invalid floor_area or lifetime');
  const ph=P.physics??{};
  if(!['lambda','surface_resistance','degree_kilohours'].every(k=>pos(ph[k]))||!['ventilation_w_per_k','solar_gain_per_m2'].every(k=>nonNeg(ph[k]))||!(ph.max_gain_share>=0&&ph.max_gain_share<1))fail('Invalid physics');
  const lists={shapes:o=>['compact','long','ell'].includes(o.kind)&&pos(o.envelope)&&isInt(o.storeys)&&o.storeys>0,structures:o=>nonNeg(o.kg_per_m2)&&typeof o.color==='string',insulations:o=>nonNeg(o.kg_per_m2_cm),windows:o=>pos(o.u)&&nonNeg(o.kg_per_m2)&&isInt(o.panes)&&o.panes>0,heatings:o=>['gas','electric','heat-pump','wood'].includes(o.kind)&&pos(o.efficiency)&&nonNeg(o.kg_per_kwh)&&nonNeg(o.embodied_kg)};
  for(const [k,ok] of Object.entries(lists)){
    if(!Array.isArray(P[k])||!P[k].length)fail(`Missing ${k}`);
    const ids=new Set();
    for(const o of P[k]){if(!/^[a-z0-9-]+$/.test(o?.id||'')||ids.has(o.id)||!localized(o.label)||!ok(o))fail(`Invalid option in ${k}: ${o?.id}`);ids.add(o.id);}
  }
  for(const k of ['thickness','glazing']){const s=P[k];if(!s||![s.min,s.max,s.step,s.initial].every(Number.isFinite)||s.min>s.max||s.step<=0||s.initial<s.min||s.initial>s.max)fail(`Invalid ${k}`);}
  const largestWindows=P.glazing.max/100*P.floor_area;
  for(const s of P.shapes)if(s.envelope<=largestWindows)fail(`Shape ${s.id}: envelope smaller than the largest glazing`);
  const init=P.initial??{};
  for(const [k,list] of [['shape','shapes'],['structure','structures'],['insulation','insulations'],['windows','windows'],['heating','heatings']])if(!P[list].some(o=>o.id===init[k]))fail(`Invalid initial ${k}`);
  for(const c of a.constraints){
    if(!localized(c.label))fail(`Missing translations: constraint ${c.type}`);
    if(!['max','min'].includes(c.type)||!['total','embodied','operational','heating_need','glazing'].includes(c.metric)||!Number.isFinite(c.value))fail(`Invalid constraint ${c.type} ${c.metric}`);
  }
  validateCommonContent(a,fail);
}
/** District engine: a grid of plots, plot types described by their effects, fixed areas, noise and walking rules. */
function validateDistrict(a,fail){
  const P=a.parameters??{};
  if(!P.grid||!isInt(P.grid.width)||!isInt(P.grid.height)||P.grid.width<2||P.grid.height<2||P.grid.width>20||P.grid.height>20)fail('Invalid grid');
  for(const k of ['plot_metres','minutes_per_plot'])if(!(Number.isFinite(P[k])&&P[k]>0))fail(`Invalid ${k}`);
  if(!(Number.isFinite(P.cooling)&&P.cooling>=0))fail('Invalid cooling');
  if(!Array.isArray(P.tiles)||!P.tiles.length)fail('Missing tiles');
  const ids=new Set();
  for(const t of P.tiles){
    if(!/^[a-z0-9-]+$/.test(t?.id||'')||t.id==='empty'||ids.has(t.id))fail(`Invalid or duplicate tile id ${t?.id}`);
    ids.add(t.id);
    if(!localized(t.label)||typeof t.color!=='string'||typeof t.icon!=='string'||typeof t.walkable!=='boolean'||!(t.permeable>=0&&t.permeable<=1)||!(Number.isFinite(t.heat)&&t.heat>=0))fail(`Invalid tile ${t.id}`);
    if(t.residents!==undefined&&!(isInt(t.residents)&&t.residents>0))fail(`Invalid residents: ${t.id}`);
  }
  for(const t of P.tiles)if(t.next_to!==undefined&&!ids.has(t.next_to))fail(`Unknown next_to in ${t.id}`);
  const inGrid=c=>Array.isArray(c)&&c.length===2&&c.every(isInt)&&c[0]>=0&&c[1]>=0&&c[0]<P.grid.width&&c[1]<P.grid.height;
  if(!Array.isArray(P.fixed))fail('Missing fixed');
  for(const f of P.fixed)if(!ids.has(f.type)||!P.tiles.find(t=>t.id===f.type).fixed||!inGrid(f.from)||!inGrid(f.to))fail(`Invalid fixed area ${f.type}`);
  if(!P.tiles.some(t=>!t.fixed))fail('No tile to place');
  if(!P.noise||!ids.has(P.noise.source)||!isInt(P.noise.reach)||P.noise.reach<1)fail('Invalid noise');
  for(const c of a.constraints){
    if(!localized(c.label))fail(`Missing translations: constraint ${c.type}`);
    switch(c.type){
      case 'min_population': if(!isInt(c.value)||c.value<1)fail('Invalid min_population');break;
      case 'services_within': if(!Array.isArray(c.services)||!c.services.length||!c.services.every(s=>P.tiles.find(t=>t.id===s)?.service)||!isInt(c.value)||c.value<1)fail('Invalid services_within');break;
      case 'min_green_share': case 'max_impermeable_share': if(!(c.value>=0&&c.value<=100))fail(`Invalid ${c.type}`);break;
      case 'no_noisy_homes': break;
      default: fail(`Unknown constraint ${c.type}`);
    }
  }
  validateCommonContent(a,fail);
}
const validators={dimensions:validateDimensions,floorplan:validateFloorplan,blocks:validateBlocks,sun:validateSun,truss:validateTruss,carbon:validateCarbon,district:validateDistrict};
const activities=[];
for (const file of files){
  const a=YAML.parse(await readFile(new URL(file,dir),'utf8'),{uniqueKeys:true});
  const fail=(msg)=>{throw new Error(`${file}: ${msg}`)};
  if(!a || typeof a!=='object')fail('Invalid document');
  if(!/^[a-z0-9-]+$/.test(a.id||''))fail('Invalid id');
  if(ids.has(a.id))fail('Duplicate id'); ids.add(a.id);
  if(!validators[a.engine])fail('Unknown engine');
  if(!categories.has(a.category))fail(`Unknown category ${a.category}`);
  if(a.share_image!==undefined){
    // optional share image for social networks: a 1200 × 630 file in public/
    if(typeof a.share_image!=='string'||!/^\/[a-z0-9/_-]+\.(png|jpe?g)$/.test(a.share_image))fail('share_image must be a path like /og/my-challenge.png');
    if(!existsSync(new URL(`../public${a.share_image}`,import.meta.url)))fail(`share_image not found in public/: ${a.share_image}`);
  }
  for(const key of ['title','description','mission'])if(!a[key]?.fr||!a[key]?.en)fail(`Missing translations: ${key}`);
  if(!Array.isArray(a.hints?.fr)||!Array.isArray(a.hints?.en)||!a.feedback?.success?.fr||!a.feedback?.success?.en)fail('Missing hint/feedback translations');
  if(!Array.isArray(a.constraints)||!a.constraints.length)fail('Missing constraints');
  validators[a.engine](a,fail);
  activities.push(a);
}
await mkdir(new URL('../src/generated/',import.meta.url),{recursive:true});
await writeFile(new URL('../src/generated/activities.json',import.meta.url),JSON.stringify(activities,null,2));
console.log(`Validated ${activities.length} activities`);
