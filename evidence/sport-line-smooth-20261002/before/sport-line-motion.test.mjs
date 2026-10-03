import test from 'node:test';
import assert from 'node:assert/strict';
import {icon} from './js/icons.js';
import {SPORT_OPTIONS} from './js/sports-catalog.js';
import {REFERENCE_SPORT_GLYPHS} from './js/sport-reference-glyphs.js';
import {lineSportClip,lineSportCue,playLineSport} from './js/sport-line-motion.js';

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
      assert.ok(params.duration>0&&params.duration<=1400);
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
  const svg={dataset:{lineSport:'sport-stretch_flex'},querySelector(selector){return selector==='path'?path:null;}};
  playLineSport(svg,'select',{},(_element,_params,_context,cleanup)=>{d='';cleanup();});
  assert.equal(d,REFERENCE_SPORT_GLYPHS['sport-stretch_flex'].match(/<path d="([^"]+)"/)[1]);
});
