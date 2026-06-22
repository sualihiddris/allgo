import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminAuthService } from '../services/auth';
import { useAuthStore } from '../store';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const defaultDevPhone = '0200000000';
  
  const [step, setStep] = useState<'phone' | 'otp' | 'totp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [pendingToken, setPendingToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequestOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await adminAuthService.requestOtp(phone);
      setStep('otp');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await adminAuthService.verifyOtp(phone, otp);

      if (result.data.user.role !== 'ADMIN') {
        throw new Error('Admin access required');
      }

      if (result.data.requiresTotp) {
        setPendingToken(result.data.pendingToken);
        setStep('totp');
        return;
      }

      login(result.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyTotp = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await adminAuthService.verify2fa(pendingToken, totpCode);
      login(result.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevLogin = async () => {
    setError('');
    setIsLoading(true);

    try {
      const result = await adminAuthService.devLogin(phone.trim() || defaultDevPhone);
      
      // Extract user correctly from the response
      const userData = result.user || result.data?.user;
      
      if (!userData) {
        throw new Error('User data not found in response');
      }

      if (userData.role !== 'ADMIN') {
        throw new Error('Admin access required');
      }
      
      login(userData);
      
      // Delay navigation slightly to ensure state is updated
      setTimeout(() => {
        navigate('/dashboard');
      }, 100);
    } catch (err) {
      console.error('DevLogin failed:', err);
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">AllGo Admin</h1>
          <p className="text-gray-500 mt-2">
            {step === 'phone'
              ? 'Sign in to your admin account'
              : step === 'otp'
              ? 'Enter verification code'
              : 'Enter your authenticator code'}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleRequestOtp}>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              Phone Number
            </label>
            <div className="flex border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
              <span className="bg-gray-50 px-4 py-3 text-gray-500 border-r border-gray-300">
                +233
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="XX XXX XXXX"
                className="flex-1 px-4 py-3 focus:outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-6 bg-primary-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Sending...' : 'Continue'}
            </button>
            
            {import.meta.env.DEV && (
              <button
                type="button"
                onClick={handleDevLogin}
                disabled={isLoading}
                className="w-full mt-4 bg-gray-100 text-gray-700 border border-gray-300 py-3 px-4 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Dev Login (Skip OTP)
              </button>
            )}
          </form>
        ) : step === 'otp' ? (
          <form onSubmit={handleVerifyOtp}>
            <p className="text-sm text-gray-500 mb-4">
              Code sent to +233 {phone}
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="text-primary-500 ml-2 hover:underline"
              >
                Change
              </button>
            </p>

            <label className="block mb-2 text-sm font-medium text-gray-700">
              Verification Code
            </label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="Enter 6-digit code"
              maxLength={6}
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-center text-2xl tracking-widest"
              required
            />

            <button
              type="submit"
              disabled={isLoading || otp.length !== 6}
              className="w-full mt-6 bg-primary-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyTotp}>
            <label className="block mb-2 text-sm font-medium text-gray-700">
              Authenticator Code
            </label>
            <input
              type="text"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="Enter 6-digit code"
              maxLength={6}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-center text-2xl tracking-widest"
              required
            />

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full mt-6 bg-primary-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
