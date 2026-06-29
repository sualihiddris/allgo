/**
 * AllGO Admin — Branches Page (Section 4B, super admin only)
 *
 * Create branches, create/deactivate branch admin accounts, reassign
 * drivers between branches.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface Branch {
  id: string;
  name: string;
  region: string;
  driverCount: number;
  adminCount: number;
}

interface BranchAdmin {
  adminId: string;
  userId: string;
  name: string;
  phone: string;
  isActive: boolean;
  branch: { id: string; name: string } | null;
}

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [admins, setAdmins] = useState<BranchAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchRegion, setNewBranchRegion] = useState('');

  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminName, setNewAdminName] = useState('');
  const [newAdminBranchId, setNewAdminBranchId] = useState('');

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('admin_access_token')}` });

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [branchesRes, adminsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/branches`, { headers: authHeader() }),
        axios.get(`${API_BASE_URL}/admin/branch-admins`, { headers: authHeader() }),
      ]);
      setBranches(branchesRes.data.branches || []);
      setAdmins(adminsRes.data.admins || []);
    } catch (err) {
      console.error('Failed to fetch branch data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreateBranch = async () => {
    if (!newBranchName.trim() || !newBranchRegion.trim()) return;
    try {
      await axios.post(
        `${API_BASE_URL}/admin/branches`,
        { name: newBranchName.trim(), region: newBranchRegion.trim() },
        { headers: authHeader() }
      );
      setNewBranchName('');
      setNewBranchRegion('');
      fetchAll();
    } catch (err) {
      console.error('Failed to create branch:', err);
      alert('Failed to create branch.');
    }
  };

  const handleCreateAdmin = async () => {
    if (!newAdminPhone.trim() || !newAdminName.trim() || !newAdminBranchId) return;
    try {
      await axios.post(
        `${API_BASE_URL}/admin/branch-admins`,
        { phone: newAdminPhone.trim(), name: newAdminName.trim(), branchId: newAdminBranchId },
        { headers: authHeader() }
      );
      setNewAdminPhone('');
      setNewAdminName('');
      setNewAdminBranchId('');
      fetchAll();
    } catch (err) {
      console.error('Failed to create branch admin:', err);
      alert('Failed to create branch admin account.');
    }
  };

  const handleDeactivate = async (adminId: string) => {
    if (!confirm('Deactivate this branch admin account? They will be unable to log in.')) return;
    try {
      await axios.post(`${API_BASE_URL}/admin/branch-admins/${adminId}/deactivate`, {}, { headers: authHeader() });
      fetchAll();
    } catch (err) {
      console.error('Failed to deactivate branch admin:', err);
      alert('Failed to deactivate branch admin.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Branches</h1>
        <p className="mt-1 text-sm text-slate-500">Manage branches and branch admin accounts (Section 4B)</p>
      </div>

      {/* Branches */}
      <div className="card p-6">
        <h3 className="mb-4 font-semibold text-slate-900">Branches</h3>
        <div className="mb-5 flex flex-wrap gap-2">
          <input
            placeholder="Branch name (e.g. Kumasi)"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
            className="input flex-1"
          />
          <input
            placeholder="Region (e.g. Ashanti)"
            value={newBranchRegion}
            onChange={(e) => setNewBranchRegion(e.target.value)}
            className="input flex-1"
          />
          <button onClick={handleCreateBranch} className="btn-primary">
            Add Branch
          </button>
        </div>

        {isLoading ? (
          <p className="py-4 text-sm text-slate-400">Loading…</p>
        ) : (
          <table className="table-modern">
            <thead>
              <tr>
                <th>Name</th>
                <th>Region</th>
                <th>Drivers</th>
                <th>Admins</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id}>
                  <td className="font-semibold text-slate-900">{b.name}</td>
                  <td className="text-slate-500">{b.region}</td>
                  <td className="font-medium">{b.driverCount}</td>
                  <td className="font-medium">{b.adminCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Branch Admins */}
      <div className="card p-6">
        <h3 className="mb-4 font-semibold text-slate-900">Branch Admin Accounts</h3>
        <div className="mb-5 flex flex-wrap gap-2">
          <input
            placeholder="Phone (e.g. 0244999888)"
            value={newAdminPhone}
            onChange={(e) => setNewAdminPhone(e.target.value)}
            className="input flex-1"
          />
          <input
            placeholder="Name"
            value={newAdminName}
            onChange={(e) => setNewAdminName(e.target.value)}
            className="input flex-1"
          />
          <select
            value={newAdminBranchId}
            onChange={(e) => setNewAdminBranchId(e.target.value)}
            className="input w-auto cursor-pointer"
          >
            <option value="">Select branch…</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button onClick={handleCreateAdmin} className="btn-primary">
            Add Admin
          </button>
        </div>

        {isLoading ? (
          <p className="py-4 text-sm text-slate-400">Loading…</p>
        ) : admins.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No branch admins yet</p>
        ) : (
          <table className="table-modern">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Branch</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.adminId}>
                  <td className="font-semibold text-slate-900">{a.name}</td>
                  <td className="text-slate-500">{a.phone}</td>
                  <td className="text-slate-500">{a.branch?.name || '—'}</td>
                  <td>
                    <span className={a.isActive ? 'badge-green' : 'badge-slate'}>
                      <span className={`badge-dot ${a.isActive ? 'bg-green-500' : 'bg-slate-400'}`} />
                      {a.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link to={`/audit-log?adminUserId=${a.userId}`} className="btn-secondary btn-sm">
                        View Activity
                      </Link>
                      {a.isActive && (
                        <button onClick={() => handleDeactivate(a.adminId)} className="btn-secondary btn-sm">
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
