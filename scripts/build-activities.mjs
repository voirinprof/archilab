import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
const dir = new URL('../activities/', import.meta.url);
const files = (await readdir(dir)).filter(f=>f.endsWith('.yaml')||f.endsWith('.yml')).sort();
const ids = new Set();
const known = new Set(['area_equals','min_width','min_area','perimeter_equals','square','not_square']);
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
function validateFloorplan(a,fail){
  const mode=a.parameters?.mode??'layout';
  if(!['layout','doors'].includes(mode))fail(`Invalid mode ${mode}`);
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
  rooms.forEach((a1,n)=>rooms.slice(n+1).forEach(b1=>{
    const p=a1.initial,q=b1.initial;
    if(p.x<q.x+q.width&&q.x<p.x+p.width&&p.y<q.y+q.depth&&q.y<p.y+p.depth)fail(`Initial rooms overlap: ${a1.id} / ${b1.id}`);
  }));
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
      default: fail(`Unknown constraint ${c.type}`);
    }
  }
  if(!localized(a.feedback?.failure))fail('Missing translations: feedback.failure');
  if(!localized(a.explanation))fail('Missing translations: explanation');
  if(!Array.isArray(a.concepts?.fr)||!Array.isArray(a.concepts?.en))fail('Missing translations: concepts');
  if(a.hints.fr.length!==a.hints.en.length)fail('Hints must have the same count in fr and en');
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
  for(const key of ['title','description','mission'])if(!a[key]?.fr||!a[key]?.en)fail(`Missing translations: ${key}`);
  if(!Array.isArray(a.hints?.fr)||!Array.isArray(a.hints?.en)||!a.feedback?.success?.fr||!a.feedback?.success?.en)fail('Missing hint/feedback translations');
  if(!Array.isArray(a.constraints)||!a.constraints.length)fail('Missing constraints');
  validators[a.engine](a,fail);
  activities.push(a);
}
await mkdir(new URL('../src/generated/',import.meta.url),{recursive:true});
await writeFile(new URL('../src/generated/activities.json',import.meta.url),JSON.stringify(activities,null,2));
console.log(`Validated ${activities.length} activities`);
