'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const OFFSETS = [
  { value: '0', label: '現在' },
  { value: '1', label: '1時間前' },
  { value: '3', label: '3時間前' },
  { value: '6', label: '6時間前' },
  { value: '12', label: '12時間前' },
  { value: '24', label: '24時間前' },
];

interface TimeOffsetTabsProps {
  currentOffset: number;
  basePath: string;
}

export function TimeOffsetTabs({ currentOffset, basePath }: TimeOffsetTabsProps) {
  const router = useRouter();

  const handleChange = (offset: string) => {
    if (offset === '0') {
      router.push(basePath);
    } else {
      router.push(`${basePath}?offset=${offset}`);
    }
  };

  return (
    <div className="flex gap-2 flex-wrap">
      {OFFSETS.map((offset) => (
        <button
          key={offset.value}
          onClick={() => handleChange(offset.value)}
          className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
            currentOffset === parseInt(offset.value)
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
          }`}
        >
          {offset.label}
        </button>
      ))}
    </div>
  );
}
