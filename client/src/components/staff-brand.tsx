export function DingziMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="64" height="64" rx="16" fill="#17132E" />
      <rect x="5" y="5" width="54" height="54" rx="13" fill="#6236FF" />
      <path
        d="M22 18h10c8.3 0 14.5 5.8 14.5 14S40.3 46 32 46H22V18zm7.5 6.5v15H32c4.6 0 7.5-2.9 7.5-7.5s-2.9-7.5-7.5-7.5h-2.5z"
        fill="#FFFFFF"
      />
      <circle cx="47" cy="17" r="5" fill="#C8FF42" stroke="#17132E" strokeWidth="1.5" />
      <path
        d="M48.5 9.2a11.5 11.5 0 0 1 6.8 6.8"
        fill="none"
        stroke="#C8FF42"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DingziWordmark({
  className = '',
  tone = 'auto',
}: {
  className?: string;
  tone?: 'light' | 'dark' | 'auto';
}) {
  const textClass =
    tone === 'dark'
      ? 'text-white'
      : tone === 'light'
        ? 'text-[#17132E]'
        : 'text-foreground';

  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <DingziMark size={36} />
      <span className={`font-display font-extrabold text-2xl tracking-tight leading-none inline-flex items-baseline ${textClass}`}>
        <span>D</span>
        <span className="relative inline-block">
          <span>ı</span>
          <span
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 -top-[1px] w-[6px] h-[6px] rounded-full bg-[#C8FF42] ring-1 ring-[#17132E]/20"
          />
        </span>
        <span>ngz</span>
        <span className="relative inline-block">
          <span>ı</span>
          <span
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 -top-[1px] w-[6px] h-[6px] rounded-full bg-[#C8FF42] ring-1 ring-[#17132E]/20"
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
          <span>
            <strong>DINGZI</strong>
            <small>Menus · Pager · KDS</small>
          </span>
        </>
      ) : (
        <>
          <DingziWordmark />
          <span className="staff-brand-caption">Hospitality Operating Platform</span>
        </>
      )}
    </div>
  );
}
