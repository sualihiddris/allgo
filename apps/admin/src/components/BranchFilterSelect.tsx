/**
 * Branch filter for the Drivers/Subscriptions/Customers/Deliveries admin
 * pages (Section 4B). Only rendered for super admins - a branch admin is
 * always scoped to their own branch server-side, with nothing to pick.
 */

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuthStore } from '../store';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface Branch {
  id: string;
  name: string;
}

interface BranchFilterSelectProps {
  value: string;
  onChange: (branchId: string) => void;
}

export function BranchFilterSelect({ value, onChange }: BranchFilterSelectProps) {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.admin?.role === 'SUPER_ADMIN';
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    axios
      .get(`${API_BASE_URL}/admin/branches`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('admin_access_token')}` },
      })
      .then(({ data }) => setBranches(data.branches || []))
      .catch((err) => console.error('Failed to fetch branches for filter:', err));
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return null;

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-gray-300 rounded-lg px-4 py-2 text-sm"
    >
      <option value="">All Branches</option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
    </select>
  );
}
