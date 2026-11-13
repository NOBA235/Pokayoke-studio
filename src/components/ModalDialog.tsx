import { ReactNode, useEffect, useRef } from 'react';

export interface ModalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  labelledById: string;
  className?: string;
  children: ReactNode;
}

export function ModalDialog({
  isOpen,
  onClose,
  labelledById,
  className = '',
  children
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Progressive fallback for browsers without native <dialog closedby="any">
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) {
      return;
    }

    const isOutside = (event: PointerEvent): boolean => {
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };

    let pressedOutside = false;
    const handlePointerDown = (event: PointerEvent) => {
      pressedOutside = isOutside(event);
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (pressedOutside && isOutside(event) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', handlePointerDown);
    dialog.addEventListener('pointerup', handlePointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', handlePointerDown);
      dialog.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const closedByProps = { closedby: 'any' } as Record<string, string>;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledById}
      onClose={() => {
        if (dialogRef.current) {
          dialogRef.current.returnValue = '';
        }
        onClose();
      }}
      {...closedByProps}
      className={className}
    >
      {children}
    </dialog>
  );
}
