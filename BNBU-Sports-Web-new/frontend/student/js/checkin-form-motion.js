// Height motion owns document flow. Its descendants must not also receive FLIP.
export function animateFormReflow(ctx, previous, play) {
  if (previous?.page !== 'finished' || ctx.root.dataset.checkinPage !== 'finished') return false;
  const collapses = [...ctx.root.querySelectorAll('[data-checkin-collapse]')].map(el =>
    ({el,before:previous.collapses?.get(el.dataset.checkinCollapse),height:el.getBoundingClientRect().height}));
  const rows = [...ctx.root.querySelectorAll('.proof-queue-item[data-queue-id]')];
  const previousRows = previous.queue || [];
  const changed = collapses.some(({before,height}) => before && Math.abs(before.height-height) > 1);
  const queueChanged = rows.length !== previousRows.length || rows.some((row,i)=>row.dataset.queueId !== previousRows[i]?.id || Math.abs(row.getBoundingClientRect().height-previousRows[i].height)>1) || previous.queueGhosts?.length;
  for (const {el,before,height} of collapses) {
    if (!before || Math.abs(before.height-height) < 1) continue;
    el.style.visibility = 'visible';
    play(el,{height:[before.height,height],opacity:[Number(before.opacity),height ? 1 : 0],duration:300,ease:'outCubic'},ctx,
      ()=>el.style.removeProperty('visibility'));
  }
  if (queueChanged) {
    const list = ctx.root.querySelector('.proof-queue');
    for (const row of rows) {
      const old = previousRows.find(old=>old.id === row.dataset.queueId);
      const height = row.getBoundingClientRect().height;
      if (!old) play(row,{height:[0,height],paddingTop:[0,12],paddingBottom:[0,12],opacity:[0,1],duration:240},ctx);
      else if (Math.abs(old.height-height)>1) play(row,{height:[old.height,height],duration:240},ctx);
    }
    for (const [index, old] of previousRows.entries()) if (!rows.some(row=>row.dataset.queueId === old.id) && list) {
      const clone = old.node.cloneNode(true);
      clone.setAttribute('data-motion-ghost',''); clone.removeAttribute('data-queue-id');
      clone.inert = true; clone.setAttribute('aria-hidden','true');
      for (const node of clone.querySelectorAll('[data-draft-id], [data-action]')) {
        node.removeAttribute('data-draft-id'); node.removeAttribute('data-action');
      }
      list.insertBefore(clone, rows.find(row=>previousRows.findIndex(item=>item.id === row.dataset.queueId)>index) || null);
      play(clone,{height:[old.height,0],paddingTop:[12,0],paddingBottom:[12,0],opacity:[1,0],duration:240},ctx,()=>clone.remove());
    }
    for (const old of previous.queueGhosts || []) if (list) {
      const clone=old.node.cloneNode(true); list.insertBefore(clone,list.children[old.index] || null);
      play(clone,{height:[old.height,0],paddingTop:[parseFloat(old.padding)||0,0],paddingBottom:[parseFloat(old.padding)||0,0],opacity:[Number(old.opacity),0],duration:180},ctx,()=>clone.remove());
    }
  }
  // Restore the reading position after the old heights are in flow again.
  const scroller=ctx.root.closest('[data-scroll-key]');
  if ((changed || queueChanged) && scroller) scroller.scrollTop=previous.scrollTop || 0;
  return changed || queueChanged;
}

export function animateFieldError(error, ctx, play, removing = false) {
  if (error.dataset.removing) return;
  const height = error.getBoundingClientRect().height;
  const gap = parseFloat(error.ownerDocument.defaultView.getComputedStyle(error.parentElement).rowGap) || 0;
  if (removing) error.dataset.removing = 'true';
  play(error,{height:removing ? [height,0] : [0,height],opacity:removing ? [1,0] : [0,1],
    marginTop:removing ? [0,-gap] : [-gap,0],duration:220},ctx,removing ? ()=>error.remove() : undefined);
}
