import test from 'node:test';
import assert from 'node:assert/strict';
import {icon} from './js/icons.js';
import {SPORT_OPTIONS} from './js/sports-catalog.js';
import {REFERENCE_SPORT_GLYPHS} from './js/sport-reference-glyphs.js';
import {lineSportClip,lineSportCue,playLineSport,smoothLineValue,compileLineClip} from './js/sport-line-motion.js';

test('resting artwork is the exact original reference with only a head interaction marker',()=>{
  for(const [name,outline] of Object.entries(REFERENCE_SPORT_GLYPHS)) {
    const html=icon(name,24);
    const inner=html.slice(html.indexOf('>')+1,html.lastIndexOf('</svg>')).replaceAll(' data-line-head','');
    assert.equal(inner,outline,name);
    assert.match(html,/viewBox="0 0 24 24"/);
    assert.match(html,/stroke-width="1.5"/);
  }
});

test('every sport has a finite clip and path motion returns to exactly the original outline',()=>{
  const tokens=d=>d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g).map(v=>/^[a-zA-Z]$/.test(v)?v:'#').join(' ');
  for(const sport of SPORT_OPTIONS)for(const phase of ['select','active','pause','finish']) {
    const clip=lineSportClip(sport.icon,phase);assert.ok(clip.length,sport.value);
    for(const {params} of clip) {
      assert.ok(params.duration>0&&params.duration<=2100);
      assert.equal(params.loop,undefined);
      if(params.d){
        const original=REFERENCE_SPORT_GLYPHS[sport.icon].match(/<path d="([^"]+)"/)[1];
        assert.equal(params.d[0],original);assert.equal(params.d.at(-1),original);
        for(const frame of params.d)assert.equal(tokens(frame),tokens(original),sport.value);
      }
    }
  }
});

test('phase cues suppress repeated renders and distinguish resume and finish',()=>{
  const current={owner:'a',session:'s',sport:'running',phase:'active'};
  assert.equal(lineSportCue(current,{...current}),null);
  assert.equal(lineSportCue(current,{...current,phase:'paused'}),'pause');
  assert.equal(lineSportCue({...current,phase:'paused'},current),'active');
  assert.equal(lineSportCue(current,{...current,phase:'finished'}),'finish');
  assert.equal(lineSportCue(current,{...current,sport:'basketball',phase:'idle'}),'select');
});

test('completion or interruption restores the exact path even if the engine clears the attribute',()=>{
  let d='';
  const path={style:{removeProperty(){}},setAttribute(name,value){if(name==='d')d=value;}};
  const svg={dataset:{lineSport:'sport-stretch_flex'},closest(){return null;},querySelector(selector){return selector==='path'?path:null;}};
  const ctx={root:{dataset:{checkinOwner:'a',checkinSession:'s'},querySelector(){return {dataset:{checkinSportKey:'stretch_flex'}};}}};
  playLineSport(svg,'select',ctx,(_element,_params,_context,cleanup)=>{d='';cleanup();});
  assert.equal(d,REFERENCE_SPORT_GLYPHS['sport-stretch_flex'].match(/<path d="([^"]+)"/)[1]);
});

test('curves keep continuous velocity through intermediate poses without overshoot',()=>{
  const values=[0,-12,-22,15,6,-3,0], n=values.length-1,step=1e-6;
  for(let i=1;i<n;i++) {
    const t=i/n, left=(smoothLineValue(values,t)-smoothLineValue(values,t-step))/step,right=(smoothLineValue(values,t+step)-smoothLineValue(values,t))/step;
    assert.ok(Math.abs(left-right)<.05);
  }
  for(let i=0;i<n;i++)for(let j=0;j<=50;j++) {
    const v=smoothLineValue(values,(i+j/50)/n);
    assert.ok(v>=Math.min(values[i],values[i+1])-1e-8&&v<=Math.max(values[i],values[i+1])+1e-8);
  }
});

test('body and equipment share one cached clip clock and restore all original paths',()=>{
  for(const sport of SPORT_OPTIONS) {
    const clip=compileLineClip(sport.icon,'select');assert.strictEqual(clip,compileLineClip(sport.icon,'select'));
    assert.ok(Number.isFinite(clip.duration)&&clip.duration<=2100);
    for(const track of clip.tracks)for(const property of track.properties) {
      if(property.property==='d')for(let i=0;i<property.series.length;i++) {
        assert.equal(smoothLineValue(property.series[i],0),property.rest[i]);
        assert.equal(smoothLineValue(property.series[i],1),property.rest[i]);
      }
    }
  }
});

test('rapid replay taps keep the same clock; same-phase rerender resumes elapsed time',()=>{
  const path={style:{},setAttribute(){}};
  const create=()=>({dataset:{lineSport:'sport-stretch_flex'},closest(){return null;},querySelector(selector){return selector==='path'?path:null;}});
  const ctx={root:{dataset:{checkinOwner:'a',checkinSession:'s'},querySelector(){return {dataset:{checkinSportKey:'stretch_flex'}};}}};
  let calls=0;
  const play=(_clock,params)=>{calls++;assert.equal(params.ease,'linear');return {cancel(){}};};
  const first=create();playLineSport(first,'select',ctx,play);playLineSport(first,'select',ctx,play);
  assert.equal(calls,1);
  const job=ctx.linePlayback.get('hero');job.start-=300;
  let resumed;
  playLineSport(create(),'select',ctx,(_clock,params)=>{resumed=params.elapsed[0];return {cancel(){}};},job);
  assert.ok(resumed>=300);assert.strictEqual(ctx.linePlayback.get('hero'),job);
});
