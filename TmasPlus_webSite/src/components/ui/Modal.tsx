import React, { useEffect } from "react";
import { classNames } from "@/utils/classNames";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
};

const sizes = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  footer,
  size = "lg",
}) => {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* Panel */}
      <div className="absolute inset-0 flex items-start justify-center overflow-auto">
        <div
          className={classNames(
            "w-full mx-4 my-8 bg-white rounded-2xl shadow-xl border border-slate-200",
            "animate-[modalIn_.2s_ease]",
            sizes[size]
          )}
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-lg p-2 hover:bg-slate-100 text-slate-500"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-5">{children}</div>

          {/* Footer */}
          {footer && (
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
              {footer}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes modalIn { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
};
