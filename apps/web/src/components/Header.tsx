import Link from 'next/link';

export function Header() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
          TrendaX
        </Link>
        <nav className="flex gap-4 text-sm text-zinc-600 dark:text-zinc-400">
          <Link href="/place/jp" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            日本
          </Link>
          <Link href="/place/tokyo" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            東京
          </Link>
          <Link href="/place/osaka" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            大阪
          </Link>
        </nav>
      </div>
    </header>
  );
}
