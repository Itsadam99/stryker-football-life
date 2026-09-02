import React from "react";

interface StrykerLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export const StrykerLogo: React.FC<StrykerLogoProps> = ({
  className = "",
  size = 42,
}) => {
  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      <img
        src="/stryker-logo.png"
        alt="STRYKER Logo"
        style={{ height: `${size}px`, width: "auto" }}
        className="object-contain drop-shadow-[0_0_15px_rgba(113,19,97,0.8)] filter"
      />
    </div>
  );
};
