import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const IconList = () => (
  <svg {...base}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>
);
export const IconBookmark = () => (
  <svg {...base}><path d="M6 3h12v18l-6-4.5L6 21z" /></svg>
);
export const IconSend = () => (
  <svg {...base}><path d="M4 6h16v12H4z" /><path d="m4 7 8 6 8-6" /></svg>
);
export const IconUser = () => (
  <svg {...base}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.500 2 8 6" /></svg>
);
export const IconClose = () => (
  <svg {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconPrev = () => (
  <svg {...base}><path d="m15 5-7 7 7 7" /></svg>
);
export const IconNext = () => (
  <svg {...base}><path d="m9 5 7 7-7 7" /></svg>
);
export const IconCalendarPlus = () => (
  <svg {...base}><path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M12 13v4M10 15h4" /></svg>
);
export const IconBell = () => (
  <svg {...base}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" /></svg>
);
