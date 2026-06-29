/**
 * AllGO MVP Settings Page
 *
 * MVP scope: account info + two-factor authentication management
 */

import { useState, useEffect } from 'react';
import { adminAuthService } from '../services/auth';
import { useAuthStore } from '../store';

export function SettingsPage() {
  const { user } = useAuthStore();
  const [is2faEnabled, setIs2faEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [setupData, setSetupData] = useState<{ secret: string; qrCode: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const status = await adminAuthService.get2faStatus();
      setIs2faEnabled(status.enabled);
    } catch (error) {
      console.error('Failed to fetch 2FA status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartSetup = async () => {
    setError('');
    try {
      const data = await adminAuthService.setup2fa();
      setSetupData(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleConfirmEnable = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await adminAuthService.enable2fa(code);
      setSetupData(null);
      setCode('');
      setIs2faEnabled(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm('Disable two-factor authentication? Your account will only require an OTP to sign in.')) return;
    setError('');
    setIsSubmitting(true);
    try {
      await adminAuthService.disable2fa();
      setIs2faEnabled(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your admin account</p>
      </div>

      <div className="card p-6">
        <h3 className="mb-4 font-semibold text-slate-900">Account</h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Name</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{user?.name || 'Admin'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Phone</dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">{user?.phone}</dd>
          </div>
        </dl>
      </div>

      <div className="card p-6">
        <h3 className="font-semibold text-slate-900">Two-Factor Authentication</h3>
        <p className="mb-4 mt-1 text-sm text-slate-500">
          Require an authenticator app code in addition to your phone OTP when signing in.
        </p>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
            {error}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : is2faEnabled ? (
          <div className="flex items-center justify-between">
            <span className="badge-green"><span className="badge-dot bg-green-500" /> Enabled</span>
            <button onClick={handleDisable} disabled={isSubmitting} className="btn-danger">
              Disable
            </button>
          </div>
        ) : setupData ? (
          <div>
            <p className="mb-3 text-sm text-slate-600">
              Scan this QR code with Google Authenticator, Authy, or any TOTP app:
            </p>
            <img src={setupData.qrCode} alt="2FA QR code" className="mb-3 rounded-xl ring-1 ring-slate-200" />
            <p className="mb-4 text-xs text-slate-400">
              Can't scan? Enter this code manually: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">{setupData.secret}</code>
            </p>

            <label className="mb-2 block text-sm font-medium text-slate-600">
              Enter the 6-digit code to confirm
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                className="input flex-1 text-center text-lg tracking-[0.4em]"
              />
              <button onClick={handleConfirmEnable} disabled={isSubmitting || code.length !== 6} className="btn-primary shrink-0">
                {isSubmitting ? 'Verifying…' : 'Confirm & Enable'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="badge-amber">Not enabled</span>
            <button onClick={handleStartSetup} className="btn-primary">
              Enable 2FA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
