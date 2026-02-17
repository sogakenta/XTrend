import { Spinner } from '@/components';

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-zinc-500 dark:text-zinc-400">読み込み中...</p>
      </div>
    </div>
  );
}
