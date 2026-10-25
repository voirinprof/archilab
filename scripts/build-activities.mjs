import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
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
function validateCommonFloorplan(a,fail){
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
  validateCommonFloorplan(a,fail);
}
function validateFloorplan(a,fail){
  const mode=a.parameters?.mode??'layout';
  if(mode==='furnish')return validateFurnish(a,fail);
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
  validateCommonFloorplan(a,fail);
}
const validators={dimensions:validateDimensions,floorplan:validateFloorplan};
const activities=[];
for (const file of files){
  const a=YAML.parse(await readFile(new URL(file,dir),'utf8'),{uniqueKeys:true});
  const fail=(msg)=>{throw new Error(`${file}: ${msg}`)};
  if(!a || typeof a!=='object')fail('Invalid document');
  if(!/^[a-z0-9-]+$/.test(a.id||''))fail('Invalid id');
  if(ids.has(a.id))fail('Duplicate id'); ids.add(a.id);
  if(!validators[a.engine])fail('Unknown engine');
  if(!categories.has(a.category))fail(`Unknown category ${a.category}`);
  for(const key of ['title','description','mission'])if(!a[key]?.fr||!a[key]?.en)fail(`Missing translations: ${key}`);
  if(!Array.isArray(a.hints?.fr)||!Array.isArray(a.hints?.en)||!a.feedback?.success?.fr||!a.feedback?.success?.en)fail('Missing hint/feedback translations');
  if(!Array.isArray(a.constraints)||!a.constraints.length)fail('Missing constraints');
  validators[a.engine](a,fail);
  activities.push(a);
}
await mkdir(new URL('../src/generated/',import.meta.url),{recursive:true});
await writeFile(new URL('../src/generated/activities.json',import.meta.url),JSON.stringify(activities,null,2));
console.log(`Validated ${activities.length} activities`);
