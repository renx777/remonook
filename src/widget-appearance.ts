import palettes from '../docs/widgets/palettes.json';
import {accountLocalKey} from './data';
export {palettes};
export type WidgetAppearance={palette:keyof typeof palettes.palettes;dynamic:boolean};
export function widgetAppearance():WidgetAppearance{
 try{
  const value=JSON.parse(localStorage.getItem(accountLocalKey('remo-widget-appearance'))||'{}');
  return {palette:Object.hasOwn(palettes.palettes,value.palette)?value.palette:'marigold',dynamic:value.dynamic===true};
 }catch{return {palette:'marigold',dynamic:false};}
}
