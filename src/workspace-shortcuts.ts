import {tinykeys} from 'tinykeys';

/** App shortcuts yield to editors, modal tools, study sessions and walkthroughs. */
export function shortcutAllowed(event: KeyboardEvent, command = false, saving = false) {
  if (event.defaultPrevented || event.isComposing || event.repeat || document.body.classList.contains('driver-active')) return false;
  const target = event.target instanceof HTMLElement ? event.target : document.activeElement;
  if(document.querySelector('.book-reader[open]'))return false;
  if (target?.closest('dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"]')) {
    return !!(command && target?.closest('[data-command-palette]'));
  }
  if(!saving&&target?.closest('.study-session.is-immersive'))return false;
  return true;
}
export function bindWorkspaceShortcuts(target: Window, actions: {command:()=>void;save:()=>void;sidebar:()=>void;pane:()=>void}) {
  const run=(action:()=>void,command=false,saving=false)=>(event:KeyboardEvent)=>{if(!shortcutAllowed(event,command,saving))return;event.preventDefault();action();};
  return tinykeys(target, {
    '$mod+k': run(actions.command,true),
    '$mod+s': run(actions.save,false,true),
    '$mod+Backslash': run(actions.sidebar),
    'Alt+r': run(actions.pane),
    ...(/Mac|iPhone|iPad/.test(navigator.platform)?{'Control+r':run(actions.pane)}:{}),
  }, {ignore:event=>event.isComposing||event.repeat});
}
export const modLabel=()=>/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl';
