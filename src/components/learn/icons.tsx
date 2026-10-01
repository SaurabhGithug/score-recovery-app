/** Small inline SVG icon set for the Learn hub and the standards list (no icon dependency). All are decorative: pair them with text. */

type IconProps = { className?: string };

function Svg({ className = "h-5 w-5", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      {children}
    </svg>
  );
}

export const ArrowRightIcon = (p: IconProps) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const ArrowLeftIcon = (p: IconProps) => <Svg {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
export const ChevronRightIcon = (p: IconProps) => <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>;
export const CheckIcon = (p: IconProps) => <Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>;
export const ClockIcon = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const SparkleIcon = (p: IconProps) => <Svg {...p}><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 10.9 10.1 9 12 3.5ZM19 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" /></Svg>;
export const BookOpenIcon = (p: IconProps) => <Svg {...p}><path d="M12 6v14M12 6C9.5 4.3 6 4.2 3.5 5v13.5c2.5-.8 6-.7 8.5 1 2.5-1.7 6-1.8 8.5-1V5C18 4.2 14.5 4.3 12 6Z" /></Svg>;
export const PencilIcon = (p: IconProps) => <Svg {...p}><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17l-1 3ZM14.5 7.5l3 3" /></Svg>;
export const NoteIcon = (p: IconProps) => <Svg {...p}><path d="M6 3.5h9l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1-1.5ZM14.5 3.5V8H19M8.5 12.5h7M8.5 16h5" /></Svg>;
export const LayersIcon = (p: IconProps) => <Svg {...p}><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5ZM3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5" /></Svg>;
export const ChartIcon = (p: IconProps) => <Svg {...p}><path d="M4 4v16h16M8 16v-4M12.5 16V8M17 16v-6" /></Svg>;
export const PlayIcon = (p: IconProps) => <Svg {...p}><path d="M8 5.5v13l10.5-6.5L8 5.5Z" /></Svg>;
export const AlertIcon = (p: IconProps) => <Svg {...p}><path d="M12 4 3 19.5h18L12 4ZM12 10v4.5M12 17h.01" /></Svg>;
