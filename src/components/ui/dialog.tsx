import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Responsive dialog: a bottom sheet on phones, a centred modal on larger screens.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', hideClose }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode;
  footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; hideClose?: boolean;
}) {
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[fadeIn_150ms_ease-out]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex max-h-[92dvh] w-full flex-col border border-border bg-surface shadow-lift focus:outline-none',
            'inset-x-0 bottom-0 rounded-t-3xl data-[state=open]:animate-[sheetUp_220ms_cubic-bezier(0.2,0.9,0.3,1)]',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:data-[state=open]:animate-[popIn_180ms_ease-out]',
            width,
          )}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : 'Dialog'}</DialogPrimitive.Description>
              )}
            </div>
            {!hideClose && (
              <DialogPrimitive.Close className="-mr-2 rounded-lg p-2 text-muted hover:bg-subtle hover:text-fg" aria-label="Close">
                <X className="h-5 w-5" />
              </DialogPrimitive.Close>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4 safe-bottom sm:px-6">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
