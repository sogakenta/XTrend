interface UpdatedAtProps {
  capturedAt: string;
}

export function UpdatedAt({ capturedAt }: UpdatedAtProps) {
  const date = new Date(capturedAt);
  const formatted = date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <p className="text-sm text-zinc-500">
      更新: {formatted} JST
    </p>
  );
}
