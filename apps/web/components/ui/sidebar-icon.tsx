import type { SVGProps } from 'react';

/**
 * The sidebar control: a rounded square with a vertical line a third of the way in (the panel). Drawn from the icon the
 * product owner supplied (an 18 px square, 2 px line, one third from the left edge), on the same 24-unit grid and
 * round-joined stroke as the other icons. It takes the text colour (`currentColor`).
 */
export function SidebarIcon({ className, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M9 3v18" />
    </svg>
  );
}
