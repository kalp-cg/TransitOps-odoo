import React, { useState, useEffect, useMemo } from 'react';
import { Truck, Users, Navigation, Wrench, TrendingUp, AlertTriangle, CheckCircle, RefreshCw, Lightbulb, ClipboardList, Fuel, DollarSign, Shield, BarChart3, Target, Activity, Clock, ChevronRight, FileText, XCircle } from 'lucide-react';
import { api } from '../api';
import DonutChart from '../components/DonutChart';
import MiniSparkline from '../components/MiniSparkline';
import MetricBar from '../components/MetricBar';

// ═══════════════════════════════════════════════════
// ROLE CONFIG
// ═══════════════════════════════════════════════════
const ROLE_CONFIG = {
  FLEET_MANAGER: { label: 'Fleet Manager', color: 'var(--role-fleet)', icon: Truck, welcome: 'Fleet Health & Maintenance' },
  DISPATCHER: { label: 'Dispatcher', color: 'var(--role-dispatcher)', icon: Navigation, welcome: 'Dispatch & Trip Operations' },
  SAFETY_OFFICER: { label: 'Safety Officer', color: 'var(--role-safety)', icon: Shield, welcome: 'Driver Safety & Compliance' },
  FINANCIAL_ANALYST: { label: 'Financial Analyst', color: 'var(--role-finance)', icon: DollarSign, welcome: 'Cost Analysis & ROI' },
  ADMIN: { label: 'Admin', color: 'var(--role-admin)', icon: BarChart3, welcome: 'Full Operations Overview' },
  DRIVER: { label: 'Driver', color: 'var(--role-driver)', icon: Truck, welcome: 'My Portal' },
};

// ═══════════════════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════════════════

const KpiCard = ({ title, value, unit = '', sub, color, icon: Icon, sparkData, sparkColor, borderColor }) => (
  <div className="card" style={{
    display: 'flex', flexDirection: 'column', gap: '4px', position: 'relative', overflow: 'hidden',
    borderLeft: `3px solid ${borderColor || color}`,
    padding: '14px 16px'
  }}>
    <div style={{ position: 'absolute', right: 12, top: 12, opacity: 0.1 }}>
      <Icon size={36} color={color} />
    </div>
    <div style={{
      fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase',
      letterSpacing: '0.6px', fontWeight: '600', fontFamily: 'var(--font-title)'
    }}>
      {title}
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
      <div style={{
        fontSize: '26px', fontWeight: '700', fontFamily: 'var(--font-title)',
        color: color || 'var(--text-main)', lineHeight: '1.1'
      }}>
        {value ?? '—'}
        {unit && <span style={{ fontSize: '13px', fontWeight: '400', color: 'var(--text-muted)', marginLeft: '3px' }}>{unit}</span>}
      </div>
    </div>
    {sparkData && <MiniSparkline data={sparkData} color={sparkColor || color} height={24} />}
    {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
  </div>
);

const SectionHeader = ({ icon: Icon, title, count, color }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '14px', paddingBottom: '10px', borderBottom: `1px solid var(--border-color)`
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        width: '28px', height: '28px', borderRadius: '2px',
        backgroundColor: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <Icon size={14} color={color} />
      </div>
      <span style={{
        fontSize: '13px', fontWeight: '600', fontFamily: 'var(--font-title)',
        color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.3px'
      }}>{title}</span>
    </div>
    {count !== undefined && (
      <span style={{
        fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)',
        backgroundColor: 'var(--bg-main)', padding: '2px 8px', borderRadius: '2px'
      }}>{count}</span>
    )}
  </div>
);

const MiniBarChart = ({ data, color, height = 64, label }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div>
      {label && <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' }}>{label}</div>}
      <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
            <div style={{
              width: '100%', height: `${(d.value / max) * (height - 16)}px`,
              backgroundColor: color,
              borderRadius: '2px 2px 0 0', minHeight: 2,
              opacity: 0.4 + (i / data.length) * 0.6,
              transition: 'height 0.4s'
            }} />
            <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const EmptyState = ({ message }) => (
  <div style={{
    padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px'
  }}>{message}</div>
);

// ─── Document Compliance Alert Panel ───────────────────────────────────────────
const DocAlertsPanel = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getVehicleDocumentAlerts()
      .then(data => { setAlerts(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const today = new Date(); today.setHours(0,0,0,0);
  const daysUntil = (d) => Math.ceil((new Date(d) - today) / 86400000);

  const expiredAlerts  = alerts.filter(a => a.status === 'EXPIRED');
  const expiringAlerts = alerts.filter(a => a.status === 'EXPIRING_SOON');

  if (loading) return null;
  if (alerts.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: '16px' }}>
      <SectionHeader
        icon={FileText}
        title="Document Compliance Alerts"
        count={alerts.length}
        color="var(--error-text)"
      />
      {expiredAlerts.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{
            fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px',
            color: 'var(--error-text)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px'
          }}>
            <XCircle size={12} /> Expired ({expiredAlerts.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {expiredAlerts.slice(0,5).map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', backgroundColor: 'rgba(155,44,44,0.07)',
                border: '1px solid rgba(252,129,129,0.25)', borderLeft: '3px solid #FC8181', borderRadius: '2px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={12} style={{ color: '#FC8181', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600' }}>{a.document_type}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {a.registration_number} · #{a.document_number}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#FC8181' }}>EXPIRED</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {Math.abs(daysUntil(a.expiry_date))}d ago
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {expiringAlerts.length > 0 && (
        <div>
          <div style={{
            fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.6px',
            color: '#ECC94B', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px'
          }}>
            <AlertTriangle size={12} /> Expiring Soon ({expiringAlerts.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {expiringAlerts.slice(0,5).map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 12px', backgroundColor: 'rgba(183,121,31,0.07)',
                border: '1px solid rgba(236,201,75,0.25)', borderLeft: '3px solid #ECC94B', borderRadius: '2px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={12} style={{ color: '#ECC94B', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600' }}>{a.document_type}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {a.registration_number} · #{a.document_number}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: '#ECC94B' }}>
                    {daysUntil(a.expiry_date)}d left
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    Expires {new Date(a.expiry_date).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


// ═══════════════════════════════════════════════════
// ROLE-SPECIFIC SECTIONS
// ═══════════════════════════════════════════════════

// ─── FLEET MANAGER ──────────────────────────────
const FleetManagerSection = ({ data, kpis }) => {
  const fm = data?.roleData?.fleetManager;
  if (!fm) return null;

  const fleetDonut = [
    { label: 'Available', value: fm.fleetState?.available || 0, color: 'var(--chart-success)' },
    { label: 'On Trip', value: fm.fleetState?.onTrip || 0, color: 'var(--chart-info)' },
    { label: 'In Shop', value: fm.fleetState?.inShop || 0, color: 'var(--chart-warning)' },
    { label: 'Retired', value: fm.fleetState?.retired || 0, color: 'var(--chart-neutral)' },
  ];

  return (
    <div>
      {/* KPI Row */}
      <div className="grid grid-cols-4" style={{ marginBottom: '16px' }}>
        <KpiCard title="Fleet Utilization" value={kpis.fleetUtilization ?? 0} unit="%" icon={TrendingUp} color="var(--success-text)"
          borderColor="var(--success-color)" sub={`${kpis.activeVehicles || 0} vehicles deployed`} />
        <KpiCard title="In Maintenance" value={kpis.vehiclesInMaintenance ?? 0} icon={Wrench} color="var(--warning-text)"
          borderColor="var(--warning-color)" sub="Currently in shop" />
        <KpiCard title="Total Fleet Value" value={`₹${(kpis.totalFleetValue / 100000).toFixed(1)}L`} icon={DollarSign} color="var(--accent-color)"
          borderColor="var(--accent-color)" sub="Acquisition cost" />
        <KpiCard title="Avg Odometer" value={`${(kpis.avgOdometer / 1000).toFixed(0)}K`} unit="km" icon={Activity} color="var(--info-text)"
          borderColor="var(--info-color)" sub="Fleet average" />
      </div>

      <div className="grid grid-cols-2" style={{ marginBottom: '16px' }}>
        {/* Fleet State Donut */}
        <div className="card">
          <SectionHeader icon={Truck} title="Fleet Distribution" color="var(--role-fleet)" />
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
            <DonutChart segments={fleetDonut} size={170} thickness={26}
              centerValue={kpis.totalVehicles || 0} centerLabel="TOTAL" />
          </div>
        </div>

        {/* Maintenance Trend */}
        <div className="card">
          <SectionHeader icon={TrendingUp} title="Maintenance Cost Trend" color="var(--chart-warning)" />
          {fm.maintenanceTrend?.length > 0 ? (
            <MiniBarChart data={fm.maintenanceTrend} color="var(--chart-warning)" height={90} />
          ) : <EmptyState message="No maintenance data yet" />}
        </div>
      </div>

      <div className="grid grid-cols-2">
        {/* Top Cost Vehicles */}
        <div className="card">
          <SectionHeader icon={DollarSign} title="Highest Cost Vehicles" color="var(--error-text)" count={fm.topCostVehicles?.length || 0} />
          {fm.topCostVehicles?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {fm.topCostVehicles.map((v, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 10px', backgroundColor: 'var(--bg-main)', borderRadius: '2px',
                  border: '1px solid var(--border-color)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '20px', height: '20px', borderRadius: '2px', fontSize: '10px', fontWeight: '700',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      backgroundColor: i < 3 ? 'var(--error-bg)' : 'var(--bg-hover)',
                      color: i < 3 ? 'var(--error-text)' : 'var(--text-muted)'
                    }}>{i + 1}</span>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: '600', fontFamily: 'var(--font-title)' }}>{v.reg}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v.name}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--error-text)' }}>
                      ₹{(v.totalCost / 1000).toFixed(1)}K
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Fuel ₹{(v.fuelCost / 1000).toFixed(1)}K · Maint ₹{(v.maintCost / 1000).toFixed(1)}K
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No vehicle cost data" />}
        </div>

        {/* Open Maintenance */}
        <div className="card">
          <SectionHeader icon={Wrench} title="Open Work Orders" color="var(--warning-text)" count={fm.openMaintenance?.length || 0} />
          {fm.openMaintenance?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {fm.openMaintenance.map((m, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 10px', backgroundColor: 'var(--bg-main)', borderRadius: '2px',
                  borderLeft: '3px solid var(--warning-text)'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600' }}>{m.type}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {m.vehicle} · ₹{m.cost?.toLocaleString()}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '11px', fontWeight: '600',
                    color: m.daysOpen > 7 ? 'var(--error-text)' : 'var(--warning-text)'
                  }}>{m.daysOpen}d</span>
                </div>
              ))}
            </div>
          ) : <EmptyState message="Fleet healthy — no open work orders" />}
        </div>
      </div>

      {/* Vehicle Document Compliance Alerts */}
      <DocAlertsPanel />
    </div>
  );
};

// ─── DISPATCHER ─────────────────────────────────
const DispatcherSection = ({ data, kpis }) => {
  const dp = data?.roleData?.dispatcher;
  if (!dp) return null;

  const tripDonut = [
    { label: 'Active', value: dp.tripStatus?.active || 0, color: 'var(--chart-info)' },
    { label: 'Completed', value: dp.tripStatus?.completed || 0, color: 'var(--chart-success)' },
    { label: 'Draft', value: dp.tripStatus?.draft || 0, color: 'var(--chart-warning)' },
    { label: 'Cancelled', value: dp.tripStatus?.cancelled || 0, color: 'var(--error-text)' },
  ];

  return (
    <div>
      <div className="grid grid-cols-4" style={{ marginBottom: '16px' }}>
        <KpiCard title="Active Dispatches" value={kpis.activeTrips ?? 0} icon={Navigation} color="var(--info-text)"
          borderColor="var(--info-color)" sub="Currently on road" />
        <KpiCard title="Pending Dispatch" value={kpis.pendingTrips ?? 0} icon={Clock} color="var(--warning-text)"
          borderColor="var(--warning-color)" sub="Draft trips awaiting assignment" />
        <KpiCard title="Completed" value={kpis.completedTrips ?? 0} icon={CheckCircle} color="var(--success-text)"
          borderColor="var(--success-color)" sub="Successfully delivered" />
        <KpiCard title="Dispatch Rate" value={dp.dispatchRate ?? 0} unit="%" icon={Target} color="var(--role-dispatcher)"
          borderColor="var(--role-dispatcher)" sub="Trips dispatched or completed" />
      </div>

      <div className="grid grid-cols-2" style={{ marginBottom: '16px' }}>
        <div className="card">
          <SectionHeader icon={Navigation} title="Trip Status" color="var(--role-dispatcher)" />
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
            <DonutChart segments={tripDonut} size={160} thickness={24}
              centerValue={dp.tripStatus?.active || 0} centerLabel="ACTIVE" />
          </div>
        </div>

        <div className="card">
          <SectionHeader icon={BarChart3} title="Trips Per Day (7d)" color="var(--chart-info)" />
          {dp.tripsPerDay?.length > 0 ? (
            <MiniBarChart data={dp.tripsPerDay} color="var(--chart-info)" height={100} />
          ) : <EmptyState message="No trip data this week" />}
        </div>
      </div>

      <div className="grid grid-cols-2">
        {/* Pending Trips */}
        <div className="card">
          <SectionHeader icon={Clock} title="Pending Trips" color="var(--warning-text)" count={dp.pendingTrips?.length || 0} />
          {dp.pendingTrips?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {dp.pendingTrips.map((t, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 10px', backgroundColor: 'var(--bg-main)', borderRadius: '2px',
                  borderLeft: '3px solid var(--status-draft)'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', fontFamily: 'monospace' }}>{t.trip_code}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.source} → {t.destination}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.cargo_weight}kg</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t.planned_distance}km</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="All trips dispatched" />}
        </div>

        {/* Active Trips */}
        <div className="card">
          <SectionHeader icon={Navigation} title="Active Trips" color="var(--info-text)" count={dp.activeTrips?.length || 0} />
          {dp.activeTrips?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {dp.activeTrips.map((t, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 10px', backgroundColor: 'var(--bg-main)', borderRadius: '2px',
                  borderLeft: '3px solid var(--status-dispatched)'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', fontFamily: 'monospace' }}>{t.trip_code}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.source} → {t.destination}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.vehicle_reg}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t.driver_name}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No active dispatches" />}
        </div>
      </div>
    </div>
  );
};

// ─── SAFETY OFFICER ─────────────────────────────
const SafetyOfficerSection = ({ data, kpis }) => {
  const so = data?.roleData?.safetyOfficer;
  if (!so) return null;

  const scoreDonut = so.safetyScoreDistribution?.map(s => ({
    label: s.label, value: s.value, color: s.color
  })) || [];

  return (
    <div>
      <div className="grid grid-cols-4" style={{ marginBottom: '16px' }}>
        <KpiCard title="Avg Safety Score" value={so.avgSafetyScore ?? '—'} icon={Shield} color="var(--success-text)"
          borderColor="var(--success-color)" sub={`Across ${so.totalDrivers || 0} drivers`} />
        <KpiCard title="Valid Licenses" value={so.licenseBreakdown?.valid ?? 0} icon={CheckCircle} color="var(--success-text)"
          borderColor="var(--success-color)" sub="Up to date" />
        <KpiCard title="Expiring Soon" value={so.licenseBreakdown?.expiringSoon ?? 0} icon={AlertTriangle} color="var(--warning-text)"
          borderColor="var(--warning-color)" sub="Within 30 days" />
        <KpiCard title="Suspended" value={kpis.driversSuspended ?? 0} icon={AlertTriangle} color="var(--error-text)"
          borderColor="var(--error-color)" sub="Need review" />
      </div>

      <div className="grid grid-cols-2" style={{ marginBottom: '16px' }}>
        <div className="card">
          <SectionHeader icon={Shield} title="Safety Score Distribution" color="var(--role-safety)" />
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
            <DonutChart segments={scoreDonut} size={170} thickness={26}
              centerValue={so.avgSafetyScore || 0} centerLabel="AVG SCORE" />
          </div>
        </div>

        <div className="card">
          <SectionHeader icon={Target} title="License Breakdown" color="var(--role-safety)" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px 0' }}>
            <MetricBar label="Valid" value={`${so.licenseBreakdown?.valid || 0}`}
              pct={so.totalDrivers > 0 ? ((so.licenseBreakdown?.valid || 0) / so.totalDrivers) * 100 : 0}
              color="var(--success-text)" />
            <MetricBar label="Expiring Soon" value={`${so.licenseBreakdown?.expiringSoon || 0}`}
              pct={so.totalDrivers > 0 ? ((so.licenseBreakdown?.expiringSoon || 0) / so.totalDrivers) * 100 : 0}
              color="var(--warning-text)" />
            <MetricBar label="Expired" value={`${so.licenseBreakdown?.expired || 0}`}
              pct={so.totalDrivers > 0 ? ((so.licenseBreakdown?.expired || 0) / so.totalDrivers) * 100 : 0}
              color="var(--error-text)" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2">
        {/* License Alerts */}
        <div className="card">
          <SectionHeader icon={AlertTriangle} title="License Alerts" color="var(--warning-text)" count={so.licenseAlerts?.length || 0} />
          {so.licenseAlerts?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {so.licenseAlerts.map((d, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 10px', backgroundColor: 'var(--bg-main)', borderRadius: '2px',
                  borderLeft: '3px solid var(--warning-text)'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600' }}>{d.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.category}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '11px', fontWeight: '600',
                      color: new Date(d.expiryDate) < new Date() ? 'var(--error-text)' : 'var(--warning-text)'
                    }}>
                      {new Date(d.expiryDate).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Score: {d.safetyScore}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No license alerts" />}
        </div>

        {/* At-Risk Drivers */}
        <div className="card">
          <SectionHeader icon={AlertTriangle} title="At-Risk Drivers" color="var(--error-text)" count={so.problemDrivers?.length || 0} />
          {so.problemDrivers?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {so.problemDrivers.map((d, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 10px', backgroundColor: 'var(--bg-main)', borderRadius: '2px',
                  borderLeft: '3px solid var(--error-text)'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600' }}>{d.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.licenseNumber}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`badge ${d.status === 'SUSPENDED' ? 'badge-suspended' : 'badge-inshop'}`}>
                      {d.status}
                    </span>
                    <div style={{ fontSize: '10px', color: 'var(--error-text)', marginTop: '2px' }}>Score: {d.safetyScore}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="All drivers are compliant" />}
        </div>
      </div>
    </div>
  );
};

// ─── FINANCIAL ANALYST ──────────────────────────
const FinancialAnalystSection = ({ data, kpis }) => {
  const fa = data?.roleData?.financialAnalyst;
  if (!fa) return null;

  const costDonut = [
    { label: 'Fuel', value: fa.costBreakdown?.fuel || 0, color: 'var(--chart-info)' },
    { label: 'Maintenance', value: fa.costBreakdown?.maintenance || 0, color: 'var(--chart-warning)' },
    { label: 'Other', value: fa.costBreakdown?.other || 0, color: 'var(--chart-neutral)' },
  ];

  const profitColor = fa.netProfit >= 0 ? 'var(--success-text)' : 'var(--error-text)';

  return (
    <div>
      <div className="grid grid-cols-4" style={{ marginBottom: '16px' }}>
        <KpiCard title="Total Revenue" value={`₹${(fa.totalRevenue / 100000).toFixed(1)}L`} icon={TrendingUp} color="var(--success-text)"
          borderColor="var(--success-color)" sub="From completed trips" />
        <KpiCard title="Operational Cost" value={`₹${(fa.totalOperationalCost / 100000).toFixed(1)}L`} icon={DollarSign} color="var(--warning-text)"
          borderColor="var(--warning-color)" sub="Fuel + Maintenance + Other" />
        <KpiCard title="Net Profit" value={`₹${(fa.netProfit / 100000).toFixed(1)}L`} icon={TrendingUp} color={profitColor}
          borderColor={fa.netProfit >= 0 ? 'var(--success-color)' : 'var(--error-color)'} sub="Revenue − Cost" />
        <KpiCard title="Avg ROI" value={`${fa.avgROI}%`} icon={Target} color="var(--accent-color)"
          borderColor="var(--accent-color)" sub="Return on investment" />
      </div>

      <div className="grid grid-cols-3" style={{ marginBottom: '16px' }}>
        <div className="card">
          <SectionHeader icon={DollarSign} title="Cost Breakdown" color="var(--role-finance)" />
          <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
            <DonutChart segments={costDonut} size={160} thickness={22}
              centerValue={`₹${(fa.totalOperationalCost / 100000).toFixed(1)}L`} centerLabel="TOTAL" />
          </div>
        </div>

        <div className="card" style={{ gridColumn: 'span 2' }}>
          <SectionHeader icon={BarChart3} title="Monthly Cost Trend" color="var(--chart-info)" />
          {fa.monthlyTrend?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              {fa.monthlyTrend.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '32px' }}>{m.month}</span>
                  <div style={{ flex: 1, display: 'flex', gap: '2px', height: '14px', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${((m.fuel || 0) / Math.max(fa.totalOperationalCost, 1)) * 100}%`, backgroundColor: 'var(--chart-info)' }} title={`Fuel: ₹${m.fuel}`} />
                    <div style={{ width: `${((m.maintenance || 0) / Math.max(fa.totalOperationalCost, 1)) * 100}%`, backgroundColor: 'var(--chart-warning)' }} title={`Maint: ₹${m.maintenance}`} />
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '500', minWidth: '60px', textAlign: 'right' }}>₹{((m.fuel || 0) + (m.maintenance || 0) / 1000).toFixed(0)}K</span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '14px', marginTop: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--chart-info)' }} /> Fuel
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: 'var(--chart-warning)' }} /> Maintenance
                </div>
              </div>
            </div>
          ) : <EmptyState message="No monthly data available" />}
        </div>
      </div>

      <div className="grid grid-cols-2">
        {/* Vehicle ROI */}
        <div className="card">
          <SectionHeader icon={Target} title="Vehicle ROI Ranking" color="var(--role-finance)" count={fa.vehicleROI?.length || 0} />
          {fa.vehicleROI?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {fa.vehicleROI.map((v, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 10px', backgroundColor: 'var(--bg-main)', borderRadius: '2px',
                  borderLeft: `3px solid ${v.profit >= 0 ? 'var(--success-text)' : 'var(--error-text)'}`
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', fontFamily: 'var(--font-title)' }}>{v.reg}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: v.profit >= 0 ? 'var(--success-text)' : 'var(--error-text)' }}>
                      {v.profit >= 0 ? '+' : ''}₹{(v.profit / 1000).toFixed(1)}K
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>ROI {v.roi}%</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No ROI data" />}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <SectionHeader icon={ClipboardList} title="Recent Expenses" color="var(--text-muted)" count={fa.recentActivity?.length || 0} />
          {fa.recentActivity?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {fa.recentActivity.map((a, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '7px 10px', backgroundColor: 'var(--bg-main)', borderRadius: '2px'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '500' }}>{a.type === 'fuel' ? '⛽' : '🔧'} {a.vehicle}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{a.detail}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--error-text)' }}>₹{a.cost?.toLocaleString()}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {a.date ? new Date(a.date).toLocaleDateString() : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No recent expenses" />}
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN ──────────────────────────────────────
const AdminSection = ({ data, kpis }) => {
  const ad = data?.roleData?.admin;
  const fm = data?.roleData?.fleetManager;
  const dp = data?.roleData?.dispatcher;
  const so = data?.roleData?.safetyOfficer;
  const fa = data?.roleData?.financialAnalyst;

  return (
    <div>
      {/* Compact KPI Row */}
      <div className="grid grid-cols-7" style={{ marginBottom: '16px' }}>
        <KpiCard title="Vehicles" value={kpis.totalVehicles || 0} icon={Truck} color="var(--role-fleet)"
          borderColor="var(--role-fleet)" sub={`${kpis.activeVehicles || 0} active`} />
        <KpiCard title="Drivers" value={kpis.totalDrivers || 0} icon={Users} color="var(--role-driver)"
          borderColor="var(--role-driver)" sub={`${kpis.driversOnDuty || 0} on duty`} />
        <KpiCard title="Active Trips" value={kpis.activeTrips || 0} icon={Navigation} color="var(--role-dispatcher)"
          borderColor="var(--role-dispatcher)" sub="Dispatched" />
        <KpiCard title="Utilization" value={`${kpis.fleetUtilization || 0}`} unit="%" icon={TrendingUp} color="var(--success-text)"
          borderColor="var(--success-color)" sub="Fleet deployed" />
        <KpiCard title="In Maintenance" value={kpis.vehiclesInMaintenance || 0} icon={Wrench} color="var(--warning-text)"
          borderColor="var(--warning-color)" sub="Needs attention" />
        <KpiCard title="Safety Score" value={so?.avgSafetyScore || '—'} icon={Shield} color="var(--role-safety)"
          borderColor="var(--role-safety)" sub="Avg across drivers" />
        <KpiCard title="Net Profit" value={`₹${((fa?.netProfit || 0) / 100000).toFixed(1)}L`} icon={DollarSign}
          color={(fa?.netProfit || 0) >= 0 ? 'var(--success-text)' : 'var(--error-text)'}
          borderColor={(fa?.netProfit || 0) >= 0 ? 'var(--success-color)' : 'var(--error-color)'}
          sub="Revenue − Cost" />
      </div>

      <div className="grid grid-cols-3" style={{ marginBottom: '16px' }}>
        {/* Fleet donut */}
        <div className="card">
          <SectionHeader icon={Truck} title="Fleet Status" color="var(--role-fleet)" />
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <DonutChart
              segments={[
                { label: 'Available', value: fm?.fleetState?.available || 0, color: 'var(--chart-success)' },
                { label: 'On Trip', value: fm?.fleetState?.onTrip || 0, color: 'var(--chart-info)' },
                { label: 'In Shop', value: fm?.fleetState?.inShop || 0, color: 'var(--chart-warning)' },
                { label: 'Retired', value: fm?.fleetState?.retired || 0, color: 'var(--chart-neutral)' },
              ]}
              size={140} thickness={20} centerValue={kpis.totalVehicles || 0} centerLabel="FLEET" />
          </div>
        </div>

        {/* Trip donut */}
        <div className="card">
          <SectionHeader icon={Navigation} title="Trip Status" color="var(--role-dispatcher)" />
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <DonutChart
              segments={[
                { label: 'Active', value: dp?.tripStatus?.active || 0, color: 'var(--chart-info)' },
                { label: 'Completed', value: dp?.tripStatus?.completed || 0, color: 'var(--chart-success)' },
                { label: 'Draft', value: dp?.tripStatus?.draft || 0, color: 'var(--chart-warning)' },
                { label: 'Cancelled', value: dp?.tripStatus?.cancelled || 0, color: 'var(--error-text)' },
              ]}
              size={140} thickness={20} centerValue={dp?.tripStatus?.active || 0} centerLabel="ACTIVE" />
          </div>
        </div>

        {/* Cost donut */}
        <div className="card">
          <SectionHeader icon={DollarSign} title="Cost Split" color="var(--role-finance)" />
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
            <DonutChart
              segments={[
                { label: 'Fuel', value: fa?.costBreakdown?.fuel || 0, color: 'var(--chart-info)' },
                { label: 'Maintenance', value: fa?.costBreakdown?.maintenance || 0, color: 'var(--chart-warning)' },
                { label: 'Other', value: fa?.costBreakdown?.other || 0, color: 'var(--chart-neutral)' },
              ]}
              size={140} thickness={20}
              centerValue={`₹${((fa?.totalOperationalCost || 0) / 100000).toFixed(1)}L`} centerLabel="TOTAL" />
          </div>
        </div>
      </div>

      {/* Activity tables */}
      <div className="grid grid-cols-2">
        {/* Active Trips */}
        <div className="card">
          <SectionHeader icon={Navigation} title="Active Trips" color="var(--role-dispatcher)" count={dp?.activeTrips?.length || 0} />
          {dp?.activeTrips?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {dp.activeTrips.slice(0, 5).map((t, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', backgroundColor: 'var(--bg-main)', borderRadius: '2px',
                  borderLeft: '3px solid var(--status-dispatched)'
                }}>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: '600', fontFamily: 'monospace' }}>{t.trip_code}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>{t.source} → {t.destination}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.driver_name}</span>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No active trips" />}
        </div>

        {/* Safety Alerts */}
        <div className="card">
          <SectionHeader icon={AlertTriangle} title="Safety Alerts" color="var(--role-safety)" count={so?.licenseAlerts?.length || 0} />
          {so?.licenseAlerts?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {so.licenseAlerts.slice(0, 5).map((d, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '6px 10px', backgroundColor: 'var(--bg-main)', borderRadius: '2px',
                  borderLeft: '3px solid var(--warning-text)'
                }}>
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: '600' }}>{d.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>{d.category}</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: new Date(d.expiryDate) < new Date() ? 'var(--error-text)' : 'var(--warning-text)' }}>
                    {new Date(d.expiryDate).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          ) : <EmptyState message="No safety alerts" />}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════
// MAIN DASHBOARD
// ═══════════════════════════════════════════════════

const Dashboard = ({ userRole }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = { role: userRole };
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      if (regionFilter) params.region = regionFilter;
      const res = await api.getDashboard(params);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [userRole]);

  const roleConfig = ROLE_CONFIG[userRole] || ROLE_CONFIG.ADMIN;
  const RoleIcon = roleConfig.icon;

  if (loading && !data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-muted)' }}>
      Loading dashboard…
    </div>
  );

  const kpis = data?.kpis || {};

  return (
    <div>
      {/* ── Welcome Banner ──────────────────────────── */}
      <div style={{
        background: `linear-gradient(135deg, ${roleConfig.color}14 0%, ${roleConfig.color}08 100%)`,
        border: `1px solid ${roleConfig.color}30`,
        borderRadius: 'var(--border-radius)',
        padding: '14px 20px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px'
      }}>
        <div style={{
          width: '40px', height: '40px', borderRadius: 'var(--border-radius)',
          backgroundColor: `${roleConfig.color}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: roleConfig.color
        }}>
          <RoleIcon size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', fontFamily: 'var(--font-title)' }}>
            {roleConfig.welcome}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {userRole === 'FLEET_MANAGER' && `Monitor vehicle health and maintenance cycles. Fleet utilization at ${kpis.fleetUtilization ?? 0}%.`}
            {userRole === 'DISPATCHER' && `Dispatch and track trips. ${kpis.pendingTrips ?? 0} pending trips need assignment.`}
            {userRole === 'SAFETY_OFFICER' && `Driver safety and compliance. Review expiring licenses and safety scores.`}
            {userRole === 'FINANCIAL_ANALYST' && `Operational cost analysis and vehicle ROI tracking.`}
            {userRole === 'ADMIN' && `Full operations overview — fleet, dispatch, safety, and financial metrics.`}
            {userRole === 'DRIVER' && `View your trips and safety record.`}
          </div>
        </div>
        <button className="btn btn-secondary" onClick={load} style={{ flexShrink: 0 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* ── Filters ─────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
        padding: '10px 14px', backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filters:</span>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ width: '140px', padding: '6px 10px', fontSize: '12px' }}>
          <option value="">All Types</option>
          {['Truck', 'Van', 'Flatbed', 'Refrigerated', 'Tanker', 'Box_Truck'].map(t => (
            <option key={t} value={t}>{t.replace('_', ' ')}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: '140px', padding: '6px 10px', fontSize: '12px' }}>
          <option value="">All Status</option>
          {['AVAILABLE', 'ON_TRIP', 'IN_SHOP', 'RETIRED'].map(s => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ width: '120px', padding: '6px 10px', fontSize: '12px' }}>
          <option value="">All Regions</option>
          {['West', 'East', 'North', 'South'].map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* ── Error ───────────────────────────────────── */}
      {error && (
        <div style={{
          padding: '10px 14px', backgroundColor: 'var(--error-bg)',
          border: '1px solid var(--error-border)', borderRadius: 'var(--border-radius)',
          color: 'var(--error-text)', marginBottom: '16px', fontSize: '13px'
        }}>
          Error loading dashboard: {error}
        </div>
      )}

      {/* ── Role Sections ───────────────────────────── */}
      {userRole === 'FLEET_MANAGER' && <FleetManagerSection data={data} kpis={kpis} />}
      {userRole === 'DISPATCHER' && <DispatcherSection data={data} kpis={kpis} />}
      {userRole === 'SAFETY_OFFICER' && <SafetyOfficerSection data={data} kpis={kpis} />}
      {userRole === 'FINANCIAL_ANALYST' && <FinancialAnalystSection data={data} kpis={kpis} />}
      {userRole === 'ADMIN' && <AdminSection data={data} kpis={kpis} />}

      {/* ── Footer Status Bar ───────────────────────── */}
      <div style={{
        marginTop: '20px', padding: '10px 14px', backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px'
      }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            🟢 <strong style={{ color: 'var(--text-main)' }}>{kpis.availableVehicles || 0}</strong> Available
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            🔵 <strong style={{ color: 'var(--text-main)' }}>{kpis.activeVehicles || 0}</strong> On Trip
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            🟡 <strong style={{ color: 'var(--text-main)' }}>{kpis.vehiclesInMaintenance || 0}</strong> In Shop
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            👤 <strong style={{ color: 'var(--text-main)' }}>{kpis.driversOnDuty || 0}</strong> Drivers Active
          </span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Fleet Utilization: <strong style={{ color: 'var(--accent-color)' }}>{kpis.fleetUtilization || 0}%</strong>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
