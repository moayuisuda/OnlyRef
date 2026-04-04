import { useId, type FC } from "react";

type BrandWheelIconProps = {
  className?: string;
  size?: number;
  title?: string;
};

const SPOKE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;

export const BrandWheelIcon: FC<BrandWheelIconProps> = ({
  className,
  size = 20,
  title,
}) => {
  const titleId = useId().replace(/:/g, "");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-labelledby={title ? titleId : undefined}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title id={titleId}>{title}</title> : null}

      <circle cx="12" cy="12" r="9.25" fill="currentColor" fillOpacity="0.08" />
      <circle
        cx="12"
        cy="12"
        r="8.45"
        stroke="currentColor"
        strokeOpacity="0.18"
        strokeWidth="1.1"
      />
      <circle
        cx="12"
        cy="12"
        r="6.35"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      {SPOKE_ANGLES.map((angle) => (
        <g key={angle} transform={`rotate(${angle} 12 12)`}>
          <path
            d="M12 12V5.65"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="3.45" r="1.12" fill="currentColor" />
        </g>
      ))}

      <circle
        cx="12"
        cy="12"
        r="2.55"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
};
