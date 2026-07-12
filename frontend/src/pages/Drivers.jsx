import React, { useState, useEffect } from 'react';
import { Plus, Search, X, Edit2, ShieldAlert, ShieldOff, Check, Download } from 'lucide-react';
import { api } from '../api';
import useSortableData from '../hooks/useSortableData';
import SortHeader from '../components/SortHeader';
import ExportModal from '../components/ExportModal';
import useExport from '../hooks/useExport';

const licenseClass = (status) => {
  const m = { VALID: 'available', EXPIRING_SOON: 'inshop', EXPIRED: 'suspended' };
  return `badge badge-${m[status] || ''}`;
};

const Modal = ({ title, onClose, children }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 100,
    backgroundColor: 'var(--overlay)',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  }}>
    <div style={{
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '2px', width: '520px', maxHeight: '90vh', overflowY: 'auto'
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

const DriverForm = ({ initial = {}, onSave, onClose }) => {
  const [form, setForm] = useState({
    name: initial.name || '',
    email: initial.email || '',
    contact_number: initial.contact_number || '',
    license_number: initial.license_number || '',
    license_category: initial.license_category || 'Heavy Commercial',
    license_expiry_date: initial.license_expiry_date ? initial.license_expiry_date.slice(0, 10) : '',
    safety_score: initial.safety_score ?? 100,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await onSave({
        ...form,
        safety_score: Number(form.safety_score)
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="grid grid-cols-2">
        <div>
          <label>Full Name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} required />
        </div>
        <div>
          <label>License Category *</label>
          <select value={form.license_category} onChange={e => set('license_category', e.target.value)}>
            {['Heavy Commercial', 'Light Commercial', 'Medium Commercial'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2">
        <div>
          <label>Contact Number *</label>
          <input value={form.contact_number} onChange={e => set('contact_number', e.target.value)} required />
        </div>
        <div>
          <label>License Number *</label>
          <input value={form.license_number} onChange={e => set('license_number', e.target.value)} required />
        </div>
      </div>
      <div className="grid grid-cols-2">
        <div>
          <label>License Expiry *</label>
          <input type="date" value={form.license_expiry_date} onChange={e => set('license_expiry_date', e.target.value)} required />
        </div>
        <div>
          <label>Safety Score (0–100)</label>
          <input type="number" value={form.safety_score} onChange={e => set('safety_score', Number(e.target.value))} min={0} max={100} />
        </div>
      </div>
      {error && <div style={{ color: 'var(--error-text)', fontSize: '13px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save Driver'}
        </button>
      </div>
    </form>
  );
};

const SafetyScoreBar = ({ score }) => {
  const color = score >= 80 ? 'var(--success-color)' : score >= 60 ? 'var(--warning-color)' : 'var(--error-color)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        flex: 1, height: '6px', backgroundColor: 'var(--border-color)',
        borderRadius: '2px', overflow: 'hidden'
      }}>
        <div style={{
          width: `${score}%`, height: '100%',
          backgroundColor: color,
          transition: 'width 0.4s ease'
        }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: '600', color, minWidth: '36px', textAlign: 'right' }}>{score}</span>
    </div>
  );
};

const Drivers = ({ userRole }) => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [licenseFilter, setLicenseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [scoreEdit, setScoreEdit] = useState({ show: false, id: null, score: 100 });

  const isAdmin = userRole === 'ADMIN';
  const isFleetManager = userRole === 'FLEET_MANAGER' || isAdmin;
  const isSafetyOfficer = userRole === 'SAFETY_OFFICER' || isAdmin;
  const canAddOrDelete = isFleetManager;
  const canEditDetails = isFleetManager || isSafetyOfficer;
  const canScoreOrSuspend = isSafetyOfficer || isFleetManager;
  const isReadOnly = !isFleetManager && !isSafetyOfficer;

  const { sortedItems, sortConfig, requestSort, setSearchQuery, setFilter } = useSortableData(drivers, { defaultSortKey: 'id', defaultOrder: 'DESC' });

  const [showExportModal, setShowExportModal] = useState(false);
  const DRIVER_COLUMNS = [
    { key: 'name', label: 'Name' },
    { key: 'license_number', label: 'License Number' },
    { key: 'license_category', label: 'Category' },
    { key: 'license_expiry_date', label: 'License Expiry' },
    { key: 'license_validity', label: 'License Status' },
    { key: 'safety_score', label: 'Safety Score' },
    { key: 'status', label: 'Status' },
  ];
  const avgSafety = drivers.length > 0
    ? Math.round(drivers.reduce((s, d) => s + (d.safety_score || 0), 0) / drivers.length)
    : 0;

  const expiredCount = drivers.filter(d => d.license_validity === 'EXPIRED').length;
  const expiringCount = drivers.filter(d => d.license_validity === 'EXPIRING_SOON').length;
  const suspendedCount = drivers.filter(d => d.status === 'SUSPENDED').length;

  const { exportCsv, exportPdf } = useExport({
    title: 'Driver Roster & Compliance Report',
    columns: DRIVER_COLUMNS,
    data: sortedItems,
    filename: 'drivers',
    subtitle: 'Driver license status, safety scores, and compliance overview',
    summaryItems: [
      { label: 'Total Drivers', value: drivers.length },
      { label: 'Active', value: drivers.filter(d => d.status === 'AVAILABLE').length },
      { label: 'Avg Safety Score', value: `${avgSafety}/100` },
      { label: 'Suspended', value: suspendedCount },
    ]
  });

  useEffect(() => { setSearchQuery(search); }, [search]);
  useEffect(() => { setFilter('status', statusFilter); }, [statusFilter, setFilter]);
  useEffect(() => { setFilter('license_category', categoryFilter); }, [categoryFilter, setFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (licenseFilter) params.validity = licenseFilter;
      const res = await api.getDrivers(params);
      setDrivers(res.drivers || res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [licenseFilter]);

  const CATEGORY_OPTIONS = ['Heavy Commercial', 'Light Commercial', 'Medium Commercial'];

  const handleSuspend = async (d) => {
    try {
      if (d.status === 'SUSPENDED') {
        await api.unsuspendDriver(d.id);
      } else {
        await api.suspendDriver(d.id);
      }
      setSelected(null);
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleScoreSave = async () => {
    try {
      await api.updateSafetyScore(scoreEdit.id, scoreEdit.score);
      setScoreEdit({ show: false, id: null, score: 100 });
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleDelete = async (d) => {
    if (!window.confirm(`Delete driver ${d.name}? This cannot be undone.`)) return;
    try {
      await api.deleteDriver(d.id);
      setSelected(null);
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div>
      {/* Read-Only Alert for other roles */}
      {isReadOnly && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', backgroundColor: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)', borderRadius: '2px',
          color: 'var(--accent-color)', fontSize: '13px', marginBottom: '16px'
        }}>
          <ShieldAlert size={15} />
          <strong>Read-Only View:</strong> Your role ({userRole?.replace(/_/g, ' ')}) has view-only access to driver records.
        </div>
      )}

      {/* Alert Strip */}
      {(expiredCount > 0 || expiringCount > 0) && (
        <div style={{
          display: 'flex', gap: '12px', marginBottom: '16px'
        }}>
          {expiredCount > 0 && (
            <div style={{
              flex: 1, padding: '12px 16px',
              backgroundColor: 'var(--error-bg-soft)', border: '1px solid var(--error-border)',
              borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '10px'
            }}>
              <ShieldOff size={16} color="var(--error-text)" />
              <span style={{ color: 'var(--error-text)', fontSize: '13px', fontWeight: '500' }}>
                {expiredCount} driver{expiredCount > 1 ? 's' : ''} with EXPIRED license
              </span>
            </div>
          )}
          {expiringCount > 0 && (
            <div style={{
              flex: 1, padding: '12px 16px',
              backgroundColor: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
              borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '10px'
            }}>
              <ShieldAlert size={16} color="var(--warning-text)" />
              <span style={{ color: 'var(--warning-text)', fontSize: '13px', fontWeight: '500' }}>
                {expiringCount} driver{expiringCount > 1 ? 's' : ''} with license expiring soon
              </span>
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, license, contact…"
            style={{ paddingLeft: '32px' }}
          />
        </div>
         <select value={licenseFilter} onChange={e => setLicenseFilter(e.target.value)} style={{ width: '180px' }}>
          <option value="">All License Statuses</option>
          <option value="VALID">Valid</option>
          <option value="EXPIRING_SOON">Expiring Soon</option>
          <option value="EXPIRED">Expired</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: '150px' }}>
          <option value="">All Statuses</option>
          <option value="AVAILABLE">Available</option>
          <option value="ON_TRIP">On Trip</option>
          <option value="OFF_DUTY">Off Duty</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{ width: '180px' }}>
          <option value="">All Categories</option>
          {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {canAddOrDelete && (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
            <Plus size={14} /> Add Driver
          </button>
        )}
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-4" style={{ marginBottom: '16px' }}>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Total Drivers</div>
          <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-title)' }}>{drivers.length}</div>
        </div>
        <div className="card" style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => setLicenseFilter('EXPIRED')}>
          <div style={{ fontSize: '11px', color: 'var(--error-text)', textTransform: 'uppercase', marginBottom: '4px' }}>Expired License</div>
          <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-title)', color: 'var(--error-text)' }}>{expiredCount}</div>
        </div>
        <div className="card" style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => setLicenseFilter('EXPIRING_SOON')}>
          <div style={{ fontSize: '11px', color: 'var(--warning-text)', textTransform: 'uppercase', marginBottom: '4px' }}>Expiring Soon</div>
          <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-title)', color: 'var(--warning-text)' }}>{expiringCount}</div>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--error-text)', textTransform: 'uppercase', marginBottom: '4px' }}>Suspended</div>
          <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-title)', color: 'var(--error-text)' }}>{suspendedCount}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        {/* Driver Table */}
        <div style={{ flex: 1 }}>
          {error && <div style={{ color: 'var(--error-text)', marginBottom: '8px' }}>{error}</div>}
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <SortHeader label="Name" sortKey="name" sortConfig={sortConfig} onSort={requestSort} />
                  <SortHeader label="License #" sortKey="license_number" sortConfig={sortConfig} onSort={requestSort} />
                  <SortHeader label="Category" sortKey="license_category" sortConfig={sortConfig} onSort={requestSort} />
                  <th>Expiry</th>
                  <th>License Status</th>
                  <SortHeader label="Safety Score" sortKey="safety_score" sortConfig={sortConfig} onSort={requestSort} />
                  <SortHeader label="Status" sortKey="status" sortConfig={sortConfig} onSort={requestSort} />
                  {canEditDetails && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={canEditDetails ? 8 : 7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</td></tr>}
                {!loading && sortedItems.length === 0 && (
                  <tr><td colSpan={canEditDetails ? 8 : 7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No drivers found.</td></tr>
                )}
                {sortedItems.map(d => (
                  <tr key={d.id} onClick={() => setSelected(d)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontWeight: '500' }}>{d.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{d.license_number}</td>
                    <td style={{ fontSize: '12px' }}>{d.license_category}</td>
                    <td style={{ fontSize: '12px' }}>{d.license_expiry_date ? new Date(d.license_expiry_date).toLocaleDateString() : '—'}</td>
                    <td>
                      <span className={licenseClass(d.license_validity)}>{d.license_validity?.replace('_', ' ')}</span>
                    </td>
                    <td style={{ width: '140px' }}>
                      <SafetyScoreBar score={d.safety_score ?? 100} />
                    </td>
                    <td>
                      <span className={d.status === 'SUSPENDED' ? 'badge badge-suspended' : 'badge badge-active'}>
                        {d.status}
                      </span>
                    </td>
                    {canEditDetails && (
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={e => { e.stopPropagation(); setEditing(d); setShowModal(true); }}
                        >
                          <Edit2 size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="card" style={{ width: '260px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '15px' }}>{selected.name}</h3>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>
            <SafetyScoreBar score={selected.safety_score ?? 100} />
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 4px', fontSize: '12px', marginTop: '12px' }}>
              {[
                ['Status', selected.status],
                ['License Cat', selected.license_category],
                ['License Val', selected.license_validity?.replace('_', ' ')],
                ['License No', selected.license_number],
                ['Contact', selected.contact_number || '—'],
              ].map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
                  <dd style={{ color: 'var(--text-main)', fontWeight: '500', textAlign: 'right' }}>{v}</dd>
                </React.Fragment>
              ))}
            </dl>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
              {canScoreOrSuspend && (
                <button
                  className={selected.status === 'SUSPENDED' ? 'btn btn-secondary' : 'btn btn-danger'}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => handleSuspend(selected)}
                >
                  {selected.status === 'SUSPENDED' ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={12} /> Unsuspend Driver
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <ShieldAlert size={12} /> Suspend Driver
                    </span>
                  )}
                </button>
              )}
              {canScoreOrSuspend && (
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%' }}
                  onClick={() => setScoreEdit({ show: true, id: selected.id, score: selected.safety_score ?? 100 })}
                >
                  Update Safety Score
                </button>
              )}
              {canEditDetails && (
                <button className="btn btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} onClick={() => { setEditing(selected); setShowModal(true); }}>
                  <Edit2 size={12} /> Edit Driver Details
                </button>
              )}
        <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>
          <Download size={14} /> Export
        </button>
        {canAddOrDelete && (
                <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => handleDelete(selected)}>
                  Delete Driver Profile
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <Modal
          title={editing ? `Edit ${editing.name}` : 'Add New Driver'}
          onClose={() => { setShowModal(false); setEditing(null); }}
        >
          <DriverForm
            initial={editing || {}}
            onSave={async (data) => {
              if (editing) await api.updateDriver(editing.id, data);
              else await api.createDriver(data);
              await load();
            }}
            onClose={() => { setShowModal(false); setEditing(null); }}
          />
        </Modal>
      )}

      {/* Safety Score Modal */}
      {scoreEdit.show && (
        <Modal title="Update Safety Score" onClose={() => setScoreEdit({ show: false, id: null, score: 100 })}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label>Safety Score (0–100)</label>
              <input
                type="number"
                value={scoreEdit.score}
                onChange={e => setScoreEdit(s => ({ ...s, score: Number(e.target.value) }))}
                min={0} max={100}
              />
            </div>
            <SafetyScoreBar score={scoreEdit.score} />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setScoreEdit({ show: false, id: null, score: 100 })}>Cancel</button>
              <button className="btn btn-primary" onClick={handleScoreSave}>Save Score</button>
            </div>
          </div>
        </Modal>
      )}

      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        onCsv={exportCsv}
        onPdf={exportPdf}
        title="Drivers"
        rowCount={sortedItems.length}
      />
    </div>
  );
};

export default Drivers;
