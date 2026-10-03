import {sheetSnap, resizeDescription, revealCheckinField} from './checkin-experience.js';

const bound = new WeakSet();
const focusable = 'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

// Gestures change UI state immediately. Ghosts provide the visual closing motion.
export function connectGestures(ctx, previous, app, play, canAnimate) {
  const {viewport, root} = ctx;
  ctx.app = app;
  const sheet = viewport.querySelector('[data-sport-sheet]');
  const photo = viewport.querySelector('[data-preview-draft]');
  const camera = viewport.querySelector('[data-camera-state]');
  const dialog = sheet || photo || camera;
  const beforeDialog = previous?.sheet || previous?.preview || previous?.cameraState;
  if (dialog) {
    if (sheet) {
      for (const child of root.querySelector('.checkin-prep')?.children || []) if (!child.contains(sheet)) child.inert = true;
    } else root.inert = true;
    if (!beforeDialog) dialog.querySelector(focusable)?.focus({preventScroll:true});
    else if (previous?.activeControl) {
      const old = previous.activeControl;
      [...dialog.querySelectorAll('[data-action]')].find(el=>el.dataset.action===old.action && el.dataset.value===old.value)?.focus({preventScroll:true});
    }
  }
  if (previous?.sheet && !sheet) root.querySelector('[data-action="checkin.pickerOpen"]')?.focus({preventScroll:true});
  if (previous?.preview && !photo) [...root.querySelectorAll('[data-draft-id]')].find(el=>el.dataset.draftId===previous.preview.id)?.focus({preventScroll:true});
  resizeDescription(root.querySelector('#checkin-description'));
  if (canAnimate(root)) {
    if (sheet && !previous?.sheet) play(sheet,{translateY:['35%',0],opacity:[.4,1],duration:320},ctx);
    else if (sheet && previous.sheet) {
      const before = previous.sheet.getBoundingClientRect();
      // Disconnected nodes have no layout: capture dimensions before replacement.
      const height = previous.sheetHeight || before.height;
      if (height && Math.abs(height-sheet.offsetHeight)>2) play(sheet,{height:[height,sheet.offsetHeight],duration:280},ctx);
    }
    if (!sheet && previous?.sheet) ghost(previous.sheet,previous.sheetRect,viewport,ctx,play,{translateY:[0,70],opacity:[1,0],duration:200});
    const image = photo?.querySelector('img.proof-preview-media');
    if (image && previous?.preview?.id !== photo.dataset.previewDraft) {
      const thumbnail = previous?.rects.get(`proof:${photo.dataset.previewDraft}`);
      if (thumbnail) fromRect(image, thumbnail.thumbnail || thumbnail.rect, ctx,play);
      play(photo,{backgroundColor:['rgba(5,5,5,0)','rgb(5,5,5)'],duration:280},ctx);
      play(photo.querySelector('.proof-preview-topbar'),{opacity:[0,1],duration:200},ctx);
    } else if (!photo && previous?.preview?.image && previous.preview.rect) {
      const target = [...root.querySelectorAll('.proof-card')].find(el=>el.dataset.draftId===previous.preview.id)?.querySelector('.proof-queue-thumbnail, .proof-card-media');
      if (target) {
        const a=previous.preview.rect,b=target.getBoundingClientRect();
        const confirming=Boolean(viewport.querySelector('.dialog-scrim'));
        // Fade the backdrop together with the photo; the destination remains live.
        const backdrop=viewport.ownerDocument.createElement('div');backdrop.className='checkin-photo-exit-backdrop';backdrop.inert=true;backdrop.setAttribute('aria-hidden','true');if(confirming)backdrop.style.zIndex='58';viewport.append(backdrop);
        play(backdrop,{opacity:[1,0],duration:280},ctx,()=>backdrop.remove());
        ghost(previous.preview.image,a,viewport,ctx,play,{translateX:[0,b.left-a.left],translateY:[0,b.top-a.top],scaleX:[1,b.width/a.width],scaleY:[1,b.height/a.height],opacity:[1,0],duration:280},confirming ? 59 : 1100);
      }
    }
    if (camera && camera.dataset.cameraState !== previous?.cameraState) {
      play(camera.querySelector('.live-video-info-card'),{opacity:[.4,1],translateY:[3,0],duration:220},ctx);
      if (camera.dataset.cameraState === 'ready') play(camera.querySelector('video'),{opacity:[0,1],duration:220},ctx);
    }
  }
  if (bound.has(viewport)) return;
  bound.add(viewport);
  let gesture, suppressClick = false;
  const action = name => ctx.app?.actions?.[name]?.(ctx.app);
  viewport.addEventListener('keydown',event=>{
    const current = viewport.querySelector('[data-sport-sheet], [data-preview-draft], [data-camera-state]');
    if (!current) return;
    if (event.key === 'Escape') {event.preventDefault(); action(current.matches('[data-sport-sheet]')?'checkin.pickerClose':current.matches('[data-preview-draft]')?'checkin.closeDraftPreview':'checkin.cameraClose');}
    if (event.key === 'Tab') {
      const items = [...current.querySelectorAll(focusable)].filter(el=>el.getClientRects().length);
      const first=items[0],last=items.at(-1),active=viewport.ownerDocument.activeElement;
      if (event.shiftKey && (active===first || !current.contains(active))) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && (active===last || !current.contains(active))) {event.preventDefault();first?.focus();}
    }
  });
  viewport.addEventListener('pointerdown',event=>{
    if (event.button !== 0 || !event.isPrimary) return;
    const handle=event.target.closest('[data-sheet-handle]'), image=event.target.closest('img.proof-preview-media');
    const el=handle?.closest('[data-sport-sheet]') || image;
    if (!el) return;
    gesture={el,handle,overlay:image?.closest('[data-preview-draft]'),pointer:event.pointerId,y:event.clientY,start:performance.now(),delta:0};
    el.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove',event=>{
    if (!gesture || gesture.pointer!==event.pointerId) return;
    gesture.delta=event.clientY-gesture.y;
    if (Math.abs(gesture.delta)<5) return;
    suppressClick=true;
    if (canAnimate(ctx.root)) {
      const dy=gesture.handle ? Math.max(-50,gesture.delta) : gesture.delta;
      gesture.el.style.transform=`translateY(${dy}px)`;
      if (!gesture.handle) {
        gesture.el.style.opacity=String(Math.max(.35,1-Math.abs(dy)/500));
        gesture.overlay.style.backgroundColor=`rgba(5,5,5,${Math.max(.25,1-Math.abs(dy)/420)})`;
      }
    }
  });
  const release=event=>{
    if (!gesture || gesture.pointer!==event.pointerId) return;
    const g=gesture; gesture=null;
    const cancelled=event.type==='pointercancel';
    const velocity=g.delta/Math.max(1,performance.now()-g.start);
    const decision=cancelled?'rest':g.handle?sheetSnap(g.el.offsetHeight,g.delta,velocity):Math.abs(g.delta)>100?'closed':'rest';
    // Capture the dragged position before replacing the overlay, so dismissal
    // continues from the finger instead of jumping back to the original center.
    if (decision==='closed') action(g.handle?'checkin.pickerClose':'checkin.closeDraftPreview');
    else {
      const dim=g.overlay?.style.backgroundColor;
      g.el.style.removeProperty('transform');g.el.style.removeProperty('opacity');
      g.overlay?.style.removeProperty('background-color');
      if(decision==='expanded') {ctx.app.ui.checkin.pickerExpanded=true;ctx.app.render();}
      else if(canAnimate(ctx.root)) {
        play(g.el,{translateY:[g.delta,0],duration:240},ctx);
        if(dim)play(g.overlay,{backgroundColor:[dim,'rgb(5, 5, 5)'],duration:240},ctx);
      }
    }
    setTimeout(()=>{suppressClick=false;},0);
  };
  viewport.addEventListener('pointerup',release);viewport.addEventListener('pointercancel',release);
  viewport.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();}},true);
  const win=viewport.ownerDocument.defaultView;
  let viewportFrame;
  const syncKeyboard=()=>{
    win.cancelAnimationFrame(viewportFrame);
    viewportFrame=win.requestAnimationFrame(()=>{
      const root=ctx.root, field=viewport.ownerDocument.activeElement;
      if (!root?.isConnected || root.dataset.checkinPage !== 'finished') return;
      const vv=win.visualViewport, gap=vv && vv.scale===1 ? Math.max(0,win.innerHeight-vv.height-vv.offsetTop) : 0;
      const editing=field?.id==='checkin-description';
      const inset=(editing || root.dataset.keyboardOpen==='true') && gap>80 ? gap : 0;
      root.dataset.keyboardOpen=String(inset>0);
      root.style.setProperty('--checkin-keyboard-inset',`${inset}px`);
      if (editing && inset) revealCheckinField(field,true);
    });
  };
  win.visualViewport?.addEventListener('resize',syncKeyboard);
  win.visualViewport?.addEventListener('scroll',syncKeyboard);
  viewport.addEventListener('focusin',event=>{
    if(event.target.id==='checkin-description') syncKeyboard();
  });
  viewport.addEventListener('focusout',syncKeyboard);
  viewport.addEventListener('checkin-description-status',event=>{
    play(event.target,{opacity:[.55,1],duration:180},ctx);
  });
  let nearLimit=false;
  viewport.addEventListener('input',event=>{
    if(event.target.id!=='checkin-description')return;
    const counter=viewport.querySelector('[data-description-counter]');
    const near=event.target.value.length>=180;
    if(near && !nearLimit)play(counter,{scale:[1,1.08,1],duration:220},ctx);
    nearLimit=near;
  });
}

function fromRect(el, before, ctx,play) {
  const after=el.getBoundingClientRect();
  if(!after.width || !after.height || !before.width)return;
  el.style.transformOrigin='top left';
  play(el,{translateX:[before.left-after.left,0],translateY:[before.top-after.top,0],scaleX:[before.width/after.width,1],scaleY:[before.height/after.height,1],duration:320},ctx,()=>el.style.removeProperty('transform-origin'));
}
function ghost(node,rect,viewport,ctx,play,params,zIndex=1100) {
  if(!rect?.width || !rect?.height)return;
  const clone=node.cloneNode(true);clone.inert=true;clone.setAttribute('aria-hidden','true');
  Object.assign(clone.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,maxHeight:'none',maxWidth:'none',margin:'0',zIndex:String(zIndex),pointerEvents:'none',transformOrigin:'top left'});
  viewport.append(clone);play(clone,params,ctx,()=>clone.remove());
}
