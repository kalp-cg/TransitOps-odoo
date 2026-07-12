import React, { useState, useEffect } from 'react';
import { Plus, X, Trash2, Search, Download } from 'lucide-react';
import { api } from '../api';
import useSortableData from '../hooks/useSortableData';
import SortHeader from '../components/SortHeader';
import ExportModal from '../components/ExportModal';
import useExport from '../hooks/useExport';

const ROLES = ['FLEET_MANAGER', 'DISPATCHER', 'DRIVER', 'SAFETY_OFFICER', 'FINANCIAL_ANALYST', 'ADMIN'];

const ROLE_COLORS = {
  FLEET_MANAGER: '#714B67',
  DISPATCHER: '#2B6CB0',
  DRIVER: '#319795',
  SAFETY_OFFICER: '#2F855A',
  FINANCIAL_ANALYST: '#B7791F',
  ADMIN: '#E53E3E',
};

const Modal = ({ title, onClose, children }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 100,
    backgroundColor: 'var(--overlay)',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  }}>
    <div style={{
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '2px', width: '480px', maxHeight: '90vh', overflowY: 'auto'
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 20px', borderBottom: '1px solid var(--border-color)'
      }}>
        <h3 style={{ fontSize: '15px', fontWeight: '600', fontFamily: 'var(--font-title)' }}>{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
          <X size={18} />
        </button>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  </div>
);

const Users = ({ userRole }) => {
  const [users, setUsers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const { sortedItems, sortConfig, requestSort, setSearchQuery, setFilter } = useSortableData(users, { defaultSortKey: 'id', defaultOrder: 'DESC' });

  const [showExportModal, setShowExportModal] = useState(false);
  const USER_COLUMNS = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'created_at', label: 'Created' },
  ];
  const { exportCsv, exportPdf } = useExport({
    title: 'System Users Directory',
    columns: USER_COLUMNS,
    data: sortedItems,
    filename: 'users',
    subtitle: 'User accounts, roles, and access management',
    summaryItems: [
      { label: 'Total Users', value: users.length },
      { label: 'Admins', value: users.filter(u => u.role === 'ADMIN').length },
      { label: 'Fleet Managers', value: users.filter(u => u.role === 'FLEET_MANAGER').length },
      { label: 'Dispatchers', value: users.filter(u => u.role === 'DISPATCHER').length },
    ]
  });

  useEffect(() => { setSearchQuery(search); }, [search]);
  useEffect(() => { setFilter('role', roleFilter); }, [roleFilter, setFilter]);

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'DISPATCHER', driver_id: '' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const load = async () => {
    setLoading(true);
    try {
      const [usersRes, driversRes] = await Promise.all([
        api.getUsers(),
        api.getDrivers()
      ]);
      setUsers(usersRes.users || usersRes);
      setDrivers(driversRes.drivers || driversRes);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      const payload = { 
        name: form.name, 
        email: form.email, 
        role: form.role,
        driver_id: form.role === 'DRIVER' && form.driver_id ? Number(form.driver_id) : null
      };
      if (editing) {
        if (form.password) payload.password = form.password;
        await api.updateUser(editing.id, payload);
      } else {
        payload.password = form.password;
        await api.createUser(payload);
      }
      setShowModal(false);
      setEditing(null);
      setForm({ name: '', email: '', password: '', role: 'DISPATCHER', driver_id: '' });
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete user ${u.name}? This cannot be undone.`)) return;
    try {
      await api.deleteUser(u.id);
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: '', role: u.role, driver_id: u.driver_id || '' });
    setFormError('');
    setShowModal(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', email: '', password: '', role: 'DISPATCHER', driver_id: '' });
    setFormError('');
    setShowModal(true);
  };

  // Fleet Managers cannot see ADMIN users - filter them out in the UI too
  const visibleRoles = (userRole === 'FLEET_MANAGER')
    ? ROLES.filter(r => r !== 'ADMIN')
    : ROLES;

  const roleCounts = visibleRoles.reduce((acc, r) => ({ ...acc, [r]: users.filter(u => u.role === r).length }), {});


  return (
    <div>
      {/* Role Summary Strip */}
      <div className={"grid grid-cols-" + visibleRoles.length} style={{ marginBottom: '16px' }}>
        {visibleRoles.map(role => (
          <div key={role} className="card" style={{ padding: '12px 14px', borderLeft: `3px solid ${ROLE_COLORS[role]}` }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
              {role.replace(/_/g, ' ')}
            </div>
            <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-title)', color: ROLE_COLORS[role] }}>
              {roleCounts[role] ?? 0}
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, email…"
            style={{ paddingLeft: '32px' }}
          />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ width: '180px' }}>
          <option value="">All Roles</option>
          {visibleRoles.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>
          <Download size={14} /> Export
        </button>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={14} /> Create User
        </button>
      </div>

      {error && <div style={{ color: 'var(--error-text)', marginBottom: '8px' }}>{error}</div>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <SortHeader label="#" sortKey="id" sortConfig={sortConfig} onSort={requestSort} />
              <SortHeader label="Name" sortKey="name" sortConfig={sortConfig} onSort={requestSort} />
              <SortHeader label="Email" sortKey="email" sortConfig={sortConfig} onSort={requestSort} />
              <SortHeader label="Role" sortKey="role" sortConfig={sortConfig} onSort={requestSort} />
              <SortHeader label="Created" sortKey="created_at" sortConfig={sortConfig} onSort={requestSort} />
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</td></tr>}
            {!loading && sortedItems.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No users found.</td></tr>
            )}
              {sortedItems.map(u => {
                const linkedDriver = drivers.find(d => d.id === u.driver_id);
                return (
                  <tr key={u.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{u.id}</td>
                    <td style={{ fontWeight: '500' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '28px', height: '28px', borderRadius: '2px',
                          backgroundColor: ROLE_COLORS[u.role] || 'var(--primary-color)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontWeight: '700', fontSize: '12px', flexShrink: 0
                        }}>
                          {u.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div>{u.name}</div>
                          {linkedDriver && (
                            <div style={{ fontSize: '10px', color: 'var(--role-driver)', fontWeight: '400', marginTop: '2px' }}>
                              Linked: {linkedDriver.name} ({linkedDriver.license_number})
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{u.email}</td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '3px 8px', fontSize: '11px', fontWeight: '600',
                        borderRadius: '2px', textTransform: 'uppercase', letterSpacing: '0.3px',
                        backgroundColor: `${ROLE_COLORS[u.role]}22`,
                        color: ROLE_COLORS[u.role],
                        border: `1px solid ${ROLE_COLORS[u.role]}44`
                      }}>
                        {u.role?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => openEdit(u)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={() => handleDelete(u)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <Modal title={editing ? `Edit User: ${editing.name}` : 'Create New User'} onClose={() => setShowModal(false)}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="grid grid-cols-2">
              <div>
                <label>Full Name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>
              <div>
                <label>Email *</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-2">
              <div>
                <label>{editing ? 'New Password (leave blank to keep)' : 'Password *'}</label>
                <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required={!editing} />
              </div>
              <div>
                <label>Role *</label>
                <select value={form.role} onChange={e => set('role', e.target.value)}>
                  {visibleRoles.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </div>
  
            {/* If DRIVER role, allow linking to driver profile */}
            {form.role === 'DRIVER' && (
              <div>
                <label>Link to Driver Profile *</label>
                <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)} required>
                  <option value="">-- Select Driver --</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.license_number})</option>
                  ))}
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Links this user login to a physical driver registry profile.
                </div>
              </div>
            )}
  
            {/* Role preview chip */}
            {form.role && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px', borderRadius: '2px',
                backgroundColor: `${ROLE_COLORS[form.role]}18`,
                border: `1px solid ${ROLE_COLORS[form.role]}44`
              }}>
                <div style={{
                  width: '10px', height: '10px', borderRadius: '2px',
                  backgroundColor: ROLE_COLORS[form.role]
                }} />
                <span style={{ fontSize: '12px', fontWeight: '500', color: ROLE_COLORS[form.role] }}>
                  {form.role.replace(/_/g, ' ')}
                </span>
              </div>
            )}
            {formError && <div style={{ color: 'var(--error-text)', fontSize: '13px' }}>{formError}</div>}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={formLoading}>
                {formLoading ? 'Saving...' : editing ? 'Update User' : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        onCsv={exportCsv}
        onPdf={exportPdf}
        title="Users"
        rowCount={sortedItems.length}
      />
    </div>
  );
};

export default Users;
