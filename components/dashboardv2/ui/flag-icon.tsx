"use client";

import React from "react";
import { CircleFlag } from "react-circle-flags";

interface FlagIconProps {
  code: string;
  size?: number;
}

export function FlagIcon({ code, size = 28 }: FlagIconProps) {
  if (code === "eu") {
    return (
      <div
        className="flex items-center justify-center rounded-full bg-[#1a3f91] text-[11px] font-semibold tracking-[0.18em] text-white"
        style={{ width: size, height: size }}
      >
        EU
      </div>
    );
  }

  return <CircleFlag countryCode={code} height={size} width={size} />;
}
