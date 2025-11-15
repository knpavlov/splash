interface IconProps {
  title?: string;
}

export const ExternalLinkIcon = ({ title }: IconProps) => (
  <svg
    viewBox="0 0 20 20"
    role="img"
    aria-label={title}
    focusable="false"
  >
    <path
      fill="currentColor"
      d="M7.75 4.5a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0V6.56l-7.72 7.72a.75.75 0 0 1-1.06-1.06L12.69 5.5H8.5a.75.75 0 0 1-.75-.75Z"
    />
    <path
      fill="currentColor"
      d="M4.25 6A1.75 1.75 0 0 1 6 4.25h2a.75.75 0 0 1 0 1.5H6A.25.25 0 0 0 5.75 6v8.25c0 .14.11.25.25.25h8.25a.25.25 0 0 0 .25-.25V12a.75.75 0 0 1 1.5 0v2.25A1.75 1.75 0 0 1 14.25 16H6A1.75 1.75 0 0 1 4.25 14.25Z"
    />
  </svg>
);
