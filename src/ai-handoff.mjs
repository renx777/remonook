// Hand an AI assist request to the person's own AI app (Claude, ChatGPT or any MCP client
// connected in Settings → AI apps). The app does the thinking on the person's own plan and writes
// the result back through the RemoNook connector, so it uses none of the built-in daily allowance.
// The prompt names the bullet by id and lets the app read it itself: no note text is put in a URL.

const TASK={
 answer:'Answer the question below. Add the answer as one child bullet with write_notes (a short paragraph or a few nested bullets).',
 explain:'Explain the topic below clearly and simply. Add the explanation as child bullets with write_notes.',
 summarize:'Summarize the bullet and its children. Add the summary as one child bullet with write_notes.',
 list:'Make a flat list. Add each item as its own child bullet with write_notes (one level, no explanations unless asked).',
 outline:'Make an outline. Add it as nested child bullets with write_notes (indent to nest).',
 mindmap:'Make a mindmap. Call write_mindmap with root_id set to this bullet and the branches as a nested Markdown list; the bullet then shows as a mindmap.',
 diagram:'Make a diagram. Add one child bullet with write_notes containing a single ```mermaid code block (valid Mermaid, e.g. flowchart TD).',
 flashcards:'Make study flashcards. Add them with create_flashcards under this bullet.',
 mcqs:'Make multiple-choice questions (four options, one correct). Add them with create_mcqs under this bullet.',
};
export const HANDOFF_OPERATIONS=Object.keys(TASK);
const clean=s=>String(s||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();

/** Prompt for an MCP-connected AI app. `title` is only a label for the person reading the prompt. */
export function handoffPrompt({operation,mode='general',question='',bulletId,title=''}){
 if(!TASK[operation])throw Error('This action cannot be handed to an AI app.');
 if(typeof bulletId!=='string'||!bulletId)throw Error('Choose a bullet first.');
 const q=clean(question).slice(0,1000),t=clean(title).slice(0,80);
 return [
  'Use the RemoNook connector.',
  `First call read_page with id ${bulletId}${t?` (the bullet "${t}")`:''} to read it and its children for context.`,
  TASK[operation],
  `Add everything under bullet ${bulletId}. Do not change or delete existing bullets.`,
  ...(mode==='web'?['Use web search if you have it, and include source links.']:[]),
  '',q&&q!==t?`Request: ${q}`:`Request: use the bullet${t?` "${t}"`:''} itself as the topic.`,
 ].join('\n');
}

/** Links that open each app in a new chat with the prompt filled in. */
export function handoffLinks(prompt){
 const q=encodeURIComponent(prompt);
 return [{app:'Claude',href:'https://claude.ai/new?q='+q},{app:'ChatGPT',href:'https://chatgpt.com/?q='+q}];
}
