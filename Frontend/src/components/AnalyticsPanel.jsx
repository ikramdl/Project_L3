import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { X, Activity, AlertTriangle, TrendingDown } from 'lucide-react';

const API_BASE = "http://127.0.0.1:5000/api";

const SEVERITY_COLORS = {
  Critical: '#ef4444',
  Warning: '#f59e0b',
  Normal: '#22c55e'
};

const FAILURE_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#3b82f6', '#06b6d4', '#84cc16'];

/**
 * AnalyticsPanel — slide-in detail panel for router or country drill-down.
 *
 * Props:
 *   target  : { type: 'router' | 'country', id?, value? } | null
 *   filters : object (inherits date/type, plus country for router only)
 *   onClose : function
 */
const AnalyticsPanel = ({ target, filters, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!target) return;

    setLoading(true);
    setError(null);
    setData(null);

    let url, params;
    if (target.type === 'router') {
      url = `${API_BASE}/dashboard/router-details`;
      params = {
        gateway_id: target.id,
        date: filters?.date || '',
        country: filters?.country || '',
        type: filters?.type || ''
      };
    } else {
      url = `${API_BASE}/dashboard/country-details`;
      params = {
        country: target.value,
        date: filters?.date || '',
        type: filters?.type || ''
      };
    }

    axios.get(url, { params })
      .then(res => setData(res.data))
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [target, filters]);

  if (!target) return null;

  // ----- styles -----
  const overlay = {
    position: 'fixed', inset: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
    display: 'flex', justifyContent: 'flex-end'
  };
  const panel = {
    width: '550px', maxWidth: '95vw', height: '100vh',
    background: '#0f172a', color: 'white',
    overflowY: 'auto', padding: '24px',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.5)',
    fontFamily: 'sans-serif'
  };
  const closeBtn = {
    position: 'absolute', top: '20px', right: '20px',
    background: '#334155', border: 'none', color: 'white',
    width: '32px', height: '32px', borderRadius: '50%',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
  };
  const section = { background: '#1e293b', padding: '16px', borderRadius: '10px', marginBottom: '16px' };
  const sectionTitle = { fontSize: '13px', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '12px', letterSpacing: '0.5px' };
  const kpiGrid = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' };
  const kpiBox = { background: '#0f172a', padding: '12px', borderRadius: '8px', textAlign: 'center' };
  const kpiLabel = { fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' };
  const kpiValue = { fontSize: '24px', fontWeight: 'bold' };

  // Click outside to close
  const handleOverlayClick = e => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div style={overlay} onClick={handleOverlayClick}>
      <div style={panel}>
        <button style={closeBtn} onClick={onClose} aria-label="Close panel">
          <X size={18} />
        </button>

        {/* HEADER */}
        <div style={{ marginBottom: '20px', paddingRight: '40px' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {target.type === 'router' ? 'Router Analytics' : 'Country Analytics'}
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 'bold', margin: '4px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity color="#3b82f6" size={22} />
            {data?.gateway?.name || data?.country || target.id || target.value}
          </h2>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading…</div>}
        {error && <div style={{ ...section, color: '#ef4444' }}>Error: {error}</div>}

        {data && (
          <>
            {/* KPI CARDS */}
            <div style={section}>
              <div style={sectionTitle}>Key KPIs</div>
              <div style={kpiGrid}>
                <div style={kpiBox}>
                  <div style={kpiLabel}>ASR</div>
                  <div style={{ ...kpiValue, color: '#22c55e' }}>{data.kpis?.asr ?? 0}%</div>
                </div>
                <div style={kpiBox}>
                  <div style={kpiLabel}>NER</div>
                  <div style={{ ...kpiValue, color: '#8b5cf6' }}>{data.kpis?.ner ?? 0}%</div>
                </div>
                <div style={kpiBox}>
                  <div style={kpiLabel}>Congestion</div>
                  <div style={{ ...kpiValue, color: '#f59e0b' }}>{data.kpis?.congestion_index ?? 0}%</div>
                </div>
              </div>
            </div>

            {/* TOTALS */}
            <div style={section}>
              <div style={sectionTitle}>Traffic Totals</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: '#94a3b8' }}>Call Attempts</span>
                <span style={{ fontWeight: 'bold' }}>{(data.totals?.call_attempts ?? 0).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '6px' }}>
                <span style={{ color: '#94a3b8' }}>Answered</span>
                <span style={{ fontWeight: 'bold' }}>{(data.totals?.answered_calls ?? 0).toLocaleString()}</span>
              </div>
            </div>

            {/* TIME-SERIES */}
            {data.timeseries && data.timeseries.length > 0 && (
              <div style={section}>
                <div style={sectionTitle}>30-Day Trend</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={data.timeseries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={10} />
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px' }} />
                    <Line type="monotone" dataKey="asr" stroke="#22c55e" name="ASR %" dot={false} />
                    <Line type="monotone" dataKey="congestion" stroke="#f59e0b" name="Congestion %" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* FAILURE DISTRIBUTION */}
            {data.failures && data.failures.length > 0 && (
              <div style={section}>
                <div style={sectionTitle}>Failure Distribution</div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.failures}
                      dataKey="count"
                      nameKey="reason"
                      cx="50%" cy="50%"
                      outerRadius={70}
                      label={({ percentage }) => `${percentage}%`}
                    >
                      {data.failures.map((_, i) => (
                        <Cell key={i} fill={FAILURE_COLORS[i % FAILURE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* TOP ROUTERS — country mode only */}
            {target.type === 'country' && data.top_routers && data.top_routers.length > 0 && (
              <div style={section}>
                <div style={sectionTitle}>Top Routers Serving This Country</div>
                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#64748b', textAlign: 'left' }}>
                      <th style={{ padding: '6px' }}>GATEWAY</th>
                      <th style={{ padding: '6px', textAlign: 'right' }}>VOLUME</th>
                      <th style={{ padding: '6px', textAlign: 'right' }}>ASR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_routers.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '6px', fontFamily: 'monospace' }}>{r.gateway_name}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{r.volume.toLocaleString()}</td>
                        <td style={{ padding: '6px', textAlign: 'right', color: r.asr < 50 ? '#ef4444' : '#22c55e' }}>{r.asr}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ANOMALIES */}
            {(() => {
              const list = target.type === 'router' ? data.anomalies : data.anomaly_summary?.recent;
              if (!list || list.length === 0) {
                return (
                  <div style={section}>
                    <div style={sectionTitle}>Anomalies</div>
                    <div style={{ color: '#94a3b8', fontSize: '13px' }}>No anomalies detected.</div>
                  </div>
                );
              }
              return (
                <div style={section}>
                  <div style={sectionTitle}>
                    Anomalies
                    {target.type === 'country' && data.anomaly_summary && (
                      <span style={{ marginLeft: '10px', color: '#ef4444', fontSize: '11px' }}>
                        ({data.anomaly_summary.critical_count} Critical · {data.anomaly_summary.warning_count} Warning)
                      </span>
                    )}
                  </div>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {list.slice(0, 10).map((a, i) => (
                      <div key={i} style={{
                        background: '#0f172a', padding: '10px',
                        borderRadius: '6px', marginBottom: '8px',
                        borderLeft: `3px solid ${SEVERITY_COLORS[a.severity] || '#94a3b8'}`
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
                          <span>
                            <AlertTriangle size={11} style={{ display: 'inline', marginRight: '4px', color: SEVERITY_COLORS[a.severity] }} />
                            {a.severity} · {a.kpi_name?.toUpperCase()}
                          </span>
                          <span>z = {a.z_score?.toFixed(2)}</span>
                        </div>
                        <div style={{ fontSize: '13px', marginTop: '4px' }}>
                          {a.explanation || `${a.kpi_name} = ${a.value}`}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          {target.type === 'router' ? a.country : a.gateway_name} · {a.date}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
};

export default AnalyticsPanel;