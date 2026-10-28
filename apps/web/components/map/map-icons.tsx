import type { SVGProps } from 'react';

/**
 * The map's own line icons: one 24 x 24 grid, a 1.8 stroke with round ends, drawn in the text colour, so every control
 * on the map reads as one family with the rest of the panel (flat, thin, no fills except where a shape is meant to be solid).
 */
function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ZoomInIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ZoomOutIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M5 12h14" />
  </Icon>
);

/** Buildings seen from the side: a block standing on the ground, with a lower one beside it. */
export const BuildingsIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M4 20V9.5l6-3v13.5M10 20h10v-8l-6-2.5M3 20h18" />
    <path d="M6.8 11.5h.4M6.8 14.5h.4M13.8 14h.4M13.8 17h.4" strokeWidth="2.2" />
  </Icon>
);

/** Four corners pointing out. */
export const ExpandIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M4 9.5V4h5.5M14.5 4H20v5.5M20 14.5V20h-5.5M9.5 20H4v-5.5" />
  </Icon>
);

/** The same four corners pointing in. */
export const CollapseIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <path d="M9.5 4v5.5H4M14.5 4v5.5H20M14.5 20v-5.5H20M9.5 20v-5.5H4" />
  </Icon>
);

/** "My location": a ring, a dot in the middle and four ticks, the sign GPS buttons wear everywhere. */
export const GpsIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="6.2" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </Icon>
);

/** Share: three joined dots. */
export const ShareIcon = (props: SVGProps<SVGSVGElement>) => (
  <Icon {...props}>
    <circle cx="6.5" cy="12" r="2.4" />
    <circle cx="17.5" cy="6" r="2.4" />
    <circle cx="17.5" cy="18" r="2.4" />
    <path d="M8.6 10.8l6.8-3.6M8.6 13.2l6.8 3.6" />
  </Icon>
);
