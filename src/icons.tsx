import {memo} from 'react';
import {Bold,Italic,Underline,Strikethrough,CodeXml,EyeOff,PencilLine,RemoveFormatting,Type,ImagePlus,Waypoints,ListTree,GraduationCap,Link,CornerDownLeft,PanelsLeftRight,IndentIncrease,IndentDecrease,ListOrdered,TextQuote,Sigma,Workflow,Table2,ChevronLeft,type LucideIcon} from 'lucide-react';

// A curated first pass: shared editor and action symbols keep the existing size,
// theme color and decorative accessibility contract. Other icons stay unchanged.
const lucideIcons:Record<string,LucideIcon>={bold:Bold,italic:Italic,underline:Underline,strike:Strikethrough,code:CodeXml,mask:EyeOff,sketch:PencilLine,clearFormat:RemoveFormatting,format:Type,insert:ImagePlus,connections:Waypoints,organize:ListTree,learn:GraduationCap,link:Link,backlinks:CornerDownLeft,mirror:PanelsLeftRight,indent:IndentIncrease,outdent:IndentDecrease,numbered:ListOrdered,quote:TextQuote,equation:Sigma,diagram:Workflow,table:Table2,categoryBack:ChevronLeft};
const paths: Record<string, string> = {
  camera: "M4 6h4l2-3h4l2 3h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  dashboard: "M3 3h7v8H3zM14 3h7v5h-7zM3 15h7v6H3zM14 12h7v9h-7z",
  clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2",
  timer: "M9 2h6M12 2v3M18 5l2-2M21 14a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 9v5l3 2",
  sprout: "M12 22v-9M12 16C3 16 2 10 3 5c7 0 10 3 9 11M12 13c0-7 3-10 9-10 1 6-2 10-9 10",
  leaf: "M20 3C9 1 2 7 4 14c2 8 14 8 16-11ZM3 21l12-12",
  sunrise: "M3 17h18M5 21h14M7 17a5 5 0 1 1 10 0M12 2v3M3 8l2 2M21 8l-2 2M12 7V2m-3 3 3-3 3 3",
  sliders: "M4 6h4m4 0h8M4 12h9m4 0h3M4 18h2m4 0h10M8 3v6M13 9v6M6 15v6",
  refresh: "M3 10a9 9 0 1 1 2 8M3 4v6h6",
  pencil: "m16 3 5 5M4 20l4-1L21 6a2 2 0 0 0-3-3L5 16l-1 4Z",
  up: "m6 14 6-6 6 6",
  down: "m6 10 6 6 6-6",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  logout: "M9 4H4v16h5M13 8l4 4-4 4m-5-4h13",
  skipBack:"M5 5v14M19 5 7 12l12 7Z",
  skipNext:"M19 5v14M5 5l12 7-12 7Z",
  music: "M9 18V5l12-2v13M9 8l12-2M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  youtube: "M5 5h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Zm5 4 6 3-6 3Z",
  globe: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M2 12h20M12 2c-6 6-6 14 0 20 6-6 6-14 0-20",
  hash: "M9 3 7 21M17 3l-2 18M4 9h17M3 15h17",
  at: "M16 8v6a3 3 0 0 0 6 0v-2a10 10 0 1 0-4 8M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  history: "M3 10a9 9 0 1 1 1 8M3 4v6h6M12 7v5l4 2",
  people: "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M18 3a4 4 0 0 1 0 8M22 21v-3a4 4 0 0 0-3-4",
  pane: "M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M10 4v16M14 12h4m-2-2v4",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18",
  quote: "M4 6h16M4 12h10M4 18h10M2 4v16",
  divider: "M3 12h18",
  numbered: "M9 6h12M9 12h12M9 18h12M3 4v4m-1 3h2v2H2v2h2M2 17h2v4H2m0-2h2",

  birthday: "M4 11h16v10H4zM4 15q2 3 4 0 2 3 4 0 2 3 4 0 2 3 4 0M8 11V7m4 4V7m4 4V7M8 4h.01M12 3h.01M16 4h.01",
  bill: "M5 3h14v18l-3-2-4 2-4-2-3 2zM8 7h8m-8 4h8m-8 4h4",
  heart: "M12 21 3 12a5 5 0 0 1 9-6 5 5 0 0 1 9 6z",
  renewal: "M20 9a8 8 0 1 0 0 6M20 3v6h-6",
  travel: "m3 12 7 2 3 7 3-18-13 9zM10 14l6-6",
  pause: "M8 5v14M16 5v14",
  folder: "M3 7V5a2 2 0 0 1 2-2h5l3 3h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  emoji: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M8 9h.01M16 9h.01M7 14s1.5 4 5 4 5-4 5-4",
  fullscreen: "M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5",
  fullscreenExit: "M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5",
  image: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M8 7h.01",
  play: "m8 4 13 8-13 8z",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z",
  help: "M9.1 9a3 3 0 1 1 5.8 1c-.8 1-2.9 1.6-2.9 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  menu: "M4 6h16M4 12h16M4 18h16",
  notes: "M8 6h13M8 12h13M8 18h9M3 6h.01M3 12h.01M3 18h.01",
  calendar: "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2M8 2v4m8-4v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01",
  study: "M12 6C9 4 6 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1v14",
  plus: "M12 5v14M5 12h14",
  edit: "m15 4 5 5M4 20l4-1L21 6l-4-4L4 15z",
  zoomIn: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15m5-2 6 6M7 10.5h7m-3.5-3.5v7",
  zoomOut: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15m5-2 6 6M7 10.5h7",
  chevron: "m9 5 7 7-7 7",
  back: "m14 5-7 7 7 7",
  commands: "M9 7V5a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v14a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2V7",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15m5-2 6 6",
  settings:
    "M4 7h4m6 0h6M4 17h10M14 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M20 17a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  indent: "M10 5h11M10 12h11M10 19h11M3 8l4 4-4 4",
  outdent: "M10 5h11M10 12h11M10 19h11M7 8l-4 4 4 4",
  expand: "M5 12h14M12 3v5m-3-2 3-3 3 3M12 21v-5m-3 2 3 3 3-3",
  collapse: "M5 12h14M12 3v5m-3-3 3 3 3-3M12 21v-5m-3 3 3-3 3 3",
  mask: "M5 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2M7 10v4m5-4v4m5-4v4",
  trash: "M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  undo: "M4 9h10a6 6 0 0 1 0 12M4 9l5-5M4 9l5 5",
  redo: "M20 9H10a6 6 0 0 0 0 12m10-12-5-5m5 5-5 5",
  download: "M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4",
  upload: "M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  grip: "M8 5h.01M16 5h.01M8 12h.01M16 12h.01M8 19h.01M16 19h.01",
  link: "m10 8 2-2a5 5 0 0 1 7 7l-2 2M14 16l-2 2a5 5 0 0 1-7-7l2-2m2 6 6-6",
  copy: "M9 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2M16 4V3H4a1 1 0 0 0-1 1v12h1",
  cut: "M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0M8 8l13 13M8 16 21 3",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1",
  sidebar: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16",
  sidebarCollapse: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16M16 9l-3 3 3 3",
  sidebarExpand: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 4v16M13 9l3 3-3 3",
  moon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
  home: "m3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9",
  forward: "m10 19 7-7-7-7",
};
export const Icon=memo(function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const Component=lucideIcons[name];
  if(Component)return <Component className="remo-icon" data-icon-library="lucide" data-icon={name} size={size} strokeWidth={1.65} color="currentColor" aria-hidden="true" focusable="false" style={{flexShrink:0,verticalAlign:'middle'}}/>;
  return (
    <svg
      className="remo-icon"
      focusable="false"
      style={{ flexShrink: 0, verticalAlign: "middle" }}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.notes} />
    </svg>
  );
});
