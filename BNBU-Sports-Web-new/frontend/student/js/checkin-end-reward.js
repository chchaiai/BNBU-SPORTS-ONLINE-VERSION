import {tx} from './i18n.js';

export function endRewardText(credited) {
  return credited === 0 ? tx('每一次行动，都有意义。','Every effort matters.')
    : Number.isFinite(credited) && credited > 0 ? tx('目标达成，做得不错。','Goal reached. Well done.')
    : tx('今天的坚持，已完成。','Your effort for today is complete.');
}

// Only a live, same-account session transition earns a one-time presentation.
// Restored forms, dialog cancellation and submission have their own feedback.
export function isEndReward(previous, root) {
  return Boolean(previous?.page === 'running' && ['active','paused'].includes(previous.phase)
    && root.dataset.checkinPage === 'finished' && previous.owner === root.dataset.checkinOwner
    && previous.session && previous.session === root.dataset.checkinSession);
}

export function animateEndReward(ctx, play, previous) {
  const root=ctx.root, timer=root.querySelector('[data-checkin-motion="timer"]');
  if (!timer) return;
  const doc=root.ownerDocument;
  if(previous?.endSlide?.rect.width){
    const {node,rect}=previous.endSlide,ghost=doc.createElement('div');
    ghost.className='checkin-session-controls checkin-end-commit-ghost';ghost.inert=true;ghost.setAttribute('aria-hidden','true');
    const slide=node.cloneNode(true);
    for(const el of [slide,...slide.querySelectorAll('*')])for(const attr of [...el.attributes])if(attr.name==='id'||attr.name==='tabindex'||attr.name==='data-action')el.removeAttribute(attr.name);
    ghost.append(slide);Object.assign(ghost.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,zIndex:'25',pointerEvents:'none'});
    root.append(ghost);play(ghost,{opacity:[1,0],scale:[1,.98],duration:200},ctx,()=>ghost.remove());
  }
  const halo=doc.createElement('span');
  halo.className='checkin-end-halo';halo.setAttribute('aria-hidden','true');
  timer.append(halo);
  play(halo,{opacity:[0,.65,0],scale:[.85,1.15,1.25],duration:760},ctx,()=>halo.remove());
  const ring=doc.createElementNS('http://www.w3.org/2000/svg','svg');
  ring.setAttribute('viewBox','-90 -55 180 110');ring.setAttribute('aria-hidden','true');
  ring.classList.add('checkin-end-ring');
  const path=doc.createElementNS('http://www.w3.org/2000/svg','path');
  const arc='M -70 20 C -45 -8 -25 -12 0 -12 C 25 -12 45 -8 70 20 C 45 -8 25 -12 0 -12 C -25 -12 -45 -8 -70 20';
  const circle='M -38 0 C -38 -21 -21 -38 0 -38 C 21 -38 38 -21 38 0 C 38 21 21 38 0 38 C -21 38 -38 21 -38 0';
  path.setAttribute('d',arc);ring.append(path);timer.append(ring);
  play(path,{d:[arc,circle],duration:420,delay:180,ease:'inOutCubic'},ctx);
  play(ring,{opacity:[0,.38,0],duration:780},ctx,()=>ring.remove());
  const message=root.querySelector('[data-end-encouragement]');
  play(message,{opacity:[0,1],translateY:[5,0],duration:260,delay:360},ctx);
}
