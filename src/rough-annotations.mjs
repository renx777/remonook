export const roughTypes=[['circle','Circle'],['box','Box'],['underline','Sketch underline'],['highlight','Sketch highlight']];
export const roughPattern=/^ROUGH_(CIRCLE|BOX|UNDERLINE|HIGHLIGHT)_(AUTO|[0-9A-F]{6})$/i;
export function parseRoughStyle(style){const match=roughPattern.exec(style||'');return match?{type:match[1].toLowerCase(),color:match[2].toUpperCase()}:null;}
export function roughStyle(type,color='AUTO'){const value=`ROUGH_${String(type).toUpperCase()}_${String(color).toUpperCase()}`;return roughPattern.test(value)?value:null;}
export function roughColor(type,color){return color==='AUTO'?(type==='highlight'?'#FFE082':'currentColor'):'#'+color;}
