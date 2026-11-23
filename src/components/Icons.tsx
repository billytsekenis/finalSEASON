import type { LightKind } from '../../shared/types';

type P = { className?: string };
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
};

export const PowerIcon = ({ className }: P) => (
  <svg {...base} className={className} strokeWidth={2.2}>
    <path d="M12 3v8" />
    <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
  </svg>
);

export const BulbIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
  </svg>
);

export const StripIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 7c4 0 4 4 8 4s4-4 8-4" />
    <path d="M4 14c4 0 4 4 8 4s4-4 8-4" />
  </svg>
);

export const SpotIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M7 4h10l-2 7H9L7 4Z" />
    <path d="M9 11l-2 9M15 11l2 9M12 14v6" />
  </svg>
);

export const PlugIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M9 3v5M15 3v5" />
    <path d="M6 8h12v3a6 6 0 0 1-12 0V8Z" />
    <path d="M12 17v4" />
  </svg>
);

export const KindIcon = ({ kind, className }: P & { kind: LightKind }) =>
  kind === 'strip' ? <StripIcon className={className} /> : kind === 'spot' ? <SpotIcon className={className} /> : kind === 'plug' ? <PlugIcon className={className} /> : <BulbIcon className={className} />;

export const GearIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);

export const CloseIcon = ({ className }: P) => (
  <svg {...base} className={className} strokeWidth={2.2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const PlusIcon = ({ className }: P) => (
  <svg {...base} className={className} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const CheckIcon = ({ className }: P) => (
  <svg {...base} className={className} strokeWidth={2.4}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const ChevronIcon = ({ className }: P) => (
  <svg {...base} className={className} strokeWidth={2.2}>
    <path d="m9 5 7 7-7 7" />
  </svg>
);

export const BackIcon = ({ className }: P) => (
  <svg {...base} className={className} strokeWidth={2.2}>
    <path d="m15 5-7 7 7 7" />
  </svg>
);

export const SunIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const EditIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </svg>
);

export const TrashIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

export const SparkIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
    <path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7L19 16Z" />
  </svg>
);

export const WifiOffIcon = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.6M19 12.9a10 10 0 0 0-2-1.5M2 9a15 15 0 0 1 4.4-2.9M22 9a15 15 0 0 0-11-4" />
    <circle cx="12" cy="20" r="0.8" fill="currentColor" />
  </svg>
);
