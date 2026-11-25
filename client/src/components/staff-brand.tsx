/**
 * Official dingzi Master Logo System — "The Volt Ringer" (v1.0)
 *
 * Brand Guardrails:
 * - Always set `dingzi` in all-lowercase (never `Dingzi` or `DINGZI`).
 * - Keep the 25-degree tilted pure white service bell inside its `#6236FF` continuous-curve squircle
 *   with exact Volt Lime (`#C8FF42`) clapper, concentric pill sound arcs, and dual `i` dots.
 * - Use `variant="thermal"` for 1-color `58mm`/`80mm` POS receipts and monochrome footer stamps.
 */
export function DingziMark({
  size = 36,
  variant = 'color',
  className = '',
}: {
  size?: number;
  variant?: 'color' | 'thermal';
  className?: string;
}) {
  if (variant === 'thermal') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 256 256"
        width={size}
        height={size}
        aria-hidden="true"
        className={`shrink-0 ${className}`.trim()}
      >
        <rect x="8" y="8" width="240" height="240" rx="58" fill="#17132E" />
        <path
          d="M 152 68 A 56 56 0 0 1 189 126"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="13"
          strokeLinecap="round"
        />
        <path
          d="M 156 44 A 80 80 0 0 1 212 130"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="13"
          strokeLinecap="round"
        />
        <g transform="translate(114, 138) rotate(-25)">
          <path d="M -22 44 A 22 22 0 0 0 22 44 Z" fill="#FFFFFF" />
          <rect x="-18" y="-76" width="36" height="11" rx="5.5" fill="#FFFFFF" />
          <rect x="-6" y="-67" width="12" height="14" fill="#FFFFFF" />
          <path d="M -52 16 L -50 -10 A 50 50 0 0 1 50 -10 L 52 16 Z" fill="#FFFFFF" />
          <path d="M -56 23 L 56 23 L 68 38 Q 70 42 65 42 L -65 42 Q -70 42 -68 38 Z" fill="#FFFFFF" />
        </g>
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 ${className}`.trim()}
    >
      <rect x="8" y="8" width="240" height="240" rx="58" fill="#6236FF" />
      <rect
        x="11"
        y="11"
        width="234"
        height="234"
        rx="55"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.22"
        strokeWidth="3"
      />
      <path
        d="M 152 68 A 56 56 0 0 1 189 126"
        fill="none"
        stroke="#C8FF42"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M 156 44 A 80 80 0 0 1 212 130"
        fill="none"
        stroke="#C8FF42"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <g transform="translate(114, 138) rotate(-25)">
        <path d="M -22 44 A 22 22 0 0 0 22 44 Z" fill="#C8FF42" />
        <rect x="-18" y="-76" width="36" height="11" rx="5.5" fill="#FFFFFF" />
        <rect x="-6" y="-67" width="12" height="14" fill="#FFFFFF" />
        <path d="M -52 16 L -50 -10 A 50 50 0 0 1 50 -10 L 52 16 Z" fill="#FFFFFF" />
        <path d="M -56 23 L 56 23 L 68 38 Q 70 42 65 42 L -65 42 Q -70 42 -68 38 Z" fill="#FFFFFF" />
      </g>
    </svg>
  );
}

export function DingziWordmark({
  className = '',
  tone = 'auto',
  size = 36,
  iconOnly = false,
}: {
  className?: string;
  tone?: 'light' | 'dark' | 'auto';
  size?: number;
  iconOnly?: boolean;
}) {
  const textClass =
    tone === 'dark'
      ? 'text-white'
      : tone === 'light'
        ? 'text-[#17132E]'
        : 'text-foreground';

  if (iconOnly) {
    return <DingziMark size={Math.max(16, size)} className={className} />;
  }

  return (
    <span
      dir="ltr"
      lang="en"
      className={`inline-flex items-center gap-2.5 select-none p-1 ${className}`.trim()}
    >
      <DingziMark size={size} />
      <span
        style={{ letterSpacing: '-0.03em' }}
        className={`font-display font-extrabold text-2xl leading-none lowercase inline-flex items-baseline ${textClass}`}
      >
        <span>d</span>
        <span className="relative inline-block">
          <span>&#305;</span>
          <span
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 -top-[2px] w-[6px] h-[6px] rounded-full bg-[#C8FF42] ring-1 ring-[#17132E]/15"
          />
        </span>
        <span>ngz</span>
        <span className="relative inline-block">
          <span>&#305;</span>
          <span
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 -top-[2px] w-[6px] h-[6px] rounded-full bg-[#C8FF42] ring-1 ring-[#17132E]/15"
          />
        </span>
      </span>
    </span>
  );
}

export function StaffBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={'staff-brand' + (compact ? ' is-compact' : '')}>
      {compact ? (
        <>
          <DingziMark size={36} />
          <span dir="ltr" lang="en">
            <strong className="!lowercase !tracking-[-0.03em] !text-sm font-display">dingzi</strong>
            <small>Menus · Tables · Pickup</small>
          </span>
        </>
      ) : (
        <>
          <DingziWordmark size={40} />
          <span className="staff-brand-caption">Menus, tables, and pickup — made dingzi.</span>
        </>
      )}
    </div>
  );
}
