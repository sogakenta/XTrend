'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { Place } from '@/lib/types';

interface SidebarProps {
  places: Place[];
}

export function Sidebar({ places }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Group places: first item is "Japan", rest are cities
  const japanPlace = places.find(p => p.slug === 'jp');
  const cityPlaces = places.filter(p => p.slug !== 'jp').sort((a, b) => a.sort_order - b.sort_order);

  const NavContent = () => (
    <nav className="p-4">
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
          国内
        </h2>
        <ul className="space-y-1">
          {japanPlace && (
            <li>
              <Link
                href={`/place/${japanPlace.slug}`}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname === `/place/${japanPlace.slug}`
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
                onClick={() => setIsOpen(false)}
              >
                {japanPlace.name_ja}
              </Link>
            </li>
          )}
          {cityPlaces.map((place) => (
            <li key={place.woeid}>
              <Link
                href={`/place/${place.slug}`}
                className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                  pathname === `/place/${place.slug}`
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
                onClick={() => setIsOpen(false)}
              >
                {place.name_ja}
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

      {/* Desktop: Fixed sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 h-screen sticky top-0 overflow-y-auto">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <Link href="/" className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            XTrend
          </Link>
        </div>
        <NavContent />
      </aside>
    </>
  );
}
