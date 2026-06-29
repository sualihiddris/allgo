/**
 * AllGO MVP Customers Page
 *
 * Read-only directory of customer accounts - no editing in MVP
 */

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BranchFilterSelect } from '../components';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface Customer {
  id: string;
  name: string;
  phone: string;
  totalTrips: number;
  createdAt: string;
}

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/customers`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('admin_access_token')}`,
        },
        params: branchFilter ? { branchId: branchFilter } : {},
      });
      setCustomers(response.data.customers || []);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setIsLoading(false);
    }
  }, [branchFilter]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  const filteredCustomers = searchQuery
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.phone.includes(searchQuery)
      )
    : customers;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">View customer accounts and trip activity</p>
        </div>
        <div className="flex gap-2">
          <BranchFilterSelect value={branchFilter} onChange={setBranchFilter} />
          <input
            type="search"
            placeholder="Search customers…"
            className="input w-56"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="text-3xl font-bold tracking-tight text-slate-900">{customers.length}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Total Customers</p>
        </div>
        <div className="card p-5">
          <p className="text-3xl font-bold tracking-tight text-primary-600">
            {customers.reduce((sum, c) => sum + c.totalTrips, 0)}
          </p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">Total Trips Booked</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary-500" />
            <span className="text-sm font-medium">Loading customers…</span>
          </div>
        ) : (
          <table className="table-modern">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Joined</th>
                <th>Total Trips</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-16 text-center">
                    <span className="mb-2 block text-4xl">👤</span>
                    <span className="text-sm text-slate-400">
                      {searchQuery ? 'No customers found' : 'No customers registered yet'}
                    </span>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-600">
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="font-semibold text-slate-900">{customer.name}</p>
                      </div>
                    </td>
                    <td className="text-slate-500">{customer.phone}</td>
                    <td className="text-slate-500">{new Date(customer.createdAt).toLocaleDateString()}</td>
                    <td className="font-medium">{customer.totalTrips}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
