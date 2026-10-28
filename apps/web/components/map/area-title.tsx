import { MapPin } from 'lucide-react';

/**
 * The small bar at the top of the map: the neighbourhood or region the map is centred on. Decoration, not a control, so it
 * lets every tap through to the map and says nothing to a screen reader until it changes (a polite live region).
 */
export function AreaTitle({ name, label }: { name: string | null; label: string }) {
  if (!name) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-[5] flex justify-center px-4 sm:start-[22rem] sm:top-3 sm:px-28">
      <div
        data-testid="area-title"
        aria-label={label}
        aria-live="polite"
        className="flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3.5 py-1.5 text-[13px] font-semibold text-ink shadow-sm backdrop-blur"
      >
        <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="truncate">{name}</span>
      </div>
    </div>
  );
}
