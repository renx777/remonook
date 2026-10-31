import {preparePaletteNotes,searchPaletteNotes} from './palette-search.mjs';
let rows:ReturnType<typeof preparePaletteNotes>=[];
self.onmessage=event=>{const {id,notes,query}=event.data;if(notes)rows=preparePaletteNotes(notes);self.postMessage({id,...searchPaletteNotes(rows,query)});};
