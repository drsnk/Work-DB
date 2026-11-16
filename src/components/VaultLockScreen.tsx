import React, { useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, Upload } from 'lucide-react';
import type { VaultHeader } from '../types/vault';
import { PWAInstallButton } from './PWAInstallButton';

interface VaultLockScreenProps {
  existingHeader: VaultHeader | null;
  isBusy: boolean;
  errorMessage: string | null;
  onUnlock: (passphrase: string) => Promise<void>;
  onCreateVault: (passphrase: string) => Promise<void>;
  onImportBackup: (file: File) => Promise<void>;
}

export const VaultLockScreen: React.FC<VaultLockScreenProps> = ({
  existingHeader,
  isBusy,
  errorMessage,
  onUnlock,
  onCreateVault,
  onImportBackup,
}) => {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSetupMode = !existingHeader;

  const strengthScore = (() => {
    if (!passphrase) return 0;
    let score = 0;
    if (passphrase.length >= 8) score++;
    if (passphrase.length >= 14) score++;
    if (/[A-Z]/.test(passphrase) && /[a-z]/.test(passphrase)) score++;
    if (/[0-9]/.test(passphrase) || /[^A-Za-z0-9]/.test(passphrase)) score++;
    return score;
  })();

  const strengthLabels = ['Too short', 'Weak', 'Fair', 'Strong', 'Archival'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (passphrase.length < 6) {
      setLocalError('Passphrase must be at least 6 characters.');
      return;
    }

    if (isSetupMode) {
      if (passphrase !== confirmPassphrase) {
        setLocalError('Passphrases do not match.');
        return;
      }
      await onCreateVault(passphrase);
    } else {
      await onUnlock(passphrase);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-between px-4 py-6 sm:px-8"
      style={{ backgroundColor: 'var(--fv-canvas)', color: 'var(--fv-ink)' }}
    >
      <header className="max-w-5xl w-full mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Lock className="w-4 h-4" style={{ color: 'var(--fv-accent)' }} />
          <span className="font-display text-xl font-semibold tracking-tight whitespace-nowrap shrink-0">
            FolioVault
          </span>
        </div>
        <PWAInstallButton />
      </header>

      <main className="max-w-md w-full mx-auto my-auto py-8">
        <div
          className="rounded-xl border p-6 sm:p-8"
          style={{
            backgroundColor: 'var(--fv-surface)',
            borderColor: 'var(--fv-border)',
          }}
        >
          <div className="mb-6">
            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--fv-accent)' }}>
              {isSetupMode ? 'Initialize Encrypted Vault' : 'Encrypted Workspace Locked'}
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
              {isSetupMode ? 'Create your master passphrase' : 'Unlock your local vault'}
            </h1>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--fv-muted)' }}>
              {isSetupMode
                ? 'Your passphrase derives a local AES-256-GCM key via PBKDF2 (250,000 SHA-256 rounds). Zero plaintext ever touches disk or Google Drive.'
                : 'Enter your master passphrase to decrypt your local metadata index and documents into session memory.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--fv-ink)' }}>
                Master Passphrase
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder={isSetupMode ? 'At least 8 characters recommended' : 'Enter passphrase'}
                  autoFocus
                  className="w-full min-h-[44px] rounded-lg border pl-3.5 pr-11 text-sm outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--fv-canvas)',
                    borderColor: 'var(--fv-border)',
                    color: 'var(--fv-ink)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] flex items-center justify-center rounded-md cursor-pointer"
                  style={{ color: 'var(--fv-muted)' }}
                  aria-label={showPass ? 'Hide passphrase' : 'Show passphrase'}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {isSetupMode && passphrase.length > 0 && (
                <div className="mt-2 flex items-center justify-between text-xs" style={{ color: 'var(--fv-muted)' }}>
                  <div className="flex items-center gap-1.5 flex-1 mr-3">
                    {[1, 2, 3, 4].map((lvl) => (
                      <div
                        key={lvl}
                        className="h-1 flex-1 rounded-full transition-colors"
                        style={{
                          backgroundColor:
                            strengthScore >= lvl ? 'var(--fv-accent)' : 'var(--fv-border)',
                        }}
                      />
                    ))}
                  </div>
                  <span className="tabular-nums">{strengthLabels[strengthScore]}</span>
                </div>
              )}
            </div>

            {isSetupMode && (
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--fv-ink)' }}>
                  Confirm Passphrase
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassphrase}
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  placeholder="Re-enter master passphrase"
                  className="w-full min-h-[44px] rounded-lg border px-3.5 text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--fv-canvas)',
                    borderColor: 'var(--fv-border)',
                    color: 'var(--fv-ink)',
                  }}
                />
              </div>
            )}

            {(localError || errorMessage) && (
              <div
                className="rounded-lg border px-3.5 py-2.5 text-xs font-medium"
                style={{
                  borderColor: 'var(--fv-danger)',
                  color: 'var(--fv-danger)',
                  backgroundColor: 'var(--fv-subtle)',
                }}
              >
                {localError || errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy}
              className="w-full min-h-[46px] rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-opacity disabled:opacity-60 cursor-pointer"
              style={{
                backgroundColor: 'var(--fv-accent)',
                color: 'var(--fv-accent-ink)',
              }}
            >
              <KeyRound className="w-4 h-4" />
              {isBusy
                ? 'Deriving AES-256-GCM Key...'
                : isSetupMode
                ? 'Create Encrypted Vault'
                : 'Unlock Vault'}
            </button>
          </form>

          <div
            className="mt-6 pt-5 border-t flex flex-wrap items-center justify-between gap-3 text-xs"
            style={{ borderColor: 'var(--fv-border)', color: 'var(--fv-muted)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--fv-success)' }} />
              AES-256-GCM · Offline-First
            </span>

            <input
              ref={fileInputRef}
              type="file"
              accept=".fvault,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportBackup(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2 hover:opacity-80 cursor-pointer"
              style={{ color: 'var(--fv-ink)' }}
            >
              <Upload className="w-3.5 h-3.5" />
              Restore .fvault Backup
            </button>
          </div>
        </div>
      </main>

      <footer className="max-w-5xl w-full mx-auto text-center text-xs" style={{ color: 'var(--fv-muted)' }}>
        Local IndexedDB storage · Desktop folder mirroring · End-to-end encrypted Google Drive sync
      </footer>
    </div>
  );
};
