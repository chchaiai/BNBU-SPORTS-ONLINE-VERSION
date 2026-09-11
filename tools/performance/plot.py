import json,pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=pathlib.Path('docs/performance/evidence-20260911')
data=json.loads((root/'aggregate.json').read_text())
history=json.loads((root/'history-ready.json').read_text()) if (root/'history-ready.json').exists() else {'time':'9999'}
groups={}
for r in data:
 if r['mode']!='stage':continue
 name=('Populated' if r['runId'][:19]>=history['time'][:19].replace(':','-') else 'Empty history')+(' / burst' if r['thinkMs']==0 else ' / '+str(r['thinkMs']/1000)+' s interval')
 groups.setdefault(name,[]).append(r)
fig,axes=plt.subplots(2,2,figsize=(11,7))
for label,rows in groups.items():
 for ax,key,title in zip(axes.flat,['p95','rps','cpuAvg','activeConnectionsMax'],['Response p95 (ms)','Achieved requests / second','Host CPU average (%)','Sampled active DB connections']):
  ax.plot([r['vus'] for r in rows],[r[key] for r in rows],marker='o',label=label)
  ax.set_title(title);ax.set_xlabel('Virtual users');ax.grid(alpha=.25)
axes[0,0].axhline(2000,color='red',linestyle='--',label='2 second stop threshold')
axes[0,0].legend(fontsize=7)
fig.suptitle('BNBU Sports bounded capacity test | 2026-09-11')
fig.tight_layout();fig.savefig(root/'capacity.png',dpi=150);fig.savefig(root/'capacity.svg')
svg=root/'capacity.svg'
svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')
