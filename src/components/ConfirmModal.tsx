import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#18181b] border border-zinc-800/80 rounded-xl p-5 flex flex-col gap-3 w-full max-w-[360px] shadow-2xl animate-slide-up">
        
        <div>
          <h3 className="text-body font-semibold text-zinc-100 flex items-center gap-2">
            <AlertTriangle className="text-red-500" size={16} />
            {title}
          </h3>
          <p className="text-body text-zinc-400 mt-2 leading-relaxed">
            {message}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-3 mt-2">
          {cancelText && (
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-body font-medium text-zinc-300 hover:text-zinc-100 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 rounded-lg transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-body font-medium text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/30 rounded-lg transition-colors"
          >
            {confirmText}
          </button>
        </div>

      </div>
    </div>
  );
}
