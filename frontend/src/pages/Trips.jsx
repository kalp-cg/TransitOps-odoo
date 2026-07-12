import React, { useState, useEffect } from 'react';
import { Plus, X, AlertCircle, CheckCircle, Zap, Check, Play } from 'lucide-react';
import { api } from '../api';

const Modal = ({ title, onClose, children, wide = false }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 100,
    backgroundColor: 'rgba(0,0,0,0.65)',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  }}>
    <div style={{
      backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)',
      borderRadius: '2px', width: wide ? '780px' : '560px', maxHeight: '90vh', overflowY: 'auto'
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

const statusBadge = (status) => {
  const m = { DRAFT: 'draft', ACTIVE: 'active', COMPLETED: 'completed', CANCELLED: 'cancelled' };
  return `badge badge-${m[status] || ''}`;
};

const TripDispatchWizard = ({ vehicles, drivers, onSuccess, onClose }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    source: '', destination: '', cargo_description: '',
    cargo_weight: '', planned_distance: '', vehicle_id: '', driver_id: '', revenue: '',
  });
  const [recommendations, setRecommendations] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState('');
  const [tripId, setTripId] = useState(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const fetchRecommendations = async () => {
    if (!form.cargo_weight || !form.planned_distance) return;
    setRecLoading(true);
    setRecError('');
    try {
      const res = await api.recommendResources({
        cargo_weight: Number(form.cargo_weight),
        planned_distance: Number(form.planned_distance),
      });
      setRecommendations(res);
    } catch (e) {
      setRecError(e.message);
    } finally {
      setRecLoading(false);
    }
  };

  const applyRecommendation = (vehicle_id, driver_id) => {
    setForm(f => ({ ...f, vehicle_id: String(vehicle_id), driver_id: String(driver_id) }));
  };

  const getSelectedMatchDetails = () => {
    if (!recommendations) return null;
    const vId = Number(form.vehicle_id);
    const dId = Number(form.driver_id);

    if (!vId || !dId) return null;

    let vehicle = null;
    let vReasons = [];
    if (recommendations.recommendedVehicle?.vehicle?.id === vId) {
      vehicle = recommendations.recommendedVehicle.vehicle;
      vReasons = recommendations.recommendedVehicle.reasons;
    } else {
      const altV = recommendations.alternatives?.vehicles?.find(v => v.id === vId);
      if (altV) {
        vehicle = altV;
        vReasons = [
          `Capacity (${altV.maximum_load_capacity} KG) accommodates your cargo of ${form.cargo_weight} KG.`,
          `Estimated efficiency of ${altV.efficiencyKmL} KM/L (Est. fuel: ${altV.estimatedFuelLiters} L).`
        ];
      }
    }

    let driver = null;
    let dReasons = [];
    if (recommendations.recommendedDriver?.driver?.id === dId) {
      driver = recommendations.recommendedDriver.driver;
      dReasons = recommendations.recommendedDriver.reasons;
    } else {
      const altD = recommendations.alternatives?.drivers?.find(d => d.id === dId);
      if (altD) {
        driver = altD;
        dReasons = [
          `Driver is AVAILABLE and license expires in ${altD.licenseValidityDays} days.`,
          `Safety score is ${altD.safety_score}/100.`
        ];
      }
    }

    if (!vehicle || !driver) return null;

    const isBest = (recommendations.recommendedVehicle?.vehicle?.id === vId &&
                    recommendations.recommendedDriver?.driver?.id === dId);

    const bestFuelCost = recommendations.recommendedVehicle?.vehicle?.estimatedFuelCost || vehicle.estimatedFuelCost;
    const efficiencyRatio = vehicle.estimatedFuelCost > 0 ? (bestFuelCost / vehicle.estimatedFuelCost) : 1.0;
    const vehicleScore = efficiencyRatio * 100;
    const matchScore = Math.round((vehicleScore * 0.4) + (driver.safety_score * 0.6));

    return {
      vehicle,
      driver,
      vReasons,
      dReasons,
      isBest,
      matchScore
    };
  };

  const handleCreate = async () => {
    setValidationError('');
    setCreateLoading(true);
    try {
      const res = await api.createTrip({
        source: form.source,
        destination: form.destination,
        cargo_weight: Number(form.cargo_weight),
        planned_distance: Number(form.planned_distance),
        vehicle_id: Number(form.vehicle_id),
        driver_id: Number(form.driver_id),
        revenue: form.revenue ? Number(form.revenue) : 0,
      });
      setTripId(res.trip?.id || res.id);
      setStep(3);
    } catch (e) {
      setValidationError(e.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDispatch = async () => {
    setValidationError('');
    setDispatchLoading(true);
    try {
      await api.dispatchTrip(tripId);
      onSuccess();
      onClose();
    } catch (e) {
      setValidationError(e.message);
    } finally {
      setDispatchLoading(false);
    }
  };

  return (
    <div>
      {/* Step Indicator */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '24px' }}>
        {['Cargo & Route', 'Resource Selection', 'Confirm & Dispatch'].map((label, i) => {
          const stepNum = i + 1;
          const active = step === stepNum;
          const done = step > stepNum;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '2px',
                backgroundColor: done ? 'var(--success-color)' : active ? 'var(--primary-color)' : 'var(--border-color)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '12px', fontWeight: '700'
              }}>
                {done ? <Check size={14} /> : stepNum}
              </div>
              <div style={{ fontSize: '11px', color: active ? 'var(--text-main)' : 'var(--text-muted)', textAlign: 'center' }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 1: Cargo & Route */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="grid grid-cols-2">
            <div>
              <label>Source (Origin) *</label>
              <input value={form.source} onChange={e => set('source', e.target.value)} placeholder="e.g. Mumbai" required />
            </div>
            <div>
              <label>Destination *</label>
              <input value={form.destination} onChange={e => set('destination', e.target.value)} placeholder="e.g. Pune" required />
            </div>
          </div>
          <div className="grid grid-cols-3">
            <div>
              <label>Cargo Weight (kg) *</label>
              <input type="number" value={form.cargo_weight} onChange={e => set('cargo_weight', e.target.value)} min={0} required />
            </div>
            <div>
              <label>Distance (km) *</label>
              <input type="number" value={form.planned_distance} onChange={e => set('planned_distance', e.target.value)} min={1} required />
            </div>
            <div>
              <label>Planned Revenue (₹)</label>
              <input type="number" value={form.revenue} onChange={e => set('revenue', e.target.value)} min={0} placeholder="Optional" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              className="btn btn-primary"
              onClick={() => { setStep(2); fetchRecommendations(); }}
              disabled={!form.source || !form.destination || !form.cargo_weight || !form.planned_distance}
            >
              Next: Select Resources →
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Resource Selection */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Smart Recommendations Panel */}
          <div style={{
            backgroundColor: 'rgba(113,75,103,0.08)',
            border: '1px solid rgba(113,75,103,0.2)',
            borderRadius: '2px',
            padding: '14px 16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Zap size={16} color="var(--accent-color)" />
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Smart Dispatch Recommendations
              </span>
            </div>

            {recLoading && <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Analyzing fleet...</div>}
            {recError && <div style={{ color: '#F56565', fontSize: '13px' }}>{recError}</div>}

            {recommendations && !recLoading && (() => {
              const match = getSelectedMatchDetails();
              if (match) {
                return (
                  <div>
                    <div
                      style={{
                        padding: '10px 12px', marginBottom: '6px',
                        backgroundColor: 'var(--bg-dark)',
                        border: match.isBest ? '1px solid rgba(197,139,50,0.4)' : '1px solid var(--border-color)',
                        borderRadius: '2px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '12px' }}>
                          <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                            {match.vehicle.registration_number}
                          </span>
                          <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>+</span>
                          <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                            {match.driver.name}
                          </span>
                          <span style={{
                            marginLeft: '8px', fontSize: '10px',
                            backgroundColor: match.isBest ? 'rgba(197,139,50,0.15)' : 'rgba(113,75,103,0.15)',
                            color: match.isBest ? 'var(--accent-color)' : 'var(--text-main)',
                            padding: '2px 6px', borderRadius: '2px', fontWeight: '600'
                          }}>
                            {match.isBest ? 'BEST MATCH (100%)' : `CUSTOM MATCH (${match.matchScore}%)`}
                          </span>
                        </div>
                        {!match.isBest && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '10px' }}
                            onClick={() => applyRecommendation(
                              recommendations.recommendedVehicle?.vehicle?.id,
                              recommendations.recommendedDriver?.driver?.id
                            )}
                          >
                            Reset to Best Match
                          </button>
                        )}
                      </div>
                      
                      {/* Show calculations/reasons */}
                      <div style={{ marginTop: '8px', paddingLeft: '8px', borderLeft: '2px solid var(--border-color)' }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '2px' }}>Vehicle Metrics:</div>
                        {match.vReasons.map((r, idx) => (
                          <div key={`v-${idx}`} style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>• {r}</div>
                        ))}
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-main)', marginTop: '6px', marginBottom: '2px' }}>Driver Metrics:</div>
                        {match.dReasons.map((r, idx) => (
                          <div key={`d-${idx}`} style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>• {r}</div>
                        ))}
                      </div>
                    </div>

                    {/* Alternatives */}
                    {recommendations.alternatives?.vehicles?.length > 0 && (
                      <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        Alternative Available Vehicles: {recommendations.alternatives.vehicles.map(v => v.registration_number).join(', ')}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div>
                  {recommendations.recommendedVehicle && recommendations.recommendedDriver ? (
                    <div
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 12px', marginBottom: '6px',
                        backgroundColor: 'var(--bg-dark)',
                        border: '1px solid rgba(197,139,50,0.4)',
                        borderRadius: '2px', cursor: 'pointer'
                      }}
                      onClick={() => applyRecommendation(
                        recommendations.recommendedVehicle.vehicle.id,
                        recommendations.recommendedDriver.driver.id
                      )}
                    >
                      <div style={{ fontSize: '12px' }}>
                        <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>
                          {recommendations.recommendedVehicle.vehicle.registration_number}
                        </span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 6px' }}>+</span>
                        <span style={{ fontWeight: '500', color: 'var(--text-main)' }}>
                          {recommendations.recommendedDriver.driver.name}
                        </span>
                        <span style={{
                          marginLeft: '8px', fontSize: '10px',
                          backgroundColor: 'rgba(197,139,50,0.15)', color: 'var(--accent-color)',
                          padding: '2px 6px', borderRadius: '2px'
                        }}>BEST MATCH</span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--accent-color)', fontWeight: '500' }}>Click to Apply</span>
                    </div>
                  ) : (
                    <div style={{ color: '#F56565', fontSize: '13px' }}>
                      No valid vehicle/driver combinations available for this weight.
                    </div>
                  )}

                  {/* Alternatives */}
                  {recommendations.alternatives?.vehicles?.length > 0 && (
                    <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      Alternative Available Vehicles: {recommendations.alternatives.vehicles.map(v => v.registration_number).join(', ')}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Manual Selection */}
          <div className="grid grid-cols-2">
            <div>
              <label>Vehicle *</label>
              <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)} required>
                <option value="">Select Vehicle</option>
                {vehicles.filter(v => v.status === 'AVAILABLE').map(v => {
                  const isTooHeavy = Number(form.cargo_weight) > Number(v.maximum_load_capacity);
                  return (
                    <option key={v.id} value={v.id} disabled={isTooHeavy}>
                      {v.registration_number} – {v.type} ({Number(v.maximum_load_capacity).toLocaleString()} kg) {isTooHeavy ? ' (Insufficient Capacity)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label>Driver *</label>
              <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)} required>
                <option value="">Select Driver</option>
                {drivers.filter(d => d.status === 'AVAILABLE').map(d => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const expiryStr = new Date(d.license_expiry_date).toISOString().split('T')[0];
                  const isExpired = expiryStr < todayStr;

                  // Check license category suitability if a vehicle is selected
                  let licenseUnsuitable = false;
                  if (form.vehicle_id) {
                    const selVehicle = vehicles.find(v => String(v.id) === String(form.vehicle_id));
                    if (selVehicle && Number(selVehicle.maximum_load_capacity) > 3500) {
                      if (d.license_category !== 'Heavy Commercial') {
                        licenseUnsuitable = true;
                      }
                    }
                  }

                  const isDisabled = isExpired || licenseUnsuitable;
                  let suffix = '';
                  if (isExpired) suffix = ' (Expired License)';
                  else if (licenseUnsuitable) suffix = ' (Requires Heavy License)';

                  return (
                    <option key={d.id} value={d.id} disabled={isDisabled}>
                      {d.name} – Safety Score: {d.safety_score} {suffix}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {validationError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              backgroundColor: 'rgba(155,44,44,0.1)', border: '1px solid rgba(155,44,44,0.3)',
              borderRadius: '2px', padding: '10px 14px', color: '#F56565', fontSize: '13px'
            }}>
              <AlertCircle size={14} />
              {validationError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', marginTop: '8px' }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={!form.vehicle_id || !form.driver_id || createLoading}
            >
              {createLoading ? 'Creating…' : 'Create Trip Draft →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm & Dispatch */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{
            padding: '16px', backgroundColor: 'rgba(47,133,90,0.08)',
            border: '1px solid rgba(47,133,90,0.25)', borderRadius: '2px',
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <CheckCircle size={18} color="#48BB78" />
            <div>
              <div style={{ fontWeight: '600', fontSize: '14px', color: '#48BB78' }}>Trip #{tripId} created as DRAFT</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Click Dispatch to mark vehicle & driver as ON TRIP and activate it.
              </div>
            </div>
          </div>

          <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 4px', fontSize: '13px' }}>
            {[
              ['Route', `${form.source} → ${form.destination}`],
              ['Cargo Weight', `${Number(form.cargo_weight).toLocaleString()} kg`],
              ['Distance', `${form.planned_distance} km`],
            ].map(([k, v]) => (
              <React.Fragment key={k}>
                <dt style={{ color: 'var(--text-muted)' }}>{k}</dt>
                <dd style={{ fontWeight: '500' }}>{v}</dd>
              </React.Fragment>
            ))}
          </dl>

          {validationError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              backgroundColor: 'rgba(155,44,44,0.1)', border: '1px solid rgba(155,44,44,0.3)',
              borderRadius: '2px', padding: '10px 14px', color: '#F56565', fontSize: '13px'
            }}>
              <AlertCircle size={14} />
              {validationError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
            <button className="btn btn-secondary" onClick={onClose}>Save Draft & Close</button>
            <button className="btn btn-accent" onClick={handleDispatch} disabled={dispatchLoading}>
              {dispatchLoading ? 'Dispatching…' : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Play size={12} fill="currentColor" /> Dispatch Trip
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const CompleteTripModal = ({ trip, onSuccess, onClose }) => {
  const [form, setForm] = useState({
    final_odometer: '',
    fuel_consumed: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.completeTrip(trip.id, {
        final_odometer: Number(form.final_odometer),
        fuel_consumed: Number(form.fuel_consumed),
      });
      onSuccess();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '4px' }}>
        Completing trip #{trip.id}: <strong style={{ color: 'var(--text-main)' }}>{trip.source} → {trip.destination}</strong>
      </div>
      <div>
        <label>Final Odometer (km) *</label>
        <input type="number" value={form.final_odometer} onChange={e => setForm(f => ({ ...f, final_odometer: e.target.value }))} required />
      </div>
      <div>
        <label>Fuel Consumed (liters) *</label>
        <input type="number" value={form.fuel_consumed} onChange={e => setForm(f => ({ ...f, fuel_consumed: e.target.value }))} required />
      </div>
      {error && <div style={{ color: '#F56565', fontSize: '13px' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-accent" disabled={loading}>
          {loading ? 'Completing…' : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Check size={14} /> Complete Trip
            </span>
          )}
        </button>
      </div>
    </form>
  );
};

const Trips = ({ userRole }) => {
  const [trips, setTrips] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [completingTrip, setCompletingTrip] = useState(null);

  const canDispatch = ['DISPATCHER', 'FLEET_MANAGER', 'ADMIN'].includes(userRole);

  const load = async () => {
    setLoading(true);
    try {
      const [tripsRes, vRes, dRes] = await Promise.all([
        api.getTrips(statusFilter ? { status: statusFilter } : {}),
        api.getVehicles(),
        api.getDrivers(),
      ]);
      setTrips(tripsRes.trips || tripsRes);
      setVehicles(vRes.vehicles || vRes);
      setDrivers(dRes.drivers || dRes);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleCancel = async (t) => {
    if (!window.confirm(`Cancel trip #${t.id}?`)) return;
    try {
      await api.cancelTrip(t.id);
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  const statusCounts = {
    DRAFT: trips.filter(t => t.status === 'DRAFT').length,
    ACTIVE: trips.filter(t => t.status === 'DISPATCHED').length,
    COMPLETED: trips.filter(t => t.status === 'COMPLETED').length,
    CANCELLED: trips.filter(t => t.status === 'CANCELLED').length,
  };

  return (
    <div>
      {/* Read-Only Banner for compliance / analytics roles */}
      {!canDispatch && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', backgroundColor: 'rgba(197,139,50,0.08)',
          border: '1px solid rgba(197,139,50,0.2)', borderRadius: '2px',
          color: 'var(--accent-color)', fontSize: '13px', marginBottom: '16px'
        }}>
          <AlertCircle size={15} />
          <strong>Read-Only View:</strong> Your role ({userRole?.replace(/_/g, ' ')}) has view-only access to dispatched trips.
        </div>
      )}

      {/* Stats Strip */}
      <div className="grid grid-cols-4" style={{ marginBottom: '16px' }}>
        {Object.entries(statusCounts).map(([s, c]) => (
          <div key={s} className="card" style={{ padding: '12px 14px', cursor: 'pointer' }}
            onClick={() => setStatusFilter(s === 'ACTIVE' ? 'DISPATCHED' : statusFilter === s ? '' : s)}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>{s}</div>
            <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'var(--font-title)' }}>{c}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: '200px' }}>
          <option value="">All Statuses</option>
          {['DRAFT', 'DISPATCHED', 'COMPLETED', 'CANCELLED'].map(s => <option key={s} value={s}>{s === 'DISPATCHED' ? 'ACTIVE (DISPATCHED)' : s}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        {canDispatch && (
          <button className="btn btn-primary" onClick={() => setShowWizard(true)}>
            <Plus size={14} /> Dispatch New Trip
          </button>
        )}
      </div>

      {error && <div style={{ color: '#F56565', marginBottom: '8px' }}>{error}</div>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Trip Code</th>
              <th>Origin (Source)</th>
              <th>Destination</th>
              <th>Cargo Weight</th>
              <th>Planned Distance</th>
              <th>Vehicle</th>
              <th>Driver</th>
              <th>Status</th>
              {canDispatch && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={canDispatch ? 9 : 8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</td></tr>}
            {!loading && trips.length === 0 && (
              <tr><td colSpan={canDispatch ? 9 : 8} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No trips found.</td></tr>
            )}
            {trips.map(t => (
              <tr key={t.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{t.trip_code}</td>
                <td>{t.source}</td>
                <td>{t.destination}</td>
                <td>{Number(t.cargo_weight).toLocaleString()} kg</td>
                <td>{Number(t.planned_distance).toLocaleString()} km</td>
                <td style={{ fontSize: '12px' }}>{t.vehicle_reg || t.vehicle_id}</td>
                <td style={{ fontSize: '12px' }}>{t.driver_name || t.driver_id}</td>
                <td><span className={`badge badge-${(t.status === 'DISPATCHED' ? 'ontrip' : t.status || '').toLowerCase()}`}>{t.status === 'DISPATCHED' ? 'ACTIVE' : t.status}</span></td>
                {canDispatch && (
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {t.status === 'DISPATCHED' && (
                        <button
                          className="btn btn-accent"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => setCompletingTrip(t)}
                        >
                          Complete
                        </button>
                      )}
                      {(t.status === 'DRAFT' || t.status === 'DISPATCHED') && (
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => handleCancel(t)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showWizard && (
        <Modal title="Dispatch New Trip" onClose={() => setShowWizard(false)} wide>
          <TripDispatchWizard
            vehicles={vehicles}
            drivers={drivers}
            onSuccess={load}
            onClose={() => setShowWizard(false)}
          />
        </Modal>
      )}

      {completingTrip && (
        <Modal title="Complete Trip" onClose={() => setCompletingTrip(null)}>
          <CompleteTripModal
            trip={completingTrip}
            onSuccess={load}
            onClose={() => setCompletingTrip(null)}
          />
        </Modal>
      )}
    </div>
  );
};

export default Trips;
