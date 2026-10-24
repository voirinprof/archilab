import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
const dir = new URL('../activities/', import.meta.url);
const files = (await readdir(dir)).filter(f=>f.endsWith('.yaml')||f.endsWith('.yml')).sort();
const ids = new Set();
const known = new Set(['area_equals','min_width','min_area','perimeter_equals','square','not_square']);
const activities=[];
for (const file of files){
  const a=YAML.parse(await readFile(new URL(file,dir),'utf8'),{uniqueKeys:true});
  const fail=(msg)=>{throw new Error(`${file}: ${msg}`)};
  if(!a || typeof a!=='object')fail('Invalid document');
  if(!/^[a-z0-9-]+$/.test(a.id||''))fail('Invalid id');
  if(ids.has(a.id))fail('Duplicate id'); ids.add(a.id);
  if(a.engine!=='dimensions')fail('Unknown engine');
  for(const key of ['title','description','mission'])if(!a[key]?.fr||!a[key]?.en)fail(`Missing translations: ${key}`);
  if(!Array.isArray(a.hints?.fr)||!Array.isArray(a.hints?.en)||!a.feedback?.success?.fr||!a.feedback?.success?.en)fail('Missing hint/feedback translations');
  for(const key of ['width','length']){
    const p=a.parameters?.[key];
    if(!p || ![p.min,p.max,p.step,p.initial].every(Number.isFinite)||p.min>p.max||p.step<=0||p.initial<p.min||p.initial>p.max)fail(`Invalid parameter ${key}`);
  }
  if(!Array.isArray(a.constraints)||!a.constraints.length)fail('Missing constraints');
  for(const c of a.constraints)if(!known.has(c.type)||(!['square','not_square'].includes(c.type)&&!Number.isFinite(c.value)))fail('Invalid constraint');
  activities.push(a);
}
await mkdir(new URL('../src/generated/',import.meta.url),{recursive:true});
await writeFile(new URL('../src/generated/activities.json',import.meta.url),JSON.stringify(activities,null,2));
console.log(`Validated ${activities.length} activities`);
