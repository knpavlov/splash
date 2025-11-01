import type { SVGProps } from 'react';

export const ResultsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path
      d="M4.5 3.5a.75.75 0 0 0-.75.75v11.5a.75.75 0 0 0 .75.75h11a.75.75 0 0 0 .75-.75V7.25a.75.75 0 0 0-1.5 0V15H5.25V4.25A.75.75 0 0 0 4.5 3.5Zm4 3a.75.75 0 0 0-.75.75v6.5a.75.75 0 0 0 1.5 0v-6.5A.75.75 0 0 0 8.5 6.5Zm3-2a.75.75 0 0 0-.75.75v8.5a.75.75 0 0 0 1.5 0v-8.5a.75.75 0 0 0-.75-.75Zm3 3a.75.75 0 0 0-.75.75v5.5a.75.75 0 0 0 1.5 0v-5.5a.75.75 0 0 0-.75-.75Z"
      fill="currentColor"
    />
  </svg>
);
