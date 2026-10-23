import { cn } from '@/lib/cn';

/**
 * The Bongah mark: the roof and chimney with a map pin under it, standing on a ring. The shapes are the same ones the
 * phone app draws (apps/mobile LOGO_GEOMETRY), so the brand matches; the left halves are the darker emerald.
 */
export function LogoMark({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label="بنگاه"
      className={cn('shrink-0', className)}
    >
      <ellipse cx="50" cy="87" rx="26" ry="8" fill="none" stroke="#E5E7EB" strokeWidth="2.6" />
      <path d="M50 4.6L90.5 36.6L79.8 36.6L50 13L20.2 36.6L9.5 36.6Z" fill="#047857" />
      <path d="M50 4.6L9.5 36.6L20.2 36.6L50 13Z" fill="#065F46" />
      <rect x="67" y="9.6" width="8.4" height="16.4" fill="#047857" />
      <path
        fillRule="evenodd"
        fill="#047857"
        d="M50 16.8L76.6 37.3C76.6 52 64 72 50 86.7C36 72 23.4 52 23.4 37.3ZM50 27.2A12.3 12.3 0 1 0 50 51.8A12.3 12.3 0 1 0 50 27.2Z"
      />
      <path fill="#065F46" d="M50 16.8L23.4 37.3C23.4 52 36 72 50 86.7L50 51.8A12.3 12.3 0 0 1 50 27.2Z" />
    </svg>
  );
}

export function LogoLockup({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark size={36} />
      {collapsed ? null : (
        <div className="leading-tight">
          <div className="text-[17px] font-extrabold text-primary-dark">بنگاه</div>
          <div className="text-[11px] text-muted">پنل مدیریت دفتر</div>
        </div>
      )}
    </div>
  );
}
