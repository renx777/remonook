import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Icon } from "./icons";
export function WorkdayDialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal
        container={document.querySelector(".app") || document.body}
      >
        <Dialog.Overlay className="wd2-overlay" />
        <Dialog.Content
          className={"wd2-dialog" + (wide ? " wide" : "")}
          aria-describedby={undefined}
        >
          <header>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label={"Close " + title}>
              <Icon name="close" size={20} />
            </Dialog.Close>
          </header>
          <div className="wd2-dialog-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
