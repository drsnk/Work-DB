import React, { useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Cloud,
  Download,
  FolderSync,
  KeyRound,
  Keyboard,
  Palette,
  Plug,
  RefreshCw,
  Shield,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { KeyboardShortcut, PluginDefinition } from '../types/vault';
import { DEFAULT_CUSTOM_CSS_TEMPLATE, THEME_PRESETS } from '../lib/themes';
import { formatShortcutLabel } from '../lib/plugins';
import { isLocalFolderSyncSupported } from '../lib/localFs';

interface SettingsStudioModalProps {
  open: boolean;
  onClose: () => void;
  activeThemeId: string;
  customCss: string;
  onUpdateTheme: (themeId: string, customCss: string) => void;
  plugins: PluginDefinition[];
  onSavePlugins: (plugins: PluginDefinition[]) => void;
  shortcuts: KeyboardShortcut[];
  onSaveShortcuts: (shortcuts: KeyboardShortcut[]) => void;
  googleUser: User | null;
  hasAccessToken: boolean;
  autoSync: boolean;
  localFolderName: string | null;
  lastSyncedAt?: number;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onToggleAutoSync: (enabled: boolean) => void;
  onSyncNow: () => Promise<void>;
  onLinkLocalFolder: () => Promise<void>;
  onExportLocalFolder: () => Promise<void>;
  onImportLocalFolder: () => Promise<void>;
  onExportEncryptedBackup: () => Promise<void>;
  onImportEncryptedBackup: (file: File) => Promise<void>;
  onChangePassphrase: (currentPass: string, newPass: string) => Promise<boolean>;
  onRequestWipeVault: () => void;
}

export const SettingsStudioModal: React.FC<SettingsStudioModalProps> = ({
  open,
  onClose,
  activeThemeId,
  customCss,
  onUpdateTheme,
  plugins,
  onSavePlugins,
  shortcuts,
  onSaveShortcuts,
  googleUser,
  hasAccessToken,
  autoSync,
  localFolderName,
  lastSyncedAt,
  onGoogleSignIn,
  onGoogleSignOut,
  onToggleAutoSync,
  onSyncNow,
  onLinkLocalFolder,
  onExportLocalFolder,
  onImportLocalFolder,
  onExportEncryptedBackup,
  onImportEncryptedBackup,
  onChangePassphrase,
  onRequestWipeVault,
}) => {
  const [tab, setTab] = useState<'themes' | 'plugins' | 'shortcuts' | 'sync'>('themes');
  const [cssDraft, setCssDraft] = useState(customCss || DEFAULT_CUSTOM_CSS_TEMPLATE);

  // Custom Plugin creation state
  const [pluginName, setPluginName] = useState('');
  const [pluginPattern, setPluginPattern] = useState('');
  const [pluginReplacement, setPluginReplacement] = useState('');
  const [pluginSlash, setPluginSlash] = useState('');
  const [pluginTemplate, setPluginTemplate] = useState('');

  // Passphrase rotation state
  const [currPass, setCurrPass] = useState('');
  const [nextPass, setNextPass] = useState('');
  const [passMsg, setPassMsg] = useState<string | null>(null);

  const backupInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleCreateCustomPlugin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pluginName.trim()) return;
    const created: PluginDefinition = {
      id: `custom-${Date.now()}`,
      name: pluginName.trim(),
      description: pluginPattern
        ? `Regex transform /${pluginPattern}/ -> ${pluginReplacement}`
        : `Custom slash command ${pluginSlash}`,
      enabled: true,
      builtIn: false,
      hookType: 'custom-regex',
      pattern: pluginPattern || undefined,
      replacement: pluginReplacement || undefined,
      slashTrigger: pluginSlash ? (pluginSlash.startsWith('/') ? pluginSlash : `/${pluginSlash}`) : undefined,
      slashTemplate: pluginTemplate || undefined,
    };
    onSavePlugins([...plugins, created]);
    setPluginName('');
    setPluginPattern('');
    setPluginReplacement('');
    setPluginSlash('');
    setPluginTemplate('');
  };

  const handlePassRotate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (nextPass.length < 6) {
      setPassMsg('New passphrase must be at least 6 characters.');
      return;
    }
    const ok = await onChangePassphrase(currPass, nextPass);
    if (ok) {
      setPassMsg('Master passphrase rotated and all records re-encrypted.');
      setCurrPass('');
      setNextPass('');
    } else {
      setPassMsg('Current passphrase verification failed.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6">
      <div
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--fv-surface)',
          borderColor: 'var(--fv-border)',
          color: 'var(--fv-ink)',
        }}
      >
        <div
          className="px-5 py-4 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
        >
          <h2 className="font-display text-xl font-semibold">Workspace Studio &amp; Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:opacity-75 cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto"
          style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-subtle)' }}
        >
          {(
            [
              { id: 'themes', label: 'CSS Themes', icon: Palette },
              { id: 'plugins', label: 'Plugins', icon: Plug },
              { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
              { id: 'sync', label: 'Drive Sync & Security', icon: Shield },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="min-h-[40px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--fv-surface)' : 'transparent',
                  color: active ? 'var(--fv-ink)' : 'var(--fv-muted)',
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {tab === 'themes' && (
            <>
              <div>
                <h3 className="text-sm font-semibold mb-3">Theme Presets</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {THEME_PRESETS.map((preset) => {
                    const selected = preset.id === activeThemeId;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onUpdateTheme(preset.id, cssDraft)}
                        className="text-left rounded-xl border p-4 transition-colors cursor-pointer"
                        style={{
                          borderColor: selected ? 'var(--fv-accent)' : 'var(--fv-border)',
                          backgroundColor: selected ? 'var(--fv-accent-soft)' : 'var(--fv-canvas)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold">{preset.name}</span>
                          <div className="flex items-center gap-1">
                            {['--fv-canvas', '--fv-ink', '--fv-accent'].map((v) => (
                              <span
                                key={v}
                                className="w-3.5 h-3.5 rounded-full border"
                                style={{
                                  backgroundColor: preset.cssVariables[v],
                                  borderColor: 'var(--fv-border)',
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        <p className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                          {preset.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t" style={{ borderColor: 'var(--fv-border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold">Custom CSS Theme Injection</h3>
                    <p className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                      Customize --fv-canvas, --fv-accent, fonts, or .fv-prose rules directly.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCssDraft(DEFAULT_CUSTOM_CSS_TEMPLATE);
                        onUpdateTheme(activeThemeId, '');
                      }}
                      className="min-h-[36px] px-3 rounded-lg border text-xs cursor-pointer"
                      style={{ borderColor: 'var(--fv-border)' }}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateTheme(activeThemeId, cssDraft)}
                      className="min-h-[36px] px-3.5 rounded-lg text-xs font-medium cursor-pointer"
                      style={{
                        backgroundColor: 'var(--fv-accent)',
                        color: 'var(--fv-accent-ink)',
                      }}
                    >
                      Apply CSS
                    </button>
                  </div>
                </div>
                <textarea
                  value={cssDraft}
                  onChange={(e) => setCssDraft(e.target.value)}
                  rows={8}
                  className="w-full rounded-lg border p-3 font-mono text-xs leading-relaxed"
                  style={{
                    borderColor: 'var(--fv-border)',
                    backgroundColor: 'var(--fv-canvas)',
                  }}
                />
              </div>
            </>
          )}

          {tab === 'plugins' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-3">Installed Plugins</h3>
                <div className="space-y-2.5">
                  {plugins.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border p-3.5 flex items-start justify-between gap-4"
                      style={{
                        borderColor: 'var(--fv-border)',
                        backgroundColor: 'var(--fv-canvas)',
                      }}
                    >
                      <div>
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <span>{p.name}</span>
                          {p.slashTrigger && (
                            <span className="font-mono text-xs" style={{ color: 'var(--fv-accent)' }}>
                              {p.slashTrigger}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--fv-muted)' }}>
                          {p.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <label className="inline-flex items-center gap-2 text-xs font-medium cursor-pointer min-h-[36px]">
                          <input
                            type="checkbox"
                            checked={p.enabled}
                            onChange={(e) =>
                              onSavePlugins(
                                plugins.map((item) =>
                                  item.id === p.id ? { ...item, enabled: e.target.checked } : item
                                )
                              )
                            }
                            className="w-4 h-4"
                          />
                          <span>{p.enabled ? 'Enabled' : 'Off'}</span>
                        </label>
                        {!p.builtIn && (
                          <button
                            type="button"
                            onClick={() => onSavePlugins(plugins.filter((item) => item.id !== p.id))}
                            className="p-1.5 rounded hover:opacity-75 cursor-pointer"
                            style={{ color: 'var(--fv-danger)' }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <form
                onSubmit={handleCreateCustomPlugin}
                className="pt-4 border-t space-y-3"
                style={{ borderColor: 'var(--fv-border)' }}
              >
                <h3 className="text-sm font-semibold">Register Custom Transform / Slash Plugin</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={pluginName}
                    onChange={(e) => setPluginName(e.target.value)}
                    placeholder="Plugin Name (e.g. Meeting Template)"
                    className="min-h-[40px] rounded-lg border px-3 text-xs"
                    style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                  />
                  <input
                    type="text"
                    value={pluginSlash}
                    onChange={(e) => setPluginSlash(e.target.value)}
                    placeholder="Slash trigger (e.g. /meeting)"
                    className="min-h-[40px] rounded-lg border px-3 text-xs font-mono"
                    style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                  />
                  <input
                    type="text"
                    value={pluginPattern}
                    onChange={(e) => setPluginPattern(e.target.value)}
                    placeholder="Optional regex pattern (e.g. TODO:)"
                    className="min-h-[40px] rounded-lg border px-3 text-xs font-mono"
                    style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                  />
                  <input
                    type="text"
                    value={pluginReplacement}
                    onChange={(e) => setPluginReplacement(e.target.value)}
                    placeholder="Regex replacement (e.g. **Action:**)"
                    className="min-h-[40px] rounded-lg border px-3 text-xs font-mono"
                    style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                  />
                </div>
                <textarea
                  value={pluginTemplate}
                  onChange={(e) => setPluginTemplate(e.target.value)}
                  rows={3}
                  placeholder="Optional slash command Markdown snippet..."
                  className="w-full rounded-lg border p-3 font-mono text-xs"
                  style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
                />
                <button
                  type="submit"
                  className="min-h-[42px] px-4 rounded-lg text-xs font-medium cursor-pointer"
                  style={{
                    backgroundColor: 'var(--fv-accent)',
                    color: 'var(--fv-accent-ink)',
                  }}
                >
                  Add Custom Plugin
                </button>
              </form>
            </div>
          )}

          {tab === 'shortcuts' && (
            <div className="space-y-3">
              <p className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                Customize native keyboard shortcuts (use <code className="font-mono">mod</code> for Cmd on macOS/iPadOS or Ctrl on Windows/Linux).
              </p>
              <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--fv-border)' }}>
                {shortcuts.map((sc) => (
                  <div
                    key={sc.id}
                    className="flex items-center justify-between gap-4 px-4 py-3 border-b last:border-b-0 text-xs"
                    style={{ borderColor: 'var(--fv-border)' }}
                  >
                    <span className="font-medium">{sc.label}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={sc.keys}
                        onChange={(e) =>
                          onSaveShortcuts(
                            shortcuts.map((s) =>
                              s.id === sc.id ? { ...s, keys: e.target.value } : s
                            )
                          )
                        }
                        className="w-32 min-h-[34px] rounded border px-2 font-mono text-xs text-center"
                        style={{
                          borderColor: 'var(--fv-border)',
                          backgroundColor: 'var(--fv-canvas)',
                        }}
                      />
                      <span className="font-mono w-16 text-right" style={{ color: 'var(--fv-muted)' }}>
                        {formatShortcutLabel(sc.keys)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'sync' && (
            <div className="space-y-6">
              {/* Google Drive Encrypted Sync */}
              <div
                className="rounded-xl border p-4 space-y-3"
                style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4" style={{ color: 'var(--fv-accent)' }} />
                    <h3 className="text-sm font-semibold">Google Drive Encrypted Sync</h3>
                  </div>
                  {lastSyncedAt && (
                    <span className="text-xs tabular-nums" style={{ color: 'var(--fv-muted)' }}>
                      Last synced {new Date(lastSyncedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--fv-muted)' }}>
                  Only AES-256-GCM encrypted envelopes are uploaded to your private{' '}
                  <strong>FolioVault Encrypted Vault</strong> Google Drive folder.
                </p>

                {!googleUser || !hasAccessToken ? (
                  <button
                    type="button"
                    onClick={onGoogleSignIn}
                    className="gsi-material-button"
                  >
                    <div className="gsi-material-button-content-wrapper">
                      <div className="gsi-material-button-icon">
                        <svg viewBox="0 0 48 48" style={{ display: 'block' }}>
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                        </svg>
                      </div>
                      <span className="gsi-material-button-contents">Sign in with Google</span>
                    </div>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs">
                      Connected as <strong>{googleUser.email}</strong>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoSync}
                          onChange={(e) => onToggleAutoSync(e.target.checked)}
                          className="w-4 h-4"
                        />
                        Auto-sync edits
                      </label>
                      <button
                        type="button"
                        onClick={onSyncNow}
                        className="min-h-[40px] px-3.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--fv-accent)',
                          color: 'var(--fv-accent-ink)',
                        }}
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Sync Now
                      </button>
                      <button
                        type="button"
                        onClick={onGoogleSignOut}
                        className="min-h-[40px] px-3 rounded-lg border text-xs cursor-pointer"
                        style={{ borderColor: 'var(--fv-border)' }}
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Desktop Local Folder Sync (File System Access API) */}
              <div
                className="rounded-xl border p-4 space-y-3"
                style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
              >
                <div className="flex items-center gap-2">
                  <FolderSync className="w-4 h-4" style={{ color: 'var(--fv-accent)' }} />
                  <h3 className="text-sm font-semibold">Desktop Local Folder Mirror</h3>
                </div>
                {isLocalFolderSyncSupported() ? (
                  <>
                    <p className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                      Mirror your vault to real local `.md` files with YAML frontmatter on desktop.
                      {localFolderName ? ` Linked folder: ${localFolderName}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={onLinkLocalFolder}
                        className="min-h-[40px] px-3.5 rounded-lg border text-xs font-medium cursor-pointer"
                        style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-surface)' }}
                      >
                        {localFolderName ? 'Change Local Folder' : 'Choose Local Folder'}
                      </button>
                      {localFolderName && (
                        <>
                          <button
                            type="button"
                            onClick={onExportLocalFolder}
                            className="min-h-[40px] px-3.5 rounded-lg border text-xs font-medium cursor-pointer"
                            style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-surface)' }}
                          >
                            Write .md Files to Folder
                          </button>
                          <button
                            type="button"
                            onClick={onImportLocalFolder}
                            className="min-h-[40px] px-3.5 rounded-lg border text-xs font-medium cursor-pointer"
                            style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-surface)' }}
                          >
                            Import .md Files from Folder
                          </button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                    Direct local directory handles are unavailable on this browser (such as iPadOS Safari). Your vault automatically runs in encrypted offline IndexedDB mode with Google Drive sync and `.fvault` archive backups.
                  </p>
                )}
              </div>

              {/* Encrypted Backup & Passphrase Rotation */}
              <div
                className="rounded-xl border p-4 space-y-4"
                style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-canvas)' }}
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">Encrypted Archive Backup</h3>
                    <p className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                      Download or restore a complete AES-256-GCM encrypted `.fvault` snapshot.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onExportEncryptedBackup}
                      className="min-h-[40px] px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                      style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-surface)' }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export .fvault
                    </button>
                    <input
                      ref={backupInputRef}
                      type="file"
                      accept=".fvault,.json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) onImportEncryptedBackup(f);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => backupInputRef.current?.click()}
                      className="min-h-[40px] px-3.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                      style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-surface)' }}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Restore
                    </button>
                  </div>
                </div>

                <form
                  onSubmit={handlePassRotate}
                  className="pt-4 border-t space-y-2.5"
                  style={{ borderColor: 'var(--fv-border)' }}
                >
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <KeyRound className="w-3.5 h-3.5" />
                    Rotate Master Passphrase
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="password"
                      value={currPass}
                      onChange={(e) => setCurrPass(e.target.value)}
                      placeholder="Current passphrase"
                      className="min-h-[38px] rounded-lg border px-3 text-xs"
                      style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-surface)' }}
                    />
                    <input
                      type="password"
                      value={nextPass}
                      onChange={(e) => setNextPass(e.target.value)}
                      placeholder="New passphrase"
                      className="min-h-[38px] rounded-lg border px-3 text-xs"
                      style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-surface)' }}
                    />
                    <button
                      type="submit"
                      className="min-h-[38px] rounded-lg border text-xs font-medium cursor-pointer"
                      style={{ borderColor: 'var(--fv-border)', backgroundColor: 'var(--fv-surface)' }}
                    >
                      Re-Encrypt Vault
                    </button>
                  </div>
                  {passMsg && (
                    <p className="text-xs" style={{ color: 'var(--fv-accent)' }}>
                      {passMsg}
                    </p>
                  )}
                </form>

                <div
                  className="pt-4 border-t flex items-center justify-between gap-3"
                  style={{ borderColor: 'var(--fv-border)' }}
                >
                  <span className="text-xs" style={{ color: 'var(--fv-muted)' }}>
                    Permanently erase local browser vault storage
                  </span>
                  <button
                    type="button"
                    onClick={onRequestWipeVault}
                    className="min-h-[38px] px-3.5 rounded-lg text-xs font-medium cursor-pointer"
                    style={{ backgroundColor: 'var(--fv-danger)', color: '#ffffff' }}
                  >
                    Wipe Local Vault
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
