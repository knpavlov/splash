import type { SVGProps } from 'react';

export const CloseIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path
      d="M5.28 5.28a.75.75 0 0 1 1.06 0L10 8.94l3.66-3.66a.75.75 0 0 1 1.06 1.06L11.06 10l3.66 3.66a.75.75 0 0 1-1.06 1.06L10 11.06l-3.66 3.66a.75.75 0 0 1-1.06-1.06L8.94 10 5.28 6.34a.75.75 0 0 1 0-1.06Z"
      fill="currentColor"
    />
  </svg>
);
