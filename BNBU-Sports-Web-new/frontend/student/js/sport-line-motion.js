// Motion only. All resting SVG paths still come from sport-reference-glyphs.js.
import {REFERENCE_SPORT_GLYPHS} from './sport-reference-glyphs.js';

const variants={
  running:[
    'm5 18 5-1 3-10-5 .5-1.5 4M13 7l2 4 4 .5M11 13l5 2 1 5',
    'm3 14 5 3 5-10-5 .5-1.5 4M13 7l4 2 4-1.5M11 13l2 4-2 4',
  ],
  swimming:[
    'm5 13 5-3 4-4 5 1M2 16c3 1 4-3 7 0s4-3 7 0 4-1 6-1M2 19c3 1 4-3 7 0s4-3 7 0 4-1 6-1',
    'm5 13 5-3 1-5 4-2M2 16c3 3 4-1 7 0s4-1 7 0 4-3 6-1M2 19c3 3 4-1 7 0s4-1 7 0 4-3 6-1',
  ],
  fitness:[
    'M3 4h18M4 1v6m-2-5v4m18-5v6m2-5v4M7 5v6l3 3h4l3-3V5m-7 9v4m4-4v4m-4 0-2 1-1 4m7-5 2 1 1 4',
  ],
  cycling:[
    'm17 10-3-1-3-3-4 3 4 4v4',
    'm16 10-3-1-3-3-4 3 3 3v7',
  ],
  aerobics:[
    'M8 2c-3 4 0 7 4 8s6 1 9-1M10 10l-2 4 1 9m-1-9 6 2-1 4',
  ],
  health_qigong:[
    'm3 7 3 2 6 0 8 1M10 10v4l-4 1-1 6h2l1-3 4-1 4 1 2 3h2l-3-6-3-1v-3M4 21h4m10 0h4',
  ],
  frisbee:[
    'M2 13l2-3 5-1c4 1 6-1 8-3M8 10l-3 7-4 4m6-6 4 2v4',
  ],
  golf:[
    'm10 2 5 1v1M14 4l-5 4 2 5-5 9m5-9 1 1v8',
  ],
  kayaking:[
    'm6 15 2-6h5m-10 7h5l9-8m-9 8 4-1h10l-2 3H3l-3-3h6M17 8l4-4 2 1-4 4ZM1 22c3-1 4 1 7 0s4 1 7 0 4 1 7 0',
  ],
  pilates:[
    'm5 13 11-4m-11 4 8 2L22 5c1 2-1 3-2 4l-7 12c-4 2-9-3-12-6l4-2Zm8 2v6',
  ],
  rugby:[
    'm4 11 2-4h5l4 3 2 1m-4 0-2 2 2 3-2 7M8 12l-3 5H1m10-4 3 1',
  ],
  self_defense:[
    'm12 5-2 2-4 1-1 4 3-1 3 2v9m1-12 9-8c2-1 3 0 1 2l-7 8-2 10h-3',
  ],
  stretch_flex:[
    'M17 4C9 4 6 9 5 16c-7 1-7 3-2 3h17c3 0 3-2 0-3l-8-4c-1 0-4 2-4 3l10 3',
    'M14 2C7 3 4 9 5 16c-7 1-7 3-2 3h17c3 0 3-2 0-3l-10-4c-1 0-2 2-2 3l10 3',
  ],
  tennis:[
    'm7 9 1 2 4 0 2-3 2 1 2 4-1 3 4 6m-3-9-7 3-3 6',
  ],
  yoga:[
    'M3 14l4-1 1-4c1-3 7-3 8 0l1 4 4 1M10 13v4H7c-3 0-3 4 0 4h10c3 0 3-4 0-4h-3v-4',
  ],
  orienteering:[
    'm2 11 2-4 4-1 3 4m-3-3-2 8-4 7m5-9 4 3v6m1-14 3-1 3 1-2 6-3-1-3 1 2-6Zm3-1-2 6M16 22l6-7v7Z',
  ],
  outdoor_leadership:[
    'm5 10-2 3-2-1 1-6c1-3 4-2 3 1l-1 5m4-4 2 3 3 1M8 7l-2 9-3 7h2l3-5 2 5h2l-1-7-3-2m6-4 2 13',
  ],
  chinese_archery:[
    'M7 11H2c-2 0-2 2 0 2h7m0-2h13m-2-1 2 1-2 1M8 13v5l-2 5m4-10 2 10M13 9l4-7c5 7 5 12 0 18m0-18 2 9-2 9m-4-7 4 7',
  ],
};
const item=(selector,params,origin)=>({selector,params,origin});

export function lineSportCue(previous,next) {
  if(!previous||previous.owner!==next.owner||previous.sport!==next.sport||previous.session!==next.session||previous.phase!==next.phase)
    return next.phase==='finished'?'finish':next.phase==='paused'?'pause':next.phase==='active'?'active':'select';
  return null;
}

export function lineSportClip(name,cue='select') {
  const sport=name.replace(/^sport-/, '').replaceAll('-','_');
  const slow=['stretch_flex','yoga','pilates','health_qigong','fitness'].includes(sport);
  const duration=cue==='active'?(slow?1800:1200):slow?2100:1500;
  if(cue==='pause')return [item('svg',{translateY:[0,.6,0],scaleY:[1,.98,1],duration:260},'12px 20px')];
  if(cue==='head')return [item('[data-line-head]',{translateY:[0,.65,0],duration:320})];
  const plan=[];
  const d=REFERENCE_SPORT_GLYPHS[name]?.match(/<path d="([^"]+)"/)?.[1];
  if(d && variants[sport]) {
    const [a,b]=variants[sport];
    plan.push(item('path',{d:b?[d,a,d,b,d]:[d,a,d],duration}));
  }
  if(sport==='basketball')plan.push(item('svg',{translateY:[0,-1,2,-1,2,-.5,0],scaleY:[1,1,.93,1,.93,1,1],rotate:[0,-8,10,-7,8,-2,0],duration},'12px 20px'));
  else if(sport==='football')plan.push(item('svg',{translateY:[0,0,-3,-1,0,-.5,0],rotate:[0,-8,18,30,12,-3,0],duration},'12px 12px'));
  else if(sport==='badminton')plan.push(item('svg',{rotate:[0,-12,-22,15,6,-3,0],translateX:[0,-.5,-1,1.5,.5,-.3,0],translateY:[0,.5,1,-2,-1,0,0],duration},'8px 18px'));
  else if(sport==='table_tennis')plan.push(item('path',{rotate:[0,2,-7,2,-7,1,0],duration},'6px 17px'),item('circle',{translateY:[0,0,-4,0,-3,0,0],translateX:[0,0,-1,0,-1,0,0],duration}));
  else if(sport==='frisbee')plan.push(item('ellipse',{translateX:[0,-1,-1,1.8,1,.3,0],translateY:[0,0,0,-.5,-.2,0,0],duration}));
  else if(sport==='tennis')plan.push(item('ellipse',{rotate:[0,-7,15,-4,0],duration},'7px 10px'),item('circle:nth-of-type(2)',{translateY:[0,0,2,-1,0],translateX:[0,0,-1,0,0],duration}));
  else if(sport==='cheerleading')plan.push(item('path',{rotate:[0,-4,4,-4,4,-1,0],duration},'12px 16px'));
  else if(sport==='dragon_lion_dance')plan.push(item('path',{rotate:[0,-4,4,-4,2,0],duration},'12px 10px'));
  else if(sport==='other')plan.push(item('path',{rotate:[0,-3,3,-3,2,0],duration},'12px 15px'));
  if(!['basketball','football','badminton'].includes(sport))plan.push(item('[data-line-head]',{translateY:[0,-.2,.35,-.2,.2,0],duration}));
  if(cue==='finish') {
    // Finish the sport's gesture first, then a small nod, with the exact resting silhouette.
    for(const entry of plan)entry.params.duration=slow?1400:1100;
    const head=plan.find(entry=>entry.selector==='[data-line-head]');
    if(head)head.params={translateY:[0,.6,0],duration:440,delay:slow?1080:800};
  }
  return plan;
}

// Monotone Hermite interpolation keeps velocity continuous at the key poses.
// Flat tangents at extrema keep a ball from overshooting the floor or a joint.
export function smoothLineValue(values,progress) {
  if(values.length===1)return values[0];
  const t=Math.max(0,Math.min(1,progress))*(values.length-1), i=Math.min(Math.floor(t),values.length-2), u=t-i;
  const slope=k=>{
    if(k===0||k===values.length-1)return 0;
    const a=values[k]-values[k-1],b=values[k+1]-values[k];
    return a*b<=0?0:2*a*b/(a+b);
  };
  return (2*u**3-3*u*u+1)*values[i]+(u**3-2*u*u+u)*slope(i)+(-2*u**3+3*u*u)*values[i+1]+(u**3-u*u)*slope(i+1);
}

const cache=new Map(),live=new WeakMap();
const pathTokens=d=>d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g);
const pathNumbers=d=>pathTokens(d).filter(token=>!isNaN(Number(token))).map(Number);
const atRest=property=>property.startsWith('scale')?1:0;
const sameIdentity=(a,b)=>a&&b&&a.owner===b.owner&&a.session===b.session&&a.sport===b.sport;
const identity=ctx=>({owner:ctx.root.dataset.checkinOwner,session:ctx.root.dataset.checkinSession,sport:ctx.root.querySelector('[data-checkin-sport-key]')?.dataset.checkinSportKey});
const formatPath=(tokens,values)=>{let i=0;return tokens.map(token=>isNaN(Number(token))?token:String(Math.round(values[i++]*10000)/10000)).join(' ');};
const blendValue=(from,to,amount)=>Array.isArray(to)?to.map((v,i)=>from[i]+(v-from[i])*amount):from+(to-from)*amount;

export function compileLineClip(name,cue) {
  const key=`${name}:${cue}`;if(cache.has(key))return cache.get(key);
  const tracks=lineSportClip(name,cue).map(({selector,params,origin})=>{
    const properties=Object.entries(params).filter(([property])=>!['duration','ease','delay'].includes(property)).map(([property,values])=>{
      if(property==='d') {
        const points=values.map(pathNumbers);
        return {property,series:points[0].map((_,i)=>points.map(point=>point[i])),tokens:pathTokens(values[0]),original:values[0],rest:points[0]};
      }
      return {property,series:values,rest:atRest(property)};
    });
    return {selector,properties,origin,duration:params.duration,delay:params.delay||0};
  });
  const clip={tracks,duration:Math.max(...tracks.map(track=>track.duration+track.delay))};cache.set(key,clip);return clip;
}

function sampleTrack(track,elapsed) {
  const t=Math.max(0,Math.min(1,(elapsed-track.delay)/track.duration));
  return Object.fromEntries(track.properties.map(({property,series})=>[property,property==='d'?series.map(values=>smoothLineValue(values,t)):smoothLineValue(series,t)]));
}

export function playLineSport(svg,cue,ctx,play,resume) {
  if(!svg)return;
  // Repeated taps do not rewind an in-flight gesture. A new state can interrupt it.
  const current=live.get(svg);if(current&&current.cue===cue&&!resume)return;
  const slot=svg.closest('.sport-btn')?'picker':'hero',id=identity(ctx);
  ctx.linePlayback ||= new Map();
  const old=ctx.linePlayback.get(slot),clip=compileLineClip(svg.dataset.lineSport,cue);
  const canCarry=sameIdentity(old?.identity,id)&&old.sport===svg.dataset.lineSport;
  const job=resume||{cue,sport:svg.dataset.lineSport,identity:id,clip,start:Date.now(),from:canCarry?old.lastFrame:null};
  const elapsed=Math.max(0,Date.now()-job.start);if(elapsed>=job.clip.duration)return;
  // Cancel before resolving the new DOM's starting styles; old jobs restore theirs.
  current?.effect?.cancel();
  const tracks=new Map(job.clip.tracks.map(track=>[track.selector,track]));
  for(const [selector,frame] of job.from||[])if(!tracks.has(selector))tracks.set(selector,{...frame.track,returning:true});
  const targets=[...tracks.values()].map(track=>{
    const el=track.selector==='svg'?svg:svg.querySelector(track.selector);if(!el)return null;
    const transform=el.style.transform,box=el.style.transformBox,origin=el.style.transformOrigin;
    if(track.origin){el.style.transformBox='view-box';el.style.transformOrigin=track.origin;}
    return {el,track,transform,box,origin};
  }).filter(Boolean);
  const clock={elapsed};
  const draw=()=>{
    const now=clock.elapsed, blend=Math.min(1,now/180),amount=blend*blend*(3-2*blend);
    job.lastFrame=new Map();job.lastElapsed=now;
    for(const {el,track} of targets) {
      const values=track.returning?Object.fromEntries(track.properties.map(p=>[p.property,p.rest])):sampleTrack(track,now);
      const from=job.from?.get(track.selector)?.values;
      for(const property of Object.keys(values))if(from?.[property]!=null&&amount<1)values[property]=blendValue(from[property],values[property],amount);
      job.lastFrame.set(track.selector,{track,values});
      const transforms=[];
      for(const property of track.properties) {
        const value=values[property.property];
        if(property.property==='d')el.setAttribute('d',formatPath(property.tokens,value));
        else transforms.push(`${property.property}(${value}${property.property==='rotate'?'deg':property.property.startsWith('translate')?'px':''})`);
      }
      if(transforms.length)el.style.transform=transforms.join(' ');
    }
  };
  ctx.linePlayback.set(slot,job);live.set(svg,job);draw();
  svg.dataset.linePlaying=cue;
  job.effect=play(clock,{elapsed:[elapsed,job.clip.duration],duration:job.clip.duration-elapsed,ease:'linear',onUpdate:draw},ctx,()=>{
    for(const {el,track,transform,box,origin} of targets) {
      for(const property of track.properties)if(property.property==='d')el.setAttribute('d',property.original);
      if(track.properties.some(p=>p.property!=='d'))el.style.transform=transform||'';
      el.style.transformBox=box||'';el.style.transformOrigin=origin||'';
    }
    if(live.get(svg)===job){live.delete(svg);delete svg.dataset.linePlaying;}
    if(job.lastElapsed>=job.clip.duration-1&&ctx.linePlayback.get(slot)===job)ctx.linePlayback.delete(slot);
  });
}

export function animateLineSports(ctx,previous,play) {
  const root=ctx.root,hero=root.querySelector('[data-checkin-glyph] > svg');
  const next={owner:root.dataset.checkinOwner,session:root.dataset.checkinSession,phase:root.dataset.checkinPhase,sport:root.querySelector('[data-checkin-sport-key]')?.dataset.checkinSportKey};
  const cue=lineSportCue(previous,next);
  const sheet=root.querySelector('[data-sport-sheet]');
  const resume=slot=>{
    const job=ctx.linePlayback?.get(slot);
    return sameIdentity(job?.identity,identity(ctx))?job:null;
  };
  if(!sheet){
    const saved=resume('hero');
    if(cue||previous?.sheet)playLineSport(hero,cue||'select',ctx,play);
    else if(saved)playLineSport(hero,saved.cue,ctx,play,saved);
  }
  const selected=root.querySelector('.sport-btn.selected svg[data-line-sport]');
  if(selected) {
    const saved=resume('picker');
    if(!previous?.sheet||previous.selections?.get('checkin.sport')?.value!==root.querySelector('.sport-btn.selected')?.dataset.value)playLineSport(selected,'select',ctx,play);
    else if(saved)playLineSport(selected,saved.cue,ctx,play,saved);
  }
}
