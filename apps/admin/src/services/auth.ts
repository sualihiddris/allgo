const API_BASE_URL = '/api/v1';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AdminUser {
  id: string;
  phone: string;
  name: string | null;
  role: string;
  admin?: {
    totpEnabled: boolean;
    role: 'BRANCH_ADMIN' | 'SUPER_ADMIN';
    branchId: string | null;
  };
}

class AdminAuthService {
  private accessToken: string | null = null;

  constructor() {
    this.accessToken = localStorage.getItem('admin_access_token');
  }

  async requestOtp(phone: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/auth/otp/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to send OTP');
    }

    return response.json();
  }

  async verifyOtp(phone: string, code: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Invalid OTP');
    }

    const data = await response.json();
    // Admins with TOTP enabled get a pendingToken instead of real tokens -
    // see verify2fa() for the second step
    if (!data.data.requiresTotp) {
      this.setTokens(data.data.tokens);
    }
    return data;
  }

  /**
   * Second step of admin login when verifyOtp() returns requiresTotp: true
   */
  async verify2fa(pendingToken: string, code: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/auth/2fa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingToken, code }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Invalid authenticator code');
    }

    const data = await response.json();
    this.setTokens(data.data.tokens);
    return data;
  }

  async setup2fa(): Promise<{ secret: string; qrCode: string }> {
    const response = await this.authenticatedFetch(`${API_BASE_URL}/admin/2fa/setup`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to set up 2FA');
    return response.json();
  }

  async enable2fa(code: string): Promise<void> {
    const response = await this.authenticatedFetch(`${API_BASE_URL}/admin/2fa/enable`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Invalid authenticator code');
    }
  }

  async disable2fa(): Promise<void> {
    const response = await this.authenticatedFetch(`${API_BASE_URL}/admin/2fa/disable`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to disable 2FA');
  }

  async get2faStatus(): Promise<{ enabled: boolean }> {
    const response = await this.authenticatedFetch(`${API_BASE_URL}/admin/2fa/status`);
    if (!response.ok) throw new Error('Failed to get 2FA status');
    return response.json();
  }

  async refreshTokens(): Promise<boolean> {
    try {
      const refreshToken = localStorage.getItem('admin_refresh_token');
      if (!refreshToken) return false;

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        this.clearTokens();
        return false;
      }

      const data = await response.json();
      this.setTokens(data.data);
      return true;
    } catch {
      return false;
    }
  }

  async getMe(): Promise<AdminUser | null> {
    try {
      const response = await this.authenticatedFetch(`${API_BASE_URL}/auth/me`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.data;
    } catch {
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      const refreshToken = localStorage.getItem('admin_refresh_token');
      if (refreshToken) {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } finally {
      this.clearTokens();
    }
  }

  async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }

    let response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
            ...options.headers,
          },
        });
      }
    }

    return response;
  }

  private setTokens(tokens: AuthTokens): void {
    this.accessToken = tokens.accessToken;
    localStorage.setItem('admin_access_token', tokens.accessToken);
    localStorage.setItem('admin_refresh_token', tokens.refreshToken);
  }

  private clearTokens(): void {
    this.accessToken = null;
    localStorage.removeItem('admin_access_token');
    localStorage.removeItem('admin_refresh_token');
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  /**
   * Dev-only: Login without OTP
   */
  async devLogin(phone: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/auth/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, role: 'ADMIN' }),
    });

    if (!response.ok) {
      try {
        const error = await response.json();
        throw new Error(error.error?.message || 'Dev login failed');
      } catch (_) {
        // Response body was empty or not JSON
        throw new Error('Dev login failed');
      }
    }

    const data = await response.json();
    this.setTokens(data.data.tokens);
    return data;
  }
}

export const adminAuthService = new AdminAuthService();
