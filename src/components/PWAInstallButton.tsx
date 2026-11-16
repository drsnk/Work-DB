import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 min-h-[40px] text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
        style={{
          borderColor: 'var(--fv-border)',
          backgroundColor: 'var(--fv-surface)',
          color: 'var(--fv-ink)',
        }}
      >
        <Download className="w-3.5 h-3.5" />
        Install App
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 min-h-[40px] text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer"
          style={{
            borderColor: 'var(--fv-border)',
            backgroundColor: 'var(--fv-surface)',
            color: 'var(--fv-ink)',
          }}
        >
          <Smartphone className="w-3.5 h-3.5" />
          Install on iPad
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div
              className="w-full max-w-sm rounded-xl border p-6 shadow-xl"
              style={{
                backgroundColor: 'var(--fv-surface)',
                borderColor: 'var(--fv-border)',
                color: 'var(--fv-ink)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-lg font-semibold">Install on iPadOS / iOS</h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-2 rounded-lg hover:opacity-70 cursor-pointer"
                  aria-label="Close install guide"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--fv-muted)' }}>
                1. Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                <br />
                2. Scroll down and select <strong>Add to Home Screen</strong>.
                <br />
                3. Launch FolioVault offline anytime with full touch support.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[44px] rounded-lg text-sm font-medium cursor-pointer"
                style={{
                  backgroundColor: 'var(--fv-accent)',
                  color: 'var(--fv-accent-ink)',
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
