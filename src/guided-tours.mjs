export const guideCatalog=[
 {id:'reading',title:'Read & annotate',detail:'Find your books, highlight ideas and keep notes beside the page.',icon:'study'},
 {id:'study',title:'Turn notes into study cards',detail:'Build a question and answer, then choose how to review.',icon:'learn'},
 {id:'visual',title:'Think visually',detail:'Find diagrams, editable drawings and image occlusion.',icon:'diagram'},
];
export const guideStorageKey=account=>'remo_guides:v1:'+encodeURIComponent(account);
export function readGuideProgress(storage,account){try{const value=JSON.parse(storage.getItem(guideStorageKey(account))||'{}');return Object.fromEntries(guideCatalog.filter(g=>['done','skipped'].includes(value?.[g.id])).map(g=>[g.id,value[g.id]]));}catch{return {};}}
export function writeGuideProgress(storage,account,progress){try{storage.setItem(guideStorageKey(account),JSON.stringify(progress));return true;}catch{return false;}}
export function guideSteps(id,{reader=false,pdf=false,hasNotes=true,signedIn=false}={}){
 if(!guideCatalog.some(g=>g.id===id))throw Error('This walkthrough is unavailable.');
 if(id==='reading'&&reader)return [
  {title:'Your reading space',description:'The page stays at the center. Use the page field and size controls to find a comfortable view.',target:'.book-reader .reader-pagination',prepare:'reader'},
  ...(pdf?[{title:'Search and contents',description:'Find a word anywhere in this PDF, or jump to a section from its outline.',target:'.book-reader [aria-label="Search and contents"]',prepare:'reader'}]:[]),
  {title:'Keep an idea',description:'Select text in the book, then use the highlighter. Choose a color or add a thought to the selection.',target:'.book-reader .reader-annotation-controls',prepare:'reader'},
  ...(pdf?[{title:'Save a visual detail',description:'Capture an area of a PDF page to save a diagram or passage as an image in your book notes.',target:'.book-reader [aria-label="Capture an area to notes"],.book-reader [aria-label="Cancel PDF capture"]',prepare:'reader'}]:[]),
  {title:'Write beside the book',description:'Open book notes to write while reading. On a small screen, the notes open as a panel. Close this guide whenever you are ready to try it.',target:'.book-reader [aria-label="Edit book notes beside PDF"]',prepare:'reader'},
 ];
 if(id==='reading')return [
  {title:'A home for your books',description:'Your PDFs and EPUBs live here. Open any saved book to continue reading.',target:'.bookshelf-heading',prepare:'bookshelf'},
  {title:signedIn?'Add a book':'Start your private library',description:signedIn?'Choose Add a book to upload a PDF or EPUB, up to 25 MiB. This guide will not upload anything.':'Sign in to upload PDFs and EPUBs to your private bookshelf. This guide will not open sign-in or change your notes.',target:signedIn?'.bookshelf-add':'.bookshelf-empty',prepare:'bookshelf'},
  {title:'Read, highlight, remember',description:'Inside a book, select text to highlight it and write in book notes. PDFs also offer search, an outline and screenshots saved to notes. Use the help button inside the reader for a closer look.',target:'.bookshelf',prepare:'bookshelf'},
 ];
 if(!hasNotes)return [{title:'Start with a note',description:'Add a bullet and write an idea first. Then replay this guide to explore its actions. Nothing is created by the walkthrough.',target:'[data-tour="add-bullet"]',prepare:'notes'}];
 if(id==='visual')return [
  {title:'Every note has actions',description:'Use the bullet actions button beside a note to find its tools. We will open the menu, without editing your note.',target:'[data-tour-active-bullet]',prepare:'bullet'},
  {title:'Open the insert tools',description:'Insert brings together images, tables, equations, diagrams and drawings.',target:'[data-tour="insert-category"]',prepare:'bullet-menu'},
  {title:'Make a diagram',description:'Create diagram opens templates and a live preview. Change labels, or edit Mermaid source. Nothing is inserted until you save.',target:'[data-tour="create-diagram"]',prepare:'insert'},
  {title:'Draw an idea',description:'Open Excalidraw for shapes, handwriting and sketches. Saved drawings stay editable from your note.',target:'[data-tour="create-drawing"]',prepare:'insert'},
  {title:'Turn an image into recall',description:'After adding an image, choose Image occlusion beneath it. Cover the details you want to remember, label the answers and preview the study cards. Close this guide to try a tool.',target:'[data-tour="insert-image"]',prepare:'insert'},
 ];
 return [
  {title:'Start from an idea',description:'A question is a bullet whose children contain its answer. Open a note’s actions to choose its type.',target:'[data-tour-active-bullet]',prepare:'bullet'},
  {title:'Choose the question type',description:'Open Format & type and choose Turn into question on a note when ready. Its children become the answer. This guide leaves the note unchanged.',target:'[data-tour="format-category"]',prepare:'bullet-menu'},
  {title:'Build a notebook',description:'For a whole branch, the Study category contains Make Q&A deck and multiple-choice tools.',target:'[data-tour="study-category"]',prepare:'bullet-menu'},
  {title:'Choose a review style',description:'Spaced repetition reviews cards when they are due. Cram lets you work through a deck in outline order. Open a notebook when you are ready.',target:'.study-mode-switch',prepare:'study'},
 ];
}
