import type {PDFDocumentProxy} from 'pdfjs-dist';
export type PdfSearchHit={unit:number;start:number;end:number;snippet:string;before:number;length:number};
export type PdfChapter={id:string;title:string;unit:number|null;children:PdfChapter[]};
type TextItem={str:string;hasEOL?:boolean;width?:number;transform?:number[]};
export function searchablePage(items:TextItem[]){
 let text='',rawOffset=0;const starts:number[]=[],ends:number[]=[];let previous:TextItem|undefined;
 for(const item of items){const gap=previous?.transform&&item.transform?Math.hypot(item.transform[4]-previous.transform[4],item.transform[5]-previous.transform[5])-(previous.width||0):null;const boundary=previous?.hasEOL||gap===null||gap>1;if(text&&boundary&&!/\s$/.test(text)&&!/^\s/.test(item.str)){text+=' ';starts.push(rawOffset);ends.push(rawOffset);}
  for(const char of item.str){const normalized=char.normalize('NFKC').toLocaleLowerCase();for(const value of normalized){text+=value;for(let j=0;j<value.length;j++){starts.push(rawOffset);ends.push(rawOffset+char.length);}}rawOffset+=char.length;}previous=item;
 }
 return {text,starts,ends};
}
export function pageMatches(page:ReturnType<typeof searchablePage>,query:string,unit:number,limit=500):PdfSearchHit[]{
 const needle=query.normalize('NFKC').toLocaleLowerCase().trim();if(!needle)return [];const hits:PdfSearchHit[]=[];let at=0;
 while(hits.length<limit&&(at=page.text.indexOf(needle,at))!==-1){const left=Math.max(0,at-45),right=Math.min(page.text.length,at+needle.length+75);hits.push({unit,start:page.starts[at],end:page.ends[at+needle.length-1],snippet:page.text.slice(left,right),before:at-left,length:needle.length});at+=Math.max(1,needle.length);}
 return hits;
}
export class PdfTextIndex{
 private cache=new Map<number,ReturnType<typeof searchablePage>>();private weight=0;
 constructor(private pdf:PDFDocumentProxy){}
 async page(unit:number,signal:AbortSignal){signal.throwIfAborted();let value=this.cache.get(unit);if(value){this.cache.delete(unit);this.cache.set(unit,value);return value;}const pdfPage=await this.pdf.getPage(unit+1);signal.throwIfAborted();const content=await pdfPage.getTextContent();signal.throwIfAborted();value=searchablePage(content.items.filter((item):item is any=>'str' in item));
  if(value.text.length<=256000){this.cache.set(unit,value);this.weight+=value.text.length;while(this.cache.size>32||this.weight>256000){const first=this.cache.keys().next().value!;this.weight-=this.cache.get(first)!.text.length;this.cache.delete(first);}}return value;
 }
 async search(query:string,signal:AbortSignal,update:(hits:PdfSearchHit[],scanned:number,capped:boolean)=>void){const hits:PdfSearchHit[]=[];
  for(let unit=0;unit<this.pdf.numPages;unit++){signal.throwIfAborted();const page=await this.page(unit,signal);hits.push(...pageMatches(page,query,unit,500-hits.length));if(hits.length>=500){update([...hits],unit+1,true);return;}if(unit%4===0||unit===this.pdf.numPages-1){update([...hits],unit+1,false);await new Promise(resolve=>setTimeout(resolve,0));}}
 }
}
export async function pdfChapters(pdf:PDFDocumentProxy,signal:AbortSignal):Promise<PdfChapter[]>{
 const outline=await pdf.getOutline();signal.throwIfAborted();let count=0;
 const walk=async(items:any[],depth=0):Promise<PdfChapter[]>=>{const result:PdfChapter[]=[];if(depth>20)return result;for(const item of items){signal.throwIfAborted();if(++count>2000)break;let unit:number|null=null;try{const destination=typeof item.dest==='string'?await pdf.getDestination(item.dest):item.dest;if(Array.isArray(destination)){const ref=destination[0];const index=Number.isInteger(ref)?ref:await pdf.getPageIndex(ref);if(Number.isInteger(index)&&index>=0&&index<pdf.numPages)unit=index;}}catch{/* A malformed/external entry remains a readable heading. */}signal.throwIfAborted();result.push({id:String(count),title:String(item.title||'Untitled section').slice(0,500),unit,children:await walk(item.items||[],depth+1)});}return result;};
 return walk(outline||[]);
}
