'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children, className = '', sheet = false }: { title: string; onClose: () => void; children: ReactNode; className?: string; sheet?: boolean }) {
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; }, []);
  return <div className={`ui-modal-overlay ${sheet ? 'ui-modal-overlay--sheet' : ''}`} onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}><section className={`ui-modal ${sheet ? 'ui-modal--sheet' : ''} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby="ui-modal-title"><header className="ui-modal-head">{sheet && <i className="ui-modal-handle" />}<h2 id="ui-modal-title">{title}</h2><button type="button" className="ui-modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button></header><div className="ui-modal-body">{children}</div></section></div>;
}
