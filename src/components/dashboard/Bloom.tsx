import { cx } from "@/components/ui/cx";

/**
 * Rebloom's mark of renewal: five petals around a small centre, drawn in one thin line (DECISIONS D-058).
 * With `unfurl`, the petals draw themselves in once, the way a flower opens. Decorative: the words beside
 * it always say what happened.
 */
export function Bloom({ size = 16, unfurl = false, className }: { size?: number; unfurl?: boolean; className?: string }) {
  const petals = [0, 72, 144, 216, 288];
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      className={cx("shrink-0 overflow-visible", unfurl && "bloom-unfurl", className)}
    >
      {petals.map((deg, i) => (
        <path
          key={deg}
          d="M12 11.2c-2.1-1.6-2.6-5.2 0-7.7 2.6 2.5 2.1 6.1 0 7.7z"
          transform={`rotate(${deg} 12 12)`}
          pathLength={1}
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}
