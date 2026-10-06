// Thin line icons only (1.25px stroke). No emoji, no filled cartoon icons (brief 7.5).
import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

export const IconCheckCircle = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.3l2.6 2.5L16 9.5" />
  </Icon>
);
export const IconAlert = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.2v.3" />
  </Icon>
);
export const IconArrowLeft = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);
export const IconArrowRight = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" />
    <path d="M8 10.5V8a4 4 0 018 0v2.5" />
  </Icon>
);
export const IconCamera = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M4 8h3.5L9 5.5h6L16.5 8H20v11H4z" />
    <circle cx="12" cy="13.2" r="3.4" />
  </Icon>
);
export const IconUpload = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 15V4.5M7.5 9L12 4.5 16.5 9M5 15v4.5h14V15" />
  </Icon>
);
export const IconSun = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.8" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
  </Icon>
);
export const IconCopy = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" />
    <path d="M15.5 8.5V4.5h-11v11h4" />
  </Icon>
);
export const IconMail = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" />
    <path d="M4 6.5l8 6.2 8-6.2" />
  </Icon>
);
export const IconPhone = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6.5 4h3l1.5 4-2 1.3a10 10 0 005.7 5.7L16 13l4 1.5v3A2 2 0 0118 19.5 15.5 15.5 0 014.5 6 2 2 0 016.5 4z" />
  </Icon>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
export const IconArrowUpRight = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M7 17L17 7M9 7h8v8" />
  </Icon>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
