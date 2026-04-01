import React from "react";

type WitmeHeaderLogoProps = {
  className?: string;
  color?: string;
};

export const WitmeHeaderLogo: React.FC<WitmeHeaderLogoProps> = ({
  className = "",
  color = "#26324A",
}) => (
  <svg
    className={className}
    viewBox="0 0 700 170"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="witme"
  >
    <path d="M42 44C42 34.6112 49.6112 27 59 27H128C137.389 27 145 34.6112 145 44V85C145 94.3888 137.389 102 128 102H99L84 119C80.98 122.4 75.5 120.2 75.5 115.8V102H59C49.6112 102 42 94.3888 42 85V44Z" fill={color} />
    <line x1="68" y1="57" x2="122" y2="57" stroke="#F8FAFF" strokeWidth="6" strokeLinecap="round" />
    <line x1="68" y1="68" x2="107" y2="68" stroke="#F8FAFF" strokeWidth="6" strokeLinecap="round" />
    <line x1="68" y1="79" x2="96" y2="79" stroke="#F8FAFF" strokeWidth="6" strokeLinecap="round" />
    <text x="170" y="113" fill={color} fontFamily="Inter, Segoe UI, Arial, sans-serif" fontWeight="800" fontSize="106" letterSpacing="-2">
      witme
    </text>
  </svg>
);

export default WitmeHeaderLogo;
