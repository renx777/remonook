// Counts the sidebar shows only when they ask for action: reminders due (today or overdue) and
// study cards due now (Study Desk's own rule).
import {calendarEvents,upcomingEvents} from './calendar-events.mjs';
import {dueCards} from './study.mjs';

export function sidebarActionCounts(doc,now=Date.now()){
 let reminders=0,cards=0;
 try{reminders=upcomingEvents(calendarEvents(doc)).filter(e=>e.days<=0).length;}catch{/* no reminders */}
 try{cards=dueCards(doc,null,now).length;}catch{/* no study data */}
 return {reminders,cards};
}
