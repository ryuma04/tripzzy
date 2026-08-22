"use client";

import React from "react";
import Image from "next/image";

export const TravelMotionScene: React.FC = () => {
  return (
    <div className="relative w-full flex items-center justify-center lg:justify-end select-none">
      <div className="relative w-full max-w-[660px] aspect-[654/684] flex items-center justify-center">
        <Image
          src="/hero-artwork.png"
          alt="Tripzyy Travel Master Illustration"
          fill
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="object-contain object-center lg:object-right pointer-events-none"
          priority
          unoptimized
        />
      </div>
    </div>
  );
};
