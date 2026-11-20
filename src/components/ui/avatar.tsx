import { cn, initials } from "@/lib/utils";

const PALETTE = [
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
];

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function Avatar({
  name,
  image,
  className,
  square = false,
}: {
  name: string;
  image?: string | null;
  className?: string;
  square?: boolean;
}) {
  const shape = square ? "rounded-md" : "rounded-full";
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- external avatar URLs of arbitrary hosts
    return <img src={image} alt="" className={cn("size-8 object-cover", shape, className)} referrerPolicy="no-referrer" />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-8 shrink-0 select-none items-center justify-center text-xs font-semibold",
        shape,
        PALETTE[hash(name) % PALETTE.length],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
