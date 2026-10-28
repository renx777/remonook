// Public product facts shared by the homepage, guides, and structured data.
export const canonicalOrigin='https://remonook.com';
export const productDescription='RemoNook is an independent, outline-first note-taking and flashcard application with nested notes, knowledge organization, and spaced repetition learning.';
export const brandClarification='RemoNook is a separate product and is not affiliated with RemNote.';
export const officialProfiles=[
 {name:'X',handle:'@RemoNookhq',url:'https://x.com/RemoNookhq'},
 {name:'YouTube',handle:'@RemoNook',url:'https://www.youtube.com/@RemoNook'},
 {name:'Instagram',handle:'@RemoNook.hq',url:'https://www.instagram.com/remonook.hq/'},
];
export const homeFaq=[
 {question:'What is RemoNook?',answer:productDescription+' It helps you capture ideas, organize information, and remember more.'},
 {question:'Is RemoNook affiliated with RemNote?',answer:brandClarification+' Use remonook.com and the official profiles linked here to find RemoNook.'},
 {question:'Can I try RemoNook without an account?',answer:'Yes. Choose Try as a guest. Guest notes stay in this browser; sign in for automatic account sync across devices. Export a full backup to keep your own copy.'},
 {question:'Where can I learn to make flashcards and MCQs?',answer:'The RemoNook guides walk through creating question-and-answer flashcards, four-option MCQs, bulk conversion, and everyday note editing.'},
];
export function brandGraph(){return [
 {'@type':'Organization','@id':canonicalOrigin+'/#organization',name:'RemoNook',url:canonicalOrigin+'/',description:productDescription,logo:canonicalOrigin+'/brand/icon-512.png',sameAs:officialProfiles.map(p=>p.url)},
 {'@type':'WebSite','@id':canonicalOrigin+'/#website',name:'RemoNook',url:canonicalOrigin+'/',description:productDescription,inLanguage:'en',publisher:{'@id':canonicalOrigin+'/#organization'}},
 {'@type':'SoftwareApplication','@id':canonicalOrigin+'/#app',name:'RemoNook',url:canonicalOrigin+'/',applicationCategory:'EducationalApplication',operatingSystem:'Web',description:productDescription,image:canonicalOrigin+'/brand/icon-512.png',publisher:{'@id':canonicalOrigin+'/#organization'}},
];}
