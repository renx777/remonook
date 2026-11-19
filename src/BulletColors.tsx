import './bullet-colors.css';
import {Icon} from './icons';

/** Named bullet colours, stored by name on `bulletColor` so each theme can tune the shade.
 Unknown names (from a newer app) are kept in data and simply drawn as a plain bullet. */
export const BULLET_COLORS = ['red','orange','yellow','green','teal','blue','purple','pink','gray'] as const;
export type BulletColor = typeof BULLET_COLORS[number];
const LABELS: Record<BulletColor,string> = {red:'Red',orange:'Orange',yellow:'Yellow',green:'Green',teal:'Teal',blue:'Blue',purple:'Purple',pink:'Pink',gray:'Gray'};
export const bulletColorOf = (value: unknown): BulletColor | undefined => (BULLET_COLORS as readonly string[]).includes(value as string) ? value as BulletColor : undefined;

/** A Tana-style row of swatches for the bullet menu. */
export function BulletColorPicker({value,disabled,onChange}:{value?:string;disabled?:boolean;onChange:(color:BulletColor|undefined)=>void}) {
  const current = bulletColorOf(value);
  return <div className="bullet-color-row" role="group" aria-label="Bullet color">
    {BULLET_COLORS.map(color => <button key={color} type="button" className="bullet-color-swatch" data-bullet-color={color} data-keywords={`bullet color colour ${color}`} aria-label={`${LABELS[color]} bullet`} title={`${LABELS[color]} bullet`} aria-pressed={current === color} disabled={disabled} onClick={() => onChange(current === color ? undefined : color)}><span className="bullet-color-name">{LABELS[color]}</span></button>)}
    {current && <button type="button" className="bullet-color-swatch is-clear" data-keywords="bullet color colour clear reset default" aria-label="Default bullet color" title="Default bullet color" disabled={disabled} onClick={() => onChange(undefined)}><Icon name="close" size={12}/><span className="bullet-color-name">Default color</span></button>}
  </div>;
}
