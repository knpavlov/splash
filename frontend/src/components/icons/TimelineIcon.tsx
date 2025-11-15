interface IconProps {
  title?: string;
}

export const TimelineIcon = ({ title }: IconProps) => (
  <svg
    viewBox="0 0 20 20"
    role="img"
    aria-label={title}
    focusable="false"
  >
    <rect x="3" y="5" width="14" height="2" rx="1" fill="currentColor" opacity="0.9" />
    <rect x="5" y="9" width="10" height="2" rx="1" fill="currentColor" opacity="0.7" />
    <rect x="7" y="13" width="6" height="2" rx="1" fill="currentColor" opacity="0.85" />
  </svg>
);
