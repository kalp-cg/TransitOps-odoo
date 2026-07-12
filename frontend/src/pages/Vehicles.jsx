import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, X, Edit2, AlertCircle, Download, FileText, Trash2, CheckCircle, AlertTriangle, Upload, Eye } from 'lucide-react';
import { api } from '../api';
import useSortableData from '../hooks/useSortableData';
import SortHeader from '../components/SortHeader';
import ExportModal from '../components/ExportModal';
import useExport from '../hooks/useExport';

const STATUS_OPTIONS = ['AVAILABLE', 'ON_TRIP', 'IN_SHOP', 'RETIRED'];
const TYPE_OPTIONS = ['Truck', 'Van', 'Flatbed', 'Refrigerated', 'Tanker', 'Box_Truck'];

const statusClass = (s) => {
  const m = { AVAILABLE: 'available', ON_TRIP: 'ontrip', IN_SHOP: 'inshop', RETIRED: 'retired' };
  return `badge badge-${m[s] || ''}`;
};

const Modal = ({ title, onClose, children, wide = false }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 100,
    backgroundColor: 'var(--overlay)',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  }}>
    <div style={{
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '2px', width: wide ? '780px' : '520px', maxHeight: '90vh', overflowY: 'auto'
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

// ─── Document Types ──────────────────────────────────────────────────────────
const DOC_TYPES = ['RC Book', 'PUC', 'Insurance Policy', 'Permits', 'Fitness Certificate', 'Other'];

const DOC_STATUS_CONFIG = {
  VALID:          { label: 'Valid',          bg: 'rgba(47,133,90,0.15)',  color: '#48BB78', icon: CheckCircle },
  EXPIRING_SOON:  { label: 'Expiring Soon',  bg: 'rgba(183,121,31,0.15)', color: '#ECC94B', icon: AlertTriangle },
  EXPIRED:        { label: 'Expired',         bg: 'rgba(155,44,44,0.15)',  color: '#FC8181', icon: AlertCircle },
};

const DocStatusBadge = ({ status }) => {
  const cfg = DOC_STATUS_CONFIG[status] || DOC_STATUS_CONFIG.VALID;
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 9px', borderRadius: '2px', fontSize: '11px', fontWeight: '600',
      backgroundColor: cfg.bg, color: cfg.color
    }}>
      <Icon size={11} />{cfg.label}
    </span>
  );
};

// ─── Vehicle Documents Manager Modal ─────────────────────────────────────────
const VehicleDocumentsModal = ({ vehicle, userRole, onClose }) => {
  const [docs, setDocs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [editingDoc, setEditingDoc] = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [formError, setFormError]   = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const fileInputRef = useRef(null);

  const canWrite = userRole === 'FLEET_MANAGER' || userRole === 'ADMIN';

  const emptyForm = { document_type: 'RC Book', document_number: '', issue_date: '', expiry_date: '', file: null };
  const [form, setForm] = useState(emptyForm);

  const loadDocs = async () => {
    setLoading(true); setError('');
    try { setDocs(await api.getVehicleDocuments(vehicle.id)); }
    catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadDocs(); }, [vehicle.id]);

  const openAdd = () => { setEditingDoc(null); setForm(emptyForm); setFormError(''); setShowForm(true); };
  const openEdit = (doc) => {
    setEditingDoc(doc);
    setForm({
      document_type: doc.document_type,
      document_number: doc.document_number,
      issue_date: doc.issue_date?.slice(0,10) || '',
      expiry_date: doc.expiry_date?.slice(0,10) || '',
      file: null
    });
    setFormError(''); setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setFormError(''); setFormLoading(true);
    try {
      const fd = new FormData();
      fd.append('document_type',   form.document_type);
      fd.append('document_number', form.document_number);
      fd.append('issue_date',      form.issue_date);
      fd.append('expiry_date',     form.expiry_date);
      if (form.file) fd.append('file', form.file);

      if (editingDoc) {
        await api.updateVehicleDocument(vehicle.id, editingDoc.id, fd);
      } else {
        await api.addVehicleDocument(vehicle.id, fd);
      }
      setShowForm(false); await loadDocs();
    } catch(e) { setFormError(e.message); }
    finally { setFormLoading(false); }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete "${doc.document_type}" (${doc.document_number})?`)) return;
    try {
      await api.deleteVehicleDocument(vehicle.id, doc.id);
      await loadDocs();
    } catch(e) { alert('Delete failed: ' + e.message); }
  };

  const handleDownload = (doc) => {
    const url = api.getVehicleDocumentDownloadUrl(vehicle.id, doc.id);
    const token = localStorage.getItem('transitops_token');
    // Fetch with auth, then create object URL
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = doc.file_name || 'document';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert('Download failed – no file attached to this document.'));
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', backgroundColor: 'var(--bg-main)',
    border: '1px solid var(--border-color)', borderRadius: '2px',
    color: 'var(--text-main)', fontSize: '13px', boxSizing: 'border-box'
  };

  return (
    <Modal wide title={`📂 Documents — ${vehicle.registration_number} (${vehicle.name})`} onClose={onClose}>
      {error && <div style={{ color: 'var(--error-text)', marginBottom: '12px', fontSize: '13px' }}>{error}</div>}

      {/* Docs Table */}
      {!showForm && (
        <>
          {canWrite && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
              <button className="btn btn-primary" onClick={openAdd}>
                <Plus size={13} /> Add Document
              </button>
            </div>
          )}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>Loading…</div>
          ) : docs.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px', color: 'var(--text-muted)',
              border: '1px dashed var(--border-color)', borderRadius: '2px'
            }}>
              <FileText size={32} style={{ opacity: 0.3, marginBottom: '10px', display: 'block', margin: '0 auto 10px' }} />
              <div>No documents found for this vehicle.</div>
              {canWrite && <div style={{ fontSize: '12px', marginTop: '6px' }}>Click "Add Document" to get started.</div>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {docs.map(doc => (
                <div key={doc.id} style={{
                  padding: '14px 16px', backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-color)', borderRadius: '2px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <FileText size={14} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                      <span style={{ fontWeight: '600', fontSize: '13px' }}>{doc.document_type}</span>
                      <DocStatusBadge status={doc.status} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span><strong style={{ color: 'var(--text-main)' }}>No.:</strong> {doc.document_number}</span>
                      <span><strong style={{ color: 'var(--text-main)' }}>Issued:</strong> {doc.issue_date?.slice(0,10)}</span>
                      <span><strong style={{ color: 'var(--text-main)' }}>Expires:</strong> {doc.expiry_date?.slice(0,10)}</span>
                    </div>
                    {doc.file_name && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        📎 {doc.file_name}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {doc.file_path && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '5px 10px', fontSize: '12px' }}
                        onClick={() => handleDownload(doc)}
                        title="Download file"
                      >
                        <Download size={12} />
                      </button>
                    )}
                    {canWrite && (
                      <>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '5px 10px', fontSize: '12px' }}
                          onClick={() => openEdit(doc)}
                          title="Edit document"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '5px 10px', fontSize: '12px' }}
                          onClick={() => handleDelete(doc)}
                          title="Delete document"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ fontFamily: 'var(--font-title)', fontSize: '14px' }}>
              {editingDoc ? 'Edit Document' : 'Add New Document'}
            </h4>
            <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setShowForm(false)}>
              ← Back to list
            </button>
          </div>
          <div className="grid grid-cols-2" style={{ gap: '14px', marginBottom: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '5px' }}>Document Type *</label>
              <select style={inputStyle} value={form.document_type} onChange={e => setForm(f => ({...f, document_type: e.target.value}))} required>
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '5px' }}>Document Number *</label>
              <input style={inputStyle} value={form.document_number} onChange={e => setForm(f => ({...f, document_number: e.target.value}))} placeholder="e.g. INS-GJ-001" required />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '5px' }}>Issue Date *</label>
              <input type="date" style={inputStyle} value={form.issue_date} onChange={e => setForm(f => ({...f, issue_date: e.target.value}))} required />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '5px' }}>Expiry Date *</label>
              <input type="date" style={inputStyle} value={form.expiry_date} onChange={e => setForm(f => ({...f, expiry_date: e.target.value}))} required />
            </div>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '5px' }}>
              Upload Document File <span style={{ fontWeight: '400', color: 'var(--text-muted)' }}>(PDF, JPG, PNG, DOC – max 10MB)</span>
            </label>
            <div
              style={{
                border: '2px dashed var(--border-color)', borderRadius: '2px', padding: '20px',
                textAlign: 'center', cursor: 'pointer', backgroundColor: 'var(--bg-main)',
                transition: 'border-color 0.2s'
              }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.style.borderColor = 'var(--border-color)';
                const file = e.dataTransfer.files[0];
                if (file) setForm(f => ({...f, file}));
              }}
            >
              <Upload size={20} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {form.file ? (
                  <span style={{ color: 'var(--accent-color)', fontWeight: '600' }}>📎 {form.file.name}</span>
                ) : editingDoc?.file_name ? (
                  <><span style={{ color: 'var(--text-main)' }}>Current: {editingDoc.file_name}</span><br/><span>Click or drag to replace</span></>
                ) : 'Click or drag & drop to attach a file'}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => setForm(f => ({...f, file: e.target.files[0] || null}))}
              />
            </div>
          </div>
          {formError && <div style={{ color: 'var(--error-text)', fontSize: '13px', marginBottom: '12px' }}>{formError}</div>}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={formLoading}>
              {formLoading ? 'Saving…' : editingDoc ? 'Update Document' : 'Add Document'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};


const VehicleForm = ({ initial = {}, onSave, onClose }) => {
  const [form, setForm] = useState({
    registration_number: initial.registration_number || '',
    name: initial.name || '',
    model: initial.model || '',
    type: initial.type || 'Truck',
    maximum_load_capacity: initial.maximum_load_capacity || '',
    current_odometer: initial.current_odometer || 0,
    acquisition_cost: initial.acquisition_cost || '',
    region: initial.region || 'West',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isCreate = !initial.id;

  const [docSlots, setDocSlots] = useState({
    'RC Book': { active: false, document_number: '', issue_date: '', expiry_date: '', file: null },
    'PUC': { active: false, document_number: '', issue_date: '', expiry_date: '', file: null },
    'Insurance Policy': { active: false, document_number: '', issue_date: '', expiry_date: '', file: null },
    'Permits': { active: false, document_number: '', issue_date: '', expiry_date: '', file: null },
    'Fitness Certificate': { active: false, document_number: '', issue_date: '', expiry_date: '', file: null },
  });

  const updateSlot = (type, key, val) => {
    setDocSlots(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [key]: val
      }
    }));
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const savedVehicle = await onSave({
        ...form,
        maximum_load_capacity: Number(form.maximum_load_capacity),
        current_odometer: Number(form.current_odometer),
        acquisition_cost: Number(form.acquisition_cost)
      });

      if (isCreate && savedVehicle) {
        for (const [docType, data] of Object.entries(docSlots)) {
          if (data.active) {
            if (!data.document_number || !data.issue_date || !data.expiry_date) {
              throw new Error(`Please fill out all required fields for ${docType}.`);
            }
            const fd = new FormData();
            fd.append('document_type', docType);
            fd.append('document_number', data.document_number);
            fd.append('issue_date', data.issue_date);
            fd.append('expiry_date', data.expiry_date);
            if (data.file) {
              fd.append('file', data.file);
            }
            await api.addVehicleDocument(savedVehicle.id, fd);
          }
        }
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderDocSlot = (type) => {
    const slot = docSlots[type];
    return (
      <div key={type} style={{
        border: '1px solid var(--border-color)',
        borderRadius: '2px',
        padding: '10px',
        marginBottom: '10px',
        backgroundColor: slot.active ? 'var(--bg-main)' : 'transparent',
        transition: 'background-color 0.2s'
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', margin: 0 }}>
          <input
            type="checkbox"
            checked={slot.active}
            onChange={e => updateSlot(type, 'active', e.target.checked)}
            style={{ width: 'auto' }}
          />
          {type}
        </label>

        {slot.active && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '600', marginBottom: '3px', display: 'block' }}>Doc Number *</label>
              <input
                value={slot.document_number}
                onChange={e => updateSlot(type, 'document_number', e.target.value)}
                placeholder={`e.g. ${type === 'PUC' ? 'PUC-12345' : type === 'RC Book' ? 'RC-12345' : 'DOC-12345'}`}
                required
                style={{ padding: '6px 8px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', marginBottom: '3px', display: 'block' }}>Issue Date *</label>
                <input
                  type="date"
                  value={slot.issue_date}
                  onChange={e => updateSlot(type, 'issue_date', e.target.value)}
                  required
                  style={{ padding: '6px 8px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: '600', marginBottom: '3px', display: 'block' }}>Expiry Date *</label>
                <input
                  type="date"
                  value={slot.expiry_date}
                  onChange={e => updateSlot(type, 'expiry_date', e.target.value)}
                  required
                  style={{ padding: '6px 8px', fontSize: '12px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: '600', marginBottom: '3px', display: 'block' }}>Document File (PDF, Image)</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={e => updateSlot(type, 'file', e.target.files[0] || null)}
                style={{ padding: '4px', fontSize: '11px', border: 'none', backgroundColor: 'transparent', width: '100%' }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  const vehicleFields = (
    <>
      <div className="grid grid-cols-2">
        <div>
          <label>Registration Number *</label>
          <input value={form.registration_number} onChange={e => set('registration_number', e.target.value)} required />
        </div>
        <div>
          <label>Name *</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="e.g. Heavy Runner" />
        </div>
      </div>
      <div className="grid grid-cols-2">
        <div>
          <label>Make & Model *</label>
          <input value={form.model} onChange={e => set('model', e.target.value)} required placeholder="e.g. Tata Prima" />
        </div>
        <div>
          <label>Type</label>
          <select value={form.type} onChange={e => set('type', e.target.value)}>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2">
        <div>
          <label>Acquisition Cost ($) *</label>
          <input type="number" value={form.acquisition_cost} onChange={e => set('acquisition_cost', e.target.value)} required min={1} />
        </div>
        <div>
          <label>Capacity (kg) *</label>
          <input type="number" value={form.maximum_load_capacity} onChange={e => set('maximum_load_capacity', e.target.value)} required min={100} />
        </div>
      </div>
      <div className="grid grid-cols-2">
        <div>
          <label>Region *</label>
          <select value={form.region} onChange={e => set('region', e.target.value)}>
            {['West', 'East', 'North', 'South'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label>Odometer (km)</label>
          <input type="number" value={form.current_odometer} onChange={e => set('current_odometer', e.target.value)} min={0} />
        </div>
      </div>
    </>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {isCreate ? (
        <div style={{ display: 'flex', gap: '20px' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <h4 style={{ fontFamily: 'var(--font-title)', fontSize: '13px', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>Vehicle Details</h4>
            {vehicleFields}
          </div>
          <div style={{ width: '330px', borderLeft: '1px solid var(--border-color)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', maxHeight: '55vh', overflowY: 'auto' }}>
            <h4 style={{ fontFamily: 'var(--font-title)', fontSize: '13px', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>📑 Add Initial Documents</h4>
            {Object.keys(docSlots).map(renderDocSlot)}
          </div>
        </div>
      ) : (
        vehicleFields
      )}

      {error && <div style={{ color: 'var(--error-text)', fontSize: '13px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Saving...' : 'Save Vehicle'}
        </button>
      </div>
    </form>
  );
};

const Vehicles = ({ userRole }) => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [showModal, setShowModal]       = useState(false);
  const [editing, setEditing]           = useState(null);
  const [selected, setSelected]         = useState(null);
  const [showDocsModal, setShowDocsModal] = useState(false);

  const canManage = userRole === 'FLEET_MANAGER' || userRole === 'ADMIN';
  const canViewDocs = userRole !== 'DRIVER';

  const { sortedItems, sortConfig, requestSort, setSearchQuery, setFilter } = useSortableData(vehicles, { defaultSortKey: 'id', defaultOrder: 'DESC' });

  const [showExportModal, setShowExportModal] = useState(false);
  const VEHICLE_COLUMNS = [
    { key: 'registration_number', label: 'Registration Number' },
    { key: 'name', label: 'Name' },
    { key: 'model', label: 'Model' },
    { key: 'type', label: 'Type' },
    { key: 'maximum_load_capacity', label: 'Capacity (kg)' },
    { key: 'current_odometer', label: 'Odometer' },
    { key: 'status', label: 'Status' },
    { key: 'region', label: 'Region' },
  ];
  const { exportCsv, exportPdf } = useExport({
    title: 'Fleet Vehicle Registry',
    columns: VEHICLE_COLUMNS,
    data: sortedItems,
    filename: 'vehicles',
    subtitle: 'Complete fleet vehicle inventory and status report',
    summaryItems: [
      { label: 'Total Vehicles', value: vehicles.length },
      { label: 'Available', value: vehicles.filter(v => v.status === 'AVAILABLE').length },
      { label: 'On Trip', value: vehicles.filter(v => v.status === 'ON_TRIP').length },
      { label: 'In Maintenance', value: vehicles.filter(v => v.status === 'IN_SHOP').length },
    ]
  });

  useEffect(() => { setSearchQuery(search); }, [search]);
  useEffect(() => { setFilter('status', statusFilter); }, [statusFilter, setFilter]);
  useEffect(() => { setFilter('type', typeFilter); }, [typeFilter, setFilter]);
  useEffect(() => { setFilter('region', regionFilter); }, [regionFilter, setFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const res = await api.getVehicles(params);
      setVehicles(res.vehicles || res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const REGION_OPTIONS = ['West', 'East', 'North', 'South'];

  const handleCreate = async (data) => {
    const res = await api.createVehicle(data);
    await load();
    return res;
  };

  const handleUpdate = async (data) => {
    await api.updateVehicle(editing.id, data);
    setEditing(null);
    await load();
  };

  const handleDelete = async (v) => {
    if (!window.confirm(`Delete vehicle ${v.registration_number}?`)) return;
    try {
      await api.deleteVehicle(v.id);
      setSelected(null);
      await load();
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  };

  return (
    <div>
      {/* Read-Only Alert for other roles */}
      {!canManage && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', backgroundColor: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)', borderRadius: '2px',
          color: 'var(--accent-color)', fontSize: '13px', marginBottom: '16px'
        }}>
          <AlertCircle size={15} />
          <strong>Read-Only View:</strong> Your role ({userRole?.replace(/_/g, ' ')}) has view-only access to the vehicle registry.
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search plate, name, model…"
            style={{ paddingLeft: '32px' }}
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: '150px' }}>
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: '140px' }}>
          <option value="">All Types</option>
          {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
        </select>
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ width: '130px' }}>
          <option value="">All Regions</option>
          {REGION_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={() => setShowExportModal(true)}>
          <Download size={14} /> Export
        </button>
        {canManage && (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true); }}>
            <Plus size={14} /> Add Vehicle
          </button>
        )}
      </div>

      {/* Stats Banner */}
      <div className="grid grid-cols-4" style={{ marginBottom: '16px' }}>
        {STATUS_OPTIONS.map(s => (
          <div key={s} className="card" style={{ padding: '12px 14px', cursor: 'pointer' }} onClick={() => setStatusFilter(statusFilter === s ? '' : s)}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{s.replace('_', ' ')}</div>
            <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-title)' }}>
              {vehicles.filter(v => v.status === s).length}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        {/* Vehicle Table */}
        <div style={{ flex: 1 }}>
          {error && <div style={{ color: 'var(--error-text)', marginBottom: '8px' }}>{error}</div>}
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <SortHeader label="Reg Number" sortKey="registration_number" sortConfig={sortConfig} onSort={requestSort} />
                  <SortHeader label="Name" sortKey="name" sortConfig={sortConfig} onSort={requestSort} />
                  <SortHeader label="Model" sortKey="model" sortConfig={sortConfig} onSort={requestSort} />
                  <SortHeader label="Type" sortKey="type" sortConfig={sortConfig} onSort={requestSort} />
                  <SortHeader label="Capacity" sortKey="maximum_load_capacity" sortConfig={sortConfig} onSort={requestSort} />
                  <SortHeader label="Odometer" sortKey="current_odometer" sortConfig={sortConfig} onSort={requestSort} />
                  <SortHeader label="Status" sortKey="status" sortConfig={sortConfig} onSort={requestSort} />
                  {canManage && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={canManage ? 8 : 7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</td></tr>}
                {!loading && sortedItems.length === 0 && (
                  <tr><td colSpan={canManage ? 8 : 7} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No vehicles found.</td></tr>
                )}
                {sortedItems.map(v => (
                  <tr
                    key={v.id}
                    onClick={() => setSelected(v)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: '600', fontFamily: 'monospace' }}>{v.registration_number}</td>
                    <td>{v.name}</td>
                    <td>{v.model}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{v.type}</td>
                    <td>{Number(v.maximum_load_capacity).toLocaleString()} kg</td>
                    <td>{Number(v.current_odometer || 0).toLocaleString()} km</td>
                    <td><span className={statusClass(v.status)}>{v.status?.replace('_', ' ')}</span></td>
                    {canManage && (
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                          onClick={e => { e.stopPropagation(); setEditing(v); setShowModal(true); }}
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
          <div className="card" style={{ width: '280px', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontFamily: 'var(--font-title)', fontSize: '15px' }}>{selected.registration_number}</h3>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 4px', fontSize: '12px' }}>
              {[
                ['Name', selected.name],
                ['Model', selected.model],
                ['Type', selected.type],
                ['Status', selected.status],
                ['Region', selected.region],
                ['Capacity', `${Number(selected.maximum_load_capacity).toLocaleString()} kg`],
                ['Odometer', `${Number(selected.current_odometer || 0).toLocaleString()} km`],
                ['Acquisition', `$${Number(selected.acquisition_cost || 0).toLocaleString()}`],
              ].map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
                  <dd style={{ color: 'var(--text-main)', fontWeight: '500', textAlign: 'right' }}>{v}</dd>
                </React.Fragment>
              ))}
            </dl>
            {canManage && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => { setEditing(selected); setShowModal(true); }}>
                  <Edit2 size={12} /> Edit Vehicle
                </button>
                <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => handleDelete(selected)}>
                  Delete
                </button>
              </div>
            )}
            {canViewDocs && (
              <button
                className="btn btn-secondary"
                style={{ width: '100%', marginTop: canManage ? '0' : '16px', borderColor: 'var(--accent-color)', color: 'var(--accent-color)' }}
                onClick={() => setShowDocsModal(true)}
              >
                <FileText size={12} /> Manage Documents
              </button>
            )}
          </div>
        )}
      </div>

      {/* Documents Modal */}
      {showDocsModal && selected && (
        <VehicleDocumentsModal
          vehicle={selected}
          userRole={userRole}
          onClose={() => setShowDocsModal(false)}
        />
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <Modal
          title={editing ? `Edit ${editing.registration_number}` : 'Add New Vehicle'}
          onClose={() => { setShowModal(false); setEditing(null); }}
          wide={!editing}
        >
          <VehicleForm
            initial={editing || {}}
            onSave={editing ? handleUpdate : handleCreate}
            onClose={() => { setShowModal(false); setEditing(null); }}
          />
        </Modal>
      )}

      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        onCsv={exportCsv}
        onPdf={exportPdf}
        title="Vehicles"
        rowCount={sortedItems.length}
      />
    </div>
  );
};

export default Vehicles;
