interface ChevronIconProps {
  direction?: 'up' | 'down' | 'left' | 'right';
  size?: number;
  className?: string;
}

const rotationMap: Record<NonNullable<ChevronIconProps['direction']>, number> = {
  up: -90,
  right: 0,
  down: 90,
  left: 180
};

export const ChevronIcon = ({ direction = 'down', size = 16, className }: ChevronIconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    style={{ transform: `rotate(${rotationMap[direction]}deg)` }}
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M8 5l8 7-8 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
