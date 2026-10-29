export const BOOK_LIMIT=25*1024*1024;
export const STORAGE_LIMIT=100*1024*1024;
export const BOOK_COUNT_LIMIT=100;
export const BOOK_TYPES={pdf:'application/pdf',epub:'application/epub+zip'};
export const bookId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
export function checkBook(file){
 const format=String(file.name||'').split('.').at(-1).toLowerCase();
 if(!BOOK_TYPES[format])throw Error('Choose a PDF or EPUB book.');
 if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>BOOK_LIMIT)throw Error('Choose a book up to 25 MiB.');
 if(file.name.length>240)throw Error('Shorten the book filename to 240 characters or fewer.');
 return format;
}
export function validateReadingBooks(books){
 if(books===undefined)return;
 if(!books||typeof books!=='object'||Array.isArray(books)||Object.keys(books).length>1000)throw Error('Invalid reading library.');
 for(const [id,b]of Object.entries(books)){
  if(b?.totalUnits!==undefined&&(!Number.isInteger(b.totalUnits)||b.totalUnits<1||b.totalUnits>10000))throw Error('Invalid book length.');
  if(!bookId(id)||!b||b.id!==id||!BOOK_TYPES[b.format]||typeof b.title!=='string'||b.title.length>240||typeof b.name!=='string'||b.name.length>240||!Number.isSafeInteger(b.size)||b.size<1||b.size>BOOK_LIMIT||!/^[a-f0-9]{64}$/.test(b.hash)||typeof b.deleted!=='boolean'||!Number.isSafeInteger(b.position)||b.position<0||b.position>10000000||!Number.isFinite(b.createdAt)||b.createdAt<0)throw Error('Invalid reading book.');
 }
}
export function registerBooks(doc,books){
 const next={...doc.web.readingBooks};let changed=false;
 for(const book of books){const existing=next[book.id];if(existing)continue;
  const previous=Object.values(next).find(b=>!b.deleted&&b.hash===book.hash);
  if(previous)next[previous.id]={...previous,deleted:true};
  next[book.id]={id:book.id,name:book.name,title:previous?.title||book.name.replace(/\.(pdf|epub)$/i,''),format:book.format,size:book.size,hash:book.hash,createdAt:book.createdAt,position:previous?.position||0,deleted:false};changed=true;
 }
 if(!changed)return doc;validateReadingBooks(next);return {...doc,web:{...doc.web,readingBooks:next}};
}
