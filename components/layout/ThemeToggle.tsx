'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

type ThemeChoice = 'light' | 'dark' | 'system';

export default function ThemeToggle({variant='button'}:{variant?:'button'|'menu'}) {
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('theme');
    const initial:ThemeChoice = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    setTheme(initial);
    applyTheme(initial);
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const sync=()=>{if((localStorage.getItem('theme')||'system')==='system')applyTheme('system')};
    media.addEventListener('change',sync);
    return()=>media.removeEventListener('change',sync);
  }, []);

  const selectTheme = (next:ThemeChoice) => {
    setTheme(next);
    localStorage.setItem('theme', next);
    applyTheme(next);
  };

  if (!mounted) return null;

  if(variant==='menu')return <div className="appearance-menu" aria-label="Appearance"><div className="appearance-menu-label"><Monitor size={19} strokeWidth={1.8}/><span>Appearance</span></div><div className="appearance-options">{(['light','dark','system'] as ThemeChoice[]).map(choice=><button type="button" key={choice} className={theme===choice?'active':''} aria-pressed={theme===choice} onClick={()=>selectTheme(choice)}>{choice[0].toUpperCase()+choice.slice(1)}</button>)}</div></div>;

  const resolvedDark=document.documentElement.getAttribute('data-theme')==='dark';
  const Icon = resolvedDark ? Moon : Sun;
  const next:ThemeChoice = resolvedDark ? 'light' : 'dark';

  return (
    <button onClick={()=>selectTheme(next)} className="theme-toggle" type="button" aria-label={`Appearance: ${resolvedDark?'Dark':'Light'}`}>
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
      <span>Appearance</span>
    </button>
  );
}

function applyTheme(choice:ThemeChoice){const resolved=choice==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):choice;document.documentElement.setAttribute('data-theme',resolved)}
