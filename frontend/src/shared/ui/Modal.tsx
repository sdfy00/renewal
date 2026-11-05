import { type ReactNode, useEffect, useRef } from 'react';
import Button from './Button';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const el = ref.current;
      if (!el) return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const focusable = ref.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
    return () => { trigger?.focus(); };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-card rounded-[20px] shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-secondary/15">
          <h2 className="text-base font-semibold text-text">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
        <div className="overflow-auto p-6">{children}</div>
      </div>
    </div>
  );
}
