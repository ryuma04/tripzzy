"use client";

import React from "react";
import { Modal } from "./modal";
import { NeoButton } from "./neo-button";
import { AlertTriangle } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  variant?: "red" | "dark" | "yellow";
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm Delete",
  cancelLabel = "Cancel",
  isLoading = false,
  variant = "red",
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
      <div className="flex flex-col items-center text-center gap-4 py-2">
        <div className="w-14 h-14 rounded-2xl border-[3px] border-[#111111] bg-[#FF6B6B] flex items-center justify-center text-white shadow-[3px_3px_0px_#111111]">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <p className="text-sm font-medium text-neutral-700">{message}</p>
        <div className="flex items-center justify-center gap-3 w-full mt-4">
          <NeoButton
            variant="white"
            size="md"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1"
          >
            {cancelLabel}
          </NeoButton>
          <NeoButton
            variant={variant}
            size="md"
            onClick={onConfirm}
            isLoading={isLoading}
            className="flex-1"
          >
            {confirmLabel}
          </NeoButton>
        </div>
      </div>
    </Modal>
  );
};
