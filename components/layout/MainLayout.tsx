'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserRound, X } from 'lucide-react';
import BottomNav from './BottomNav';
import SideNav from './SideNav';
import ThemeToggle from './ThemeToggle';

interface MainLayoutProps { children: React.ReactNode; }

export default function MainLayout({ children }: MainLayoutProps) {
  const [showNav, setShowNav] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => { setShowNav(false); }, [pathname]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {!isMobile && <SideNav />}
      <main className="main-content" style={{ background: 'var(--bg-primary)' }}>{children}</main>
      {isMobile && <BottomNav onMenuClick={() => setShowNav(true)} />}
      {isMobile && showNav && (
        <div className="mobile-menu-backdrop" onClick={() => setShowNav(false)}>
          <div className="mobile-menu-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Menu">
            <div className="mobile-menu-header"><strong>Menu</strong><button type="button" className="icon-button" onClick={() => setShowNav(false)} aria-label="Close menu"><X size={20} /></button></div>
            <Link href="/account" className="mobile-menu-item"><UserRound size={19} strokeWidth={1.8}/><span>Account</span></Link>
            <ThemeToggle />
          </div>
        </div>
      )}
    </div>
  );
}
