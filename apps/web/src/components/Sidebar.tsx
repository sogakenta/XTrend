'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import type { Place } from '@/lib/types';

interface SidebarProps {
  places: Place[];
}

const COLLAPSED_KEY = 'sidebar-collapsed';

export function Sidebar({ places }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Load collapsed state from localStorage after mount
  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (saved === 'true') {
      setIsCollapsed(true);
    }
  }, []);

  const toggleCollapsed = () => {
    const newValue = !isCollapsed;
    setIsCollapsed(newValue);
    localStorage.setItem(COLLAPSED_KEY, String(newValue));
  };

  // Show expanded when: not collapsed OR (collapsed but hovered)
  const showExpanded = !isCollapsed || isHovered;

  // Group places: first item is "Japan", rest are cities
  const japanPlace = places.find(p => p.slug === 'jp');
  const cityPlaces = places.filter(p => p.slug !== 'jp').sort((a, b) => a.sort_order - b.sort_order);

  const NavContent = ({ compact = false }: { compact?: boolean }) => (
    <nav className={compact ? 'p-2' : 'p-4'}>
      <div className="mb-4">
        {!compact && (
          <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 px-2">
            地域
          </h2>
        )}
        <ul className="space-y-1">
          {japanPlace && (
            <li>
              <Link
                href={`/place/${japanPlace.slug}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname === `/place/${japanPlace.slug}`
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
                onClick={() => setIsOpen(false)}
                title={japanPlace.name_ja}
              >
                <span className="text-base">🇯🇵</span>
                {!compact && <span>{japanPlace.name_ja}</span>}
              </Link>
            </li>
          )}
          {cityPlaces.map((place) => (
            <li key={place.woeid}>
              <Link
                href={`/place/${place.slug}`}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname === `/place/${place.slug}`
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
                onClick={() => setIsOpen(false)}
                title={place.name_ja}
              >
                <span className="text-base">📍</span>
                {!compact && <span>{place.name_ja}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile: Menu button in header area */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 right-4 z-50 p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg"
        aria-label="地域メニュー"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Mobile: Drawer overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Mobile: Drawer */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-full w-64 bg-white dark:bg-zinc-900 z-40 transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <Link href="/" className="text-xl font-bold text-zinc-900 dark:text-zinc-100" onClick={() => setIsOpen(false)}>
            XTrend
          </Link>
        </div>
        <NavContent />
      </aside>

      {/* Desktop: Fixed sidebar with hover expand */}
      <aside
        className={`hidden lg:flex flex-col fixed top-0 left-0 h-screen bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 z-30 transition-all duration-200 ${
          showExpanded ? 'w-56' : 'w-16'
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Header */}
        <div className={`flex items-center border-b border-zinc-200 dark:border-zinc-800 ${showExpanded ? 'p-4 justify-between' : 'p-3 justify-center'}`}>
          {showExpanded ? (
            <>
              <Link href="/" className="font-bold text-xl text-zinc-900 dark:text-zinc-100">
                XTrend
              </Link>
              <button
                onClick={toggleCollapsed}
                className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500"
                title={isCollapsed ? "サイドバーを固定展開" : "サイドバーを縮小"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isCollapsed ? (
                    // Pin icon - click to keep expanded
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  ) : (
                    // Collapse icon
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  )}
                </svg>
              </button>
            </>
          ) : (
            <span className="font-bold text-lg text-zinc-900 dark:text-zinc-100">X</span>
          )}
        </div>

        {/* Nav content */}
        <div className="flex-1 overflow-y-auto">
          <NavContent compact={!showExpanded} />
        </div>
      </aside>

      {/* Spacer for fixed sidebar on desktop - always use collapsed width */}
      <div className="hidden lg:block shrink-0 w-16" />
    </>
  );
}
