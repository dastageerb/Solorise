import type { JSX } from 'react';

/**
 * The icon set. Stroke-based, 1.5px, currentColor.
 *
 * Keep this list tight: every added glyph is another thing on screen that is not
 * information. See DESIGN.md §Icons — adding a name here is a design decision.
 */

export type IconName =
  | 'plus'
  | 'chevron'
  | 'filter'
  | 'users'
  | 'search'
  | 'activity'
  | 'layers'
  | 'grid'
  | 'command'
  | 'calendar'
  | 'check'
  | 'checklist'
  | 'trash'
  | 'settings'
  | 'comment';

const PATHS: Record<IconName, JSX.Element> = {
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  chevron: <path d="M6 8l4 4 4-4" />,
  filter: <path d="M3.5 5.5h13M6 10h8M8.5 14.5h3" />,
  users: (
    <>
      <circle cx="8" cy="7.5" r="2.6" />
      <path d="M3.5 16c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
      <path d="M13.5 6.2a2.4 2.4 0 0 1 0 4.6M14.5 16c0-1.6-.5-2.7-1.3-3.4" />
    </>
  ),
  search: (
    <>
      <circle cx="9" cy="9" r="5" />
      <path d="M12.8 12.8 16.5 16.5" />
    </>
  ),
  activity: <path d="M2.5 10.5h3.2l2-5.5 3.1 9 1.9-3.5h4.8" />,
  layers: (
    <>
      <path d="M10 2.8 17.2 6.6 10 10.4 2.8 6.6z" />
      <path d="M4.6 9.4 2.8 10.4 10 14.2l7.2-3.8-1.8-1" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="5.6" height="5.6" rx="1.4" />
      <rect x="11.4" y="3" width="5.6" height="5.6" rx="1.4" />
      <rect x="3" y="11.4" width="5.6" height="5.6" rx="1.4" />
      <rect x="11.4" y="11.4" width="5.6" height="5.6" rx="1.4" />
    </>
  ),
  command: (
    <>
      <rect x="2.6" y="2.6" width="6" height="6" rx="1.6" />
      <rect x="11.4" y="2.6" width="6" height="6" rx="1.6" />
      <rect x="2.6" y="11.4" width="6" height="6" rx="1.6" />
      <circle cx="14.4" cy="14.4" r="3" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.4h14M7 2.8v3.2M13 2.8v3.2" />
    </>
  ),
  check: <path d="M4.5 10.5 8 14l7.5-8" />,
  checklist: (
    <>
      <path d="M3.5 5.5 5 7l2.5-3" />
      <path d="M3.5 14.5 5 16l2.5-3" />
      <path d="M10 6h6.5M10 15h6.5" />
    </>
  ),
  trash: <path d="M4 6h12M8 6V4.5h4V6M6.5 6l.7 10h5.6l.7-10" />,
  settings: (
    <>
      <circle cx="10" cy="10" r="2.7" />
      <path d="M8.3 3.2h3.4l.5 2a6 6 0 0 1 1.2.7l2-.6 1.7 2.9-1.5 1.4v.8l1.5 1.4-1.7 2.9-2-.6a6 6 0 0 1-1.2.7l-.5 2H8.3l-.5-2a6 6 0 0 1-1.2-.7l-2 .6-1.7-2.9 1.5-1.4v-.8L2.9 8.2l1.7-2.9 2 .6a6 6 0 0 1 1.2-.7z" />
    </>
  ),
  comment: <path d="M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5H7.5L4 17v-11a1.5 1.5 0 0 1 1.5-1.5z" />,
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

