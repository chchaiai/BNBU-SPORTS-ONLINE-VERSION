import assert from 'node:assert/strict';
import test from 'node:test';
import { createScreenModule } from './js/lazy-student-screens.js';

const appFixture = () => ({actions:{},state:{workspace:{},authenticated:true},screen:'grades',renders:0,
  screenKey(){return this.screen;},render(){this.renders++;}});
test('deferred screens share a download, install actions, and do not rerender a different page', async()=>{
  let resolve, loads=0;
  const feature=createScreenModule(()=>{loads++;return new Promise(r=>resolve=r);},'actions');
  const app=appFixture();
  assert.match(feature.render('renderPage',app),/正在加载/);
  feature.render('renderPage',app);
  await Promise.resolve(); assert.equal(loads,1);
  app.screen='camera';
  resolve({renderPage:()=>'<p>Ready</p>',actions:{save:()=>1}});
  await feature.ready(app);await new Promise(r=>setTimeout(r,0));
  assert.equal(app.renders,0);assert.equal(app.actions.save(),1);
  assert.equal(feature.render('renderPage',app),'<p>Ready</p>');
});
test('failed imports show recovery without an automatic reload loop',async()=>{
  let loads=0;const feature=createScreenModule(async()=>{loads++;throw Error('offline');});const app=appFixture();
  feature.render('renderPage',app);await new Promise(r=>setTimeout(r,0));
  assert.match(feature.render('renderPage',app),/页面加载失败/);assert.equal(loads,1);
  assert.equal(typeof app.actions['root.reloadScreen'],'function');
});
