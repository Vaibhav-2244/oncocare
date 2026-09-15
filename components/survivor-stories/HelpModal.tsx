'use client';

import { CircleHelp, X } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-8 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-lg"
          type="button"
          aria-label="Close help"
          onClick={onClose}
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center">
            <CircleHelp size={32} className="text-teal-600" />
          </div>
        </div>

        {/* Content */}
        <h2 className="text-xl font-bold text-slate-900 text-center mb-4">
          Need support?
        </h2>

        <p className="text-slate-700 text-center mb-6 leading-relaxed">
          If you need personal medical or emotional support, please reach out to your oncology care team.
          Survivor stories are for connection and perspective, not a substitute for professional care.
        </p>

        {/* Close button */}
        <button
          className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
