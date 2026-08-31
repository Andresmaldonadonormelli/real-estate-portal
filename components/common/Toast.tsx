'use client';
import { useEffect } from 'react';
import { Check, X } from 'lucide-react';

export default function Toast({message,onClose,duration=4500}:{message:string;onClose:()=>void;duration?:number}){
  useEffect(()=>{const id=window.setTimeout(onClose,duration);return()=>window.clearTimeout(id);},[duration,onClose]);
  return <div className="app-toast" role="status" aria-live="polite"><span className="app-toast-icon"><Check size={16}/></span><span>{message}</span><button type="button" onClick={onClose} aria-label="Dismiss"><X size={15}/></button></div>;
}
