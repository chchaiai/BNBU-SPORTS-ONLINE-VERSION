import test from 'node:test';import assert from 'node:assert/strict';
import {supportsStudentBrowser} from './js/student-device.js';
const android='Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const ios='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
test('Chrome and Edge are accepted on Android, iOS and desktop',()=>{
 for(const userAgent of [android,android+' EdgA/140.0',ios+' CriOS/140.0 Mobile/15E148 Safari/604.1',ios+' EdgiOS/140.0 Mobile/15E148 Safari/604.1','Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0'])assert.equal(supportsStudentBrowser({userAgent}),true,userAgent);
});
test('embedded browsers can enter the student portal',()=>{
 for(const suffix of [' MicroMessenger/8.0',' MQQBrowser/14.0',' QQ/9.0',' AlipayClient/10.0',' DingTalk/7.0',' FBAV/20',' Instagram 1.0'])assert.equal(supportsStudentBrowser({userAgent:android+suffix,userAgentData:{brands:[{brand:'Google Chrome'}]}}),true,suffix);
 assert.equal(supportsStudentBrowser({userAgent:android.replace('Android 15;','Android 15; wv;')}),true);
});
test('other browser brands and unknown agents are accepted',()=>{
 for(const suffix of [' SamsungBrowser/28.0',' HuaweiBrowser/15.0',' HeyTapBrowser/40.0',' VivoBrowser/20.0',' MiuiBrowser/18.0',' UCBrowser/16.0',' Quark/7.0',' OPR/90.0',' Vivaldi/7.0',' YaBrowser/20.0'])assert.equal(supportsStudentBrowser({userAgent:android+suffix}),true,suffix);
 for(const userAgent of ['','Unknown Browser/1.0'])assert.equal(supportsStudentBrowser({userAgent}),true);
 assert.equal(supportsStudentBrowser({userAgent:android,brave:{}}),true);
});
test('client hints do not restrict browser access',()=>{
 assert.equal(supportsStudentBrowser({userAgent:android,userAgentData:{brands:[{brand:'Chromium'},{brand:'Not/A)Brand'}]}}),true);
 for(const brand of ['Google Chrome','Microsoft Edge'])assert.equal(supportsStudentBrowser({userAgent:android,userAgentData:{brands:[{brand:'Chromium'},{brand}]}}),true);
});

test('Safari and Firefox are accepted on supported devices',()=>{
 for(const userAgent of [ios+' Version/18.0 Mobile/15E148 Safari/604.1',ios+' FxiOS/130.0 Mobile/15E148 Safari/604.1','Mozilla/5.0 (Android 15; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'])assert.equal(supportsStudentBrowser({userAgent}),true);
 assert.equal(supportsStudentBrowser({userAgent:ios+' Version/18.0 Mobile/15E148 Safari/604.1 MicroMessenger/8.0'}),true);
});
