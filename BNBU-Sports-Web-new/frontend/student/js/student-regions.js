import { tx } from './i18n.js';

const regions = [
  ['CN-11','北京','Beijing'],['CN-12','天津','Tianjin'],['CN-13','河北','Hebei'],['CN-14','山西','Shanxi'],['CN-15','内蒙古','Inner Mongolia'],
  ['CN-21','辽宁','Liaoning'],['CN-22','吉林','Jilin'],['CN-23','黑龙江','Heilongjiang'],['CN-31','上海','Shanghai'],['CN-32','江苏','Jiangsu'],
  ['CN-33','浙江','Zhejiang'],['CN-34','安徽','Anhui'],['CN-35','福建','Fujian'],['CN-36','江西','Jiangxi'],['CN-37','山东','Shandong'],
  ['CN-41','河南','Henan'],['CN-42','湖北','Hubei'],['CN-43','湖南','Hunan'],['CN-44','广东','Guangdong'],['CN-45','广西','Guangxi'],
  ['CN-46','海南','Hainan'],['CN-50','重庆','Chongqing'],['CN-51','四川','Sichuan'],['CN-52','贵州','Guizhou'],['CN-53','云南','Yunnan'],
  ['CN-54','西藏','Tibet'],['CN-61','陕西','Shaanxi'],['CN-62','甘肃','Gansu'],['CN-63','青海','Qinghai'],['CN-64','宁夏','Ningxia'],['CN-65','新疆','Xinjiang'],
  ['HK','香港','Hong Kong'],['MO','澳门','Macao'],['TW','台湾','Taiwan'],['OTHER','其他国家或地区','Other country or region'],
];
export const studentRegionOptions = () => regions.map(([value, zh, en]) => ({ value, label: tx(zh, en) }));
export function studentRegionLabel(code) { return studentRegionOptions().find(region => region.value === code)?.label || tx('未填写','Not provided'); }
