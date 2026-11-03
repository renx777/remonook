import {useRef, type ButtonHTMLAttributes, type ReactElement} from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';

/** A command-only menu: Radix owns roving focus, typeahead and dismissal. */
export function ActionMenu({open,onOpenChange,trigger,children}:{open:boolean;onOpenChange:(open:boolean)=>void;trigger:ReactElement;children:ReactElement}) {
  const anchor=useRef<HTMLButtonElement>(null);
  return <Menu.Root open={open} onOpenChange={onOpenChange} modal={false}>
    <Menu.Trigger asChild ref={anchor}>{trigger}</Menu.Trigger>
    <Menu.Portal container={anchor.current?.closest('dialog[open], [role="dialog"], .study-session') || anchor.current?.closest('.app') || document.body}>
      <Menu.Content asChild sideOffset={6} align="end" collisionPadding={8} loop onEscapeKeyDown={event=>event.stopPropagation()}>{children}</Menu.Content>
    </Menu.Portal>
  </Menu.Root>;
}
export function ActionMenuItem({disabled,...props}:ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Menu.Item asChild disabled={disabled}><button type="button" disabled={disabled} {...props}/></Menu.Item>;
}
