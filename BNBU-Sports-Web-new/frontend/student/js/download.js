const tabs = [...document.querySelectorAll('[data-device]')];
function selectDevice(device, focus = false) {
  for (const tab of tabs) {
    const selected = tab.dataset.device === device;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
    if (selected && focus) tab.focus();
  }
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectDevice(tab.dataset.device));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); selectDevice(tabs[next].dataset.device, true); }
  });
});
const ua = navigator.userAgent;
const device = /huawei|harmonyos/i.test(ua) ? 'huawei' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : null;
if (device) { selectDevice(device); document.getElementById('device-hint').textContent = '已根据设备优先展示指引，你也可以手动切换'; }
document.getElementById('browser-tip').hidden = !/MicroMessenger|\bQQ\//i.test(ua);
