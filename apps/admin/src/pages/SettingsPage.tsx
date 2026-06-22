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
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
        <p className="text-gray-500">Manage your admin account</p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Account</h3>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-gray-500">Name:</span> {user?.name || 'Admin'}
          </p>
          <p>
            <span className="text-gray-500">Phone:</span> {user?.phone}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 shadow">
        <h3 className="font-semibold text-gray-900 mb-2">Two-Factor Authentication</h3>
        <p className="text-sm text-gray-500 mb-4">
          Require an authenticator app code in addition to your phone OTP when signing in.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : is2faEnabled ? (
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
              ✓ Enabled
            </span>
            <button
              onClick={handleDisable}
              disabled={isSubmitting}
              className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 disabled:opacity-50"
            >
              Disable
            </button>
          </div>
        ) : setupData ? (
          <div>
            <p className="text-sm text-gray-700 mb-3">
              Scan this QR code with Google Authenticator, Authy, or any TOTP app:
            </p>
            <img src={setupData.qrCode} alt="2FA QR code" className="border border-gray-200 rounded-lg mb-3" />
            <p className="text-xs text-gray-500 mb-4">
              Can't scan? Enter this code manually: <code className="bg-gray-100 px-1 rounded">{setupData.secret}</code>
            </p>

            <label className="block mb-2 text-sm font-medium text-gray-700">
              Enter the 6-digit code to confirm
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleConfirmEnable}
                disabled={isSubmitting || code.length !== 6}
                className="px-4 py-2 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {isSubmitting ? 'Verifying...' : 'Confirm & Enable'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 text-sm font-medium rounded-full">
              Not enabled
            </span>
            <button
              onClick={handleStartSetup}
              className="px-4 py-2 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600"
            >
              Enable 2FA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
