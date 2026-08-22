"use client";

import React, { useRef, useState, useEffect } from "react";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  className?: string;
}

export const OtpInput: React.FC<OtpInputProps> = ({
  length = 6,
  value,
  onChange,
  onComplete,
  className = "",
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [digits, setDigits] = useState<string[]>(
    Array.from({ length }, (_, i) => value[i] || "")
  );

  useEffect(() => {
    const newDigits = Array.from({ length }, (_, i) => value[i] || "");
    setDigits(newDigits);
  }, [value, length]);

  const handleChange = (index: number, val: string) => {
    const singleChar = val.slice(-1);
    if (!/^\d*$/.test(singleChar)) return;

    const newDigits = [...digits];
    newDigits[index] = singleChar;
    const combined = newDigits.join("");
    onChange(combined);

    if (singleChar && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (combined.length === length && onComplete) {
      onComplete(combined);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData("text").trim();
    if (!/^\d+$/.test(pasteData)) return;

    const pastedDigits = pasteData.slice(0, length).split("");
    const newDigits = Array.from({ length }, (_, i) => pastedDigits[i] || "");
    const combined = newDigits.join("");
    onChange(combined);

    const nextIndex = Math.min(pastedDigits.length, length - 1);
    inputRefs.current[nextIndex]?.focus();

    if (combined.length === length && onComplete) {
      onComplete(combined);
    }
  };

  return (
    <div className={`flex items-center justify-between gap-2 sm:gap-3 ${className}`}>
      {Array.from({ length }).map((_, index) => {
        const isFilled = !!digits[index];
        return (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digits[index] || ""}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            className={`w-11 h-13 sm:w-13 sm:h-16 text-center font-display font-extrabold text-xl sm:text-2xl border-[3px] border-[#171313] rounded-xl outline-none transition-all select-all ${
              isFilled
                ? "bg-[#D94B3D] text-[#FFFFFF] shadow-[3px_3px_0px_#171313] -translate-x-0.5 -translate-y-0.5"
                : "bg-white text-[#171313] shadow-[2px_2px_0px_#171313] focus:bg-[#FFF4E6] focus:border-[#D94B3D] focus:shadow-[4px_4px_0px_#D94B3D]"
            }`}
          />
        );
      })}
    </div>
  );
};
