// Restore outline content without rolling back later study reviews. Cards born
// from a source that this undo removes must not become orphan flashcards.
export function outlineUndoState(current,target){
 const currentSources=new Set(current.tables.bullets.map(n=>n.id)),restoredSources=new Set(target.tables.bullets.map(n=>n.id)),cards=new Map(target.tables.cards.map(c=>[c.id,c]));
 for(const card of current.tables.cards)if(restoredSources.has(card.id)||!currentSources.has(card.id)||cards.has(card.id))cards.set(card.id,card);
 return {...target,tables:{...target.tables,cards:[...cards.values()],review_logs:current.tables.review_logs,study_sessions:current.tables.study_sessions,study_limits:current.tables.study_limits}};
}
