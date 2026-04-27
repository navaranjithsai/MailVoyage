import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound, RefreshCcw, Shield, ShieldCheck, ShieldOff, Copy, Eye, EyeOff, Download } from 'lucide-react';
import Button from '@/components/ui/Button';
import { apiFetch } from '@/lib/apiFetch';
import { toast } from '@/lib/toast';

interface TwoFactorStatus {
  enabled: boolean;
  hasSetup: boolean;
  method: 'totp' | null;
}

interface TwoFactorSetupInitResponse {
  setupToken: string;
  otpauthUrl: string;
  manualKey: string;
  qrDataUrl: string | null;
  expiresAt: string;
}

interface TwoFactorSetupVerifyResponse {
  enabled: boolean;
  message: string;
  recoveryCodes: string[];
  generatedAt: string;
}

interface TwoFactorRecoveryResponse {
  recoveryCodes: string[];
  generatedAt: string;
}

type SensitiveAction = 'reconfigure' | 'disable' | 'regenerate' | null;

const TwoFactorSettings: React.FC = () => {
  const [status, setStatus] = useState<TwoFactorStatus>({ enabled: false, hasSetup: false, method: null });
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupData, setSetupData] = useState<TwoFactorSetupInitResponse | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<SensitiveAction>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);

  const formattedExpiry = useMemo(() => {
    if (!setupData?.expiresAt) return '';
    return new Date(setupData.expiresAt).toLocaleString();
  }, [setupData]);

  const refreshStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const response = await apiFetch('/api/auth/2fa/status') as TwoFactorStatus;
      setStatus(response);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load 2FA status.');
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard.`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}.`);
    }
  };

  const downloadRecoveryCodes = () => {
    if (recoveryCodes.length === 0) return;

    try {
      const dateSuffix = new Date().toISOString().slice(0, 10);
      const content = [
        'MailVoyage Two-Factor Recovery Codes',
        'Each code can be used only once.',
        '',
        ...recoveryCodes,
      ].join('\n');

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mailvoyage-recovery-codes-${dateSuffix}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(url);

      toast.success('Recovery codes downloaded.');
    } catch {
      toast.error('Unable to download recovery codes.');
    }
  };

  const startSetup = async (password?: string) => {
    setIsSubmitting(true);
    try {
      const response = await apiFetch('/api/auth/2fa/setup/init', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: password || undefined }),
      }) as TwoFactorSetupInitResponse;

      setSetupData(response);
      setSetupCode('');
      setRecoveryCodes([]);
      if (!response.qrDataUrl) {
        toast.info('QR code is unavailable. Use the manual key in your authenticator app.');
      }
      toast.success('2FA setup started. Add the key to your authenticator app.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unable to start 2FA setup.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifySetup = async () => {
    if (!setupData) return;

    const code = setupCode.trim();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Authenticator code must be 6 digits.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch('/api/auth/2fa/setup/verify', {
        method: 'POST',
        body: JSON.stringify({
          setupToken: setupData.setupToken,
          code,
        }),
      }) as TwoFactorSetupVerifyResponse;

      setRecoveryCodes(response.recoveryCodes || []);
      setSetupData(null);
      setSetupCode('');
      await refreshStatus();
      toast.success(response.message || 'Two-factor authentication enabled.');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unable to verify setup code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openSensitiveAction = (action: Exclude<SensitiveAction, null>) => {
    setPendingAction(action);
    setCurrentPassword('');
    setShowCurrentPassword(false);
  };

  const closeSensitiveAction = () => {
    setPendingAction(null);
    setCurrentPassword('');
    setShowCurrentPassword(false);
  };

  const executeSensitiveAction = async () => {
    if (!pendingAction) return;

    if (!currentPassword.trim()) {
      toast.error('Current password is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (pendingAction === 'disable') {
        await apiFetch('/api/auth/2fa/disable', {
          method: 'POST',
          body: JSON.stringify({ currentPassword }),
        });
        setSetupData(null);
        setRecoveryCodes([]);
        toast.success('Two-factor authentication disabled.');
      } else if (pendingAction === 'regenerate') {
        const response = await apiFetch('/api/auth/2fa/recovery/regenerate', {
          method: 'POST',
          body: JSON.stringify({ currentPassword }),
        }) as TwoFactorRecoveryResponse;
        setRecoveryCodes(response.recoveryCodes || []);
        toast.success('Recovery codes regenerated. Save them now.');
      } else if (pendingAction === 'reconfigure') {
        await startSetup(currentPassword);
      }

      closeSensitiveAction();
      await refreshStatus();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sensitiveActionTitle = pendingAction === 'disable'
    ? 'Disable Two-Factor Authentication'
    : pendingAction === 'reconfigure'
      ? 'Reconfigure Authenticator Setup'
      : 'Regenerate Recovery Codes';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
        <div>
          <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Two-Factor Authentication
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Protect your account with an authenticator app, fallback OTP, and recovery codes.
          </p>
        </div>
        {isLoadingStatus ? (
          <span className="text-sm text-gray-500">Checking...</span>
        ) : status.enabled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 px-3 py-1 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" /> Enabled
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-3 py-1 text-xs font-semibold">
            <ShieldOff className="w-3.5 h-3.5" /> Disabled
          </span>
        )}
      </div>

      {!status.enabled && !setupData && (
        <div className="flex items-center gap-3">
          <Button onClick={() => void startSetup()} disabled={isSubmitting} className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Enable 2FA
          </Button>
        </div>
      )}

      {status.enabled && !setupData && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => openSensitiveAction('reconfigure')}
            className="flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            Reconfigure Authenticator
          </Button>
          <Button
            variant="outline"
            onClick={() => openSensitiveAction('regenerate')}
            className="flex items-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            Regenerate Recovery Codes
          </Button>
          <Button
            variant="outline"
            onClick={() => openSensitiveAction('disable')}
            className="text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
          >
            <ShieldOff className="w-4 h-4" />
            Disable 2FA
          </Button>
        </div>
      )}

      {setupData && (
        <div className="space-y-4 rounded-lg border border-blue-200 dark:border-blue-800 p-4 bg-blue-50/60 dark:bg-blue-900/20">
          <div>
            <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200">Authenticator Setup</h4>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
              Add this key in your authenticator app and verify with a 6-digit code.
            </p>
          </div>

          <div className="rounded-md bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-700 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Scan QR code</p>
            {setupData.qrDataUrl ? (
              <div className="flex justify-center">
                <img
                  src={setupData.qrDataUrl}
                  alt="MailVoyage two-factor QR code"
                  className="w-52 h-52 rounded border border-gray-200 dark:border-gray-700 bg-white p-2"
                />
              </div>
            ) : (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                QR code not available. You can still complete setup using the manual key below.
              </p>
            )}

            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                size="small"
                variant="outline"
                onClick={() => void copyText(setupData.otpauthUrl, 'OTPAuth URL')}
                className="flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy OTP URI
              </Button>
            </div>
          </div>

          <div className="rounded-md bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-700 p-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Manual setup key</p>
            <div className="flex items-center justify-between gap-2">
              <code className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">{setupData.manualKey}</code>
              <Button
                type="button"
                size="small"
                variant="outline"
                onClick={() => void copyText(setupData.manualKey, 'Manual key')}
                className="flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </Button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Expires at: {formattedExpiry}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" htmlFor="two-factor-setup-code">
              Verification Code
            </label>
            <input
              id="two-factor-setup-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={setupCode}
              onChange={(event) => setSetupCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="mt-1 block w-full border h-11 rounded-md shadow-sm focus:ring focus:ring-blue-500 border-gray-300 dark:border-gray-600 dark:text-gray-300 px-3 tracking-[0.25em]"
              placeholder="123456"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void verifySetup()} disabled={isSubmitting} className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Verify and Enable
            </Button>
            <Button
              variant="outline"
              onClick={() => setSetupData(null)}
              disabled={isSubmitting}
            >
              Cancel Setup
            </Button>
          </div>
        </div>
      )}

      {recoveryCodes.length > 0 && (
        <div className="space-y-3 rounded-lg border border-amber-200 dark:border-amber-700 p-4 bg-amber-50/70 dark:bg-amber-900/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Recovery Codes</h4>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Save these now. Each code works once and will not be shown again.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="small"
                variant="outline"
                onClick={() => void copyText(recoveryCodes.join('\n'), 'Recovery codes')}
                className="flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy All
              </Button>
              <Button
                type="button"
                size="small"
                variant="outline"
                onClick={downloadRecoveryCodes}
                className="flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {recoveryCodes.map((code) => (
              <code
                key={code}
                className="rounded border border-amber-200 dark:border-amber-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100"
              >
                {code}
              </code>
            ))}
          </div>
        </div>
      )}

      {pendingAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-full max-w-md p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">{sensitiveActionTitle}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
              Enter your current password to continue.
            </p>

            <div className="mt-4 relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                placeholder="Current password"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((value) => !value)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 dark:text-gray-300 bg-transparent"
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={closeSensitiveAction} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={() => void executeSensitiveAction()} disabled={isSubmitting}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default TwoFactorSettings;
