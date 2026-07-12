import React, { useState, useEffect } from 'react';
import { Plus, X, Check, Search, Download } from 'lucide-react';
import { api } from '../api';
import useSortableData from '../hooks/useSortableData';
import SortHeader from '../components/SortHeader';
import ExportModal from '../components/ExportModal';
import useExport from '../hooks/useExport';

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

const MAINTENANCE_TYPES = [
  'Engine Overhaul',
  'Brake Service',
  'Tyre Rotation',
  'Oil Change',
  'AC Compressor',
  'Electrical Fault',
  'Suspension Repair',
  'Clutch Replacement',
  'Body Dent Repair',
  'Inspection',
  'Other'
];

const Maintenance = ({ userRole }) => {
  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [completing, setCompleting] = useState(null);

  const canManage = ['FLEET_MANAGER', 'DISPATCHER', 'ADMIN'].includes(userRole);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');

  const { sortedItems, sortConfig, requestSort, setSearchQuery, setFilter } = useSortableData(records, { defaultSortKey: 'start_date', defaultOrder: 'DESC' });

  const [showExportModal, setShowExportModal] = useState(false);
  const MAINT_COLUMNS = [
    { key: 'id', label: 'Work Order' },
    { key: 'vehicle_reg', label: 'Vehicle' },
    { key: 'maintenance_type', label: 'Type' },
    { key: 'description', label: 'Description' },
    { key: 'maintenance_cost', label: 'Cost' },
    { key: 'start_date', label: 'Start Date' },
    { key: 'end_date', label: 'End Date' },
    { key: 'status', label: 'Status' },
  ];
  const openCount = records.filter(r => r.status === 'ACTIVE').length;
  const closedCount = records.filter(r => r.status === 'COMPLETED').length;

  const { exportCsv, exportPdf } = useExport({
    title: 'Maintenance Work Orders',
    columns: MAINT_COLUMNS,
    data: sortedItems,
    filename: 'maintenance_logs',
    subtitle: 'Vehicle maintenance history, costs, and work order tracking',
    summaryItems: [
      { label: 'Total Records', value: records.length },
      { label: 'Open (In Shop)', value: openCount },
      { label: 'Completed', value: closedCount },
      { label: 'Total Cost', value: `\u20B9${records.reduce((s, r) => s + Number(r.maintenance_cost || 0), 0).toLocaleString('en-IN')}` },
    ]
  });

  useEffect(() => { setSearchQuery(search); }, [search]);
  useEffect(() => { setFilter('status', statusFilter); }, [statusFilter, setFilter]);
  useEffect(() => { setFilter('vehicle_id', vehicleFilter); }, [vehicleFilter, setFilter]);

  const [form, setForm] = useState({
    vehicle_id: '',
    maintenance_type: 'Oil Change',
    description: '',
    start_date: new Date().toISOString().slice(0, 10),
    maintenance_cost: ''
  });
  const [completeForm, setCompleteForm] = useState({
    end_date: new Date().toISOString().slice(0, 10),
    maintenance_cost: ''
  });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setComp = (k, v) => setCompleteForm(f => ({ ...f, [k]: v }));

  const load = async () => {
    setLoading(true);
    try {
      const [mRes, vRes] = await Promise.all([api.getMaintenance(), api.getVehicles()]);
      setRecords(mRes.maintenance || mRes);
      setVehicles(vRes.vehicles || vRes);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      await api.createMaintenance({
        vehicle_id: Number(form.vehicle_id),
        maintenance_type: form.maintenance_type,
        description: form.description,
        start_date: form.start_date,
        maintenance_cost: form.maintenance_cost ? Number(form.maintenance_cost) : 0.0,
      });
      setShowCreate(false);
      setForm({
        vehicle_id: '',
        maintenance_type: 'Oil Change',
        description: '',
        start_date: new Date().toISOString().slice(0, 10),
        maintenance_cost: ''
      });
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleComplete = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    try {
      await api.completeMaintenance(completing.id, {
        end_date: completeForm.end_date,
        maintenance_cost: completeForm.maintenance_cost ? Number(completeForm.maintenance_cost) : undefined,
      });
      setCompleting(null);
      setCompleteForm({
        end_date: new Date().toISOString().slice(0, 10),
        maintenance_cost: ''
      });
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div>
      {/* Read-Only Banner */}
      {!canManage && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', backgroundColor: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)', borderRadius: '2px',
          color: 'var(--accent-color)', fontSize: '13px', marginBottom: '16px'
        }}>
          <strong>Read-Only View:</strong> Your role ({userRole?.replace(/_/g, ' ')}) has read-only access to maintenance logs.
        </div>
      )}

      {/* Stats Strip */}
      <div className="grid grid-cols-3" style={{ marginBottom: '16px' }}>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Total Records</div>
          <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-title)' }}>{records.length}</div>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--warning-text)', textTransform: 'uppercase', marginBottom: '4px' }}>Active (In Shop)</div>
          <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-title)', color: 'var(--warning-text)' }}>{openCount}</div>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--success-text)', textTransform: 'uppercase', marginBottom: '4px' }}>Completed</div>
          <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-title)', color: 'var(--success-text)' }}>{closedCount}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search vehicle, type, description…"
            style={{ paddingLeft: '32px' }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: '160px' }}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active (In Shop)</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <select value={vehicleFilter} onChange={e => setVehicleFilter(e.target.value)} style={{ width: '180px' }}>
          <option value="">All Vehicles</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.registration_number}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>
          <Download size={14} /> Export
        </button>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Log Maintenance
          </button>
        )}
      </div>

      {error && <div style={{ color: 'var(--error-text)', marginBottom: '8px' }}>{error}</div>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <SortHeader label="Work Order" sortKey="id" sortConfig={sortConfig} onSort={requestSort} />
              <th>Vehicle</th>
              <SortHeader label="Type" sortKey="maintenance_type" sortConfig={sortConfig} onSort={requestSort} />
              <th>Description</th>
              <SortHeader label="Cost (₹)" sortKey="maintenance_cost" sortConfig={sortConfig} onSort={requestSort} />
              <SortHeader label="Start Date" sortKey="start_date" sortConfig={sortConfig} onSort={requestSort} />
              <th>End Date</th>
              <SortHeader label="Status" sortKey="status" sortConfig={sortConfig} onSort={requestSort} />
              {canManage && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={canManage ? 9 : 8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</td></tr>}
            {!loading && sortedItems.length === 0 && (
              <tr><td colSpan={canManage ? 9 : 8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No maintenance records found.</td></tr>
            )}
            {sortedItems.map(r => {
              const isOpen = r.status === 'ACTIVE';
              return (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>#WO-{r.id}</td>
                  <td style={{ fontWeight: '500' }}>{r.vehicle_reg || `ID: ${r.vehicle_id}`}</td>
                  <td>{r.maintenance_type}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.description || '—'}</td>
                  <td style={{ fontWeight: '600' }}>₹{Number(r.maintenance_cost).toLocaleString()}</td>
                  <td style={{ fontSize: '12px' }}>{r.start_date ? new Date(r.start_date).toLocaleDateString() : '—'}</td>
                  <td style={{ fontSize: '12px' }}>{r.end_date ? new Date(r.end_date).toLocaleDateString() : '—'}</td>
                  <td>
                    <span className={isOpen ? 'badge badge-inshop' : 'badge badge-completed'}>
                      {isOpen ? 'In Shop' : 'Completed'}
                    </span>
                  </td>
                  {canManage && (
                    <td>
                      {isOpen && (
                        <button
                          className="btn btn-accent"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => {
                            setCompleting(r);
                            setCompleteForm(c => ({ ...c, maintenance_cost: r.maintenance_cost }));
                            setFormError('');
                          }}
                        >
                          Complete
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <Modal title="Log New Maintenance" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label>Vehicle *</label>
              <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} required>
                <option value="">Select Vehicle</option>
                {vehicles.filter(v => v.status === 'AVAILABLE').map(v => (
                  <option key={v.id} value={v.id}>{v.registration_number} – {v.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2">
              <div>
                <label>Maintenance Type *</label>
                <select value={form.maintenance_type} onChange={e => set('maintenance_type', e.target.value)}>
                  {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label>Start Date *</label>
                <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} required />
              </div>
            </div>
            <div>
              <label>Description</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} />
            </div>
            <div>
              <label>Estimated Cost (₹)</label>
              <input type="number" value={form.maintenance_cost} onChange={e => set('maintenance_cost', e.target.value)} min={0} step={0.01} />
            </div>
            {formError && <div style={{ color: 'var(--error-text)', fontSize: '13px' }}>{formError}</div>}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={formLoading}>
                {formLoading ? 'Saving...' : 'Create Record'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Complete Maintenance Modal */}
      {completing && (
        <Modal title={`Close Maintenance Order #WO-${completing.id}`} onClose={() => setCompleting(null)}>
          <form onSubmit={handleComplete} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Type: <strong style={{ color: 'var(--text-main)' }}>{completing.maintenance_type}</strong>
            </div>
            <div className="grid grid-cols-2">
              <div>
                <label>End Date *</label>
                <input type="date" value={completeForm.end_date} onChange={e => setComp('end_date', e.target.value)} required />
              </div>
              <div>
                <label>Final Cost (₹) *</label>
                <input type="number" value={completeForm.maintenance_cost} onChange={e => setComp('maintenance_cost', e.target.value)} min={0} step={0.01} required />
              </div>
            </div>
            {formError && <div style={{ color: 'var(--error-text)', fontSize: '13px' }}>{formError}</div>}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCompleting(null)}>Cancel</button>
              <button type="submit" className="btn btn-accent" disabled={formLoading}>
                {formLoading ? 'Closing...' : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Check size={14} /> Mark as Completed
                  </span>
                )}
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
        title="Maintenance Logs"
        rowCount={sortedItems.length}
      />
    </div>
  );
};

export default Maintenance;
