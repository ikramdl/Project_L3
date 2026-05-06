import React, { useState, useEffect, useRef } from 'react';
import { Bell, AlertTriangle, RefreshCw, X } from 'lucide-react';

const SEVERITY_COLORS = {
  Critical: '#ef4444',
  Warning:  '#f59e0b',
  Normal:   '#22c55e'
};

const SEVERITY_RANK = { Critical: 2, Warning: 1, Normal: 0 };

/**
 * Alerts — bell badge in the header + dropdown panel.
 *
 * Props:
 *   anomalies: array  — full list (unfiltered) from /chronic-issues
 *   onRefresh: fn()   — optional callback to re-fetch
 */
const Alerts = ({ anomalies = [], onRefresh }) => {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  // Sort: Critical first → then by |z_score| desc
  const sorted = [...anomalies].sort((a, b) => {
    const sevDiff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    if (sevDiff !== 0) return sevDiff;
    return Math.abs(b.z_score || 0) - Math.abs(a.z_score || 0);
  });

  const criticalCount = anomalies.filter(a => a.severity === 'Critical').length;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = e => {
      if (panelRef.current?.contains(e.target)) return;
      if (buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // ----- styles -----
  const wrap = { position: 'relative', display: 'inline-block' };
  const btn = {
    background: criticalCount > 0 ? '#7f1d1d' : '#334155',
    color: criticalCount > 0 ? '#fecaca' : '#cbd5e1',
    border: 'none',
    width: '40px', height: '40px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    transition: 'background 0.15s'
  };
  const badge = {
    position: 'absolute',
    top: '-2px', right: '-2px',
    background: '#ef4444',
    color: 'white',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 'bold',
    padding: '2px 6px',
    minWidth: '18px',
    textAlign: 'center',
    border: '2px solid #0f172a',
    lineHeight: '12px'
  };
  const panel = {
    position: 'absolute',
    top: '50px', right: '0',
    width: '380px', maxWidth: '90vw',
    maxHeight: '500px',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '10px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    zIndex: 2000,
    fontFamily: 'sans-serif',
    color: 'white',
    display: 'flex', flexDirection: 'column'
  };
  const header = {
    padding: '14px 16px',
    borderBottom: '1px solid #334155',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  };
  const list = { overflowY: 'auto', flex: 1 };
  const item = {
    padding: '12px 16px',
    borderBottom: '1px solid #334155',
    fontSize: '13px',
    cursor: 'default'
  };
  const empty = {
    padding: '40px 20px',
    textAlign: 'center',
    color: '#64748b',
    fontSize: '13px'
  };
  const iconBtn = {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex', alignItems: 'center'
  };

  return (
    <div style={wrap}>
      <button
        ref={buttonRef}
        style={btn}
        onClick={() => setOpen(o => !o)}
        title={`${criticalCount} critical alerts`}
        aria-label="Open alerts"
      >
        <Bell size={18} />
        {criticalCount > 0 && <span style={badge}>{criticalCount}</span>}
      </button>

      {open && (
        <div ref={panelRef} style={panel}>
          {/* Header */}
          <div style={header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} color="#ef4444" />
              <strong style={{ fontSize: '14px' }}>Alerts</strong>
              <span style={{ color: '#64748b', fontSize: '12px' }}>
                {criticalCount} critical · {anomalies.length} total
              </span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {onRefresh && (
                <button style={iconBtn} onClick={onRefresh} title="Refresh">
                  <RefreshCw size={14} />
                </button>
              )}
              <button style={iconBtn} onClick={() => setOpen(false)} title="Close">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={list}>
            {sorted.length === 0 ? (
              <div style={empty}>No anomalies detected.</div>
            ) : (
              sorted.slice(0, 20).map((a, i) => {
                const color = SEVERITY_COLORS[a.severity] || '#64748b';
                return (
                  <div
                    key={i}
                    style={{
                      ...item,
                      borderLeft: `4px solid ${color}`
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{
                        background: color,
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        textTransform: 'uppercase'
                      }}>
                        {a.severity}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '11px', fontFamily: 'monospace' }}>
                        z = {a.z_score?.toFixed(2)}
                      </span>
                    </div>
                    <div style={{ marginBottom: '4px', lineHeight: '1.4' }}>
                      {a.explanation || `${a.kpi_name} = ${a.value}`}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                      <span style={{ fontFamily: 'monospace' }}>{a.gateway_name}</span>
                      {a.country && <span> → {a.country}</span>}
                      {a.date && <span style={{ color: '#64748b' }}> · {a.date}</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {sorted.length > 20 && (
            <div style={{ padding: '8px 16px', textAlign: 'center', color: '#64748b', fontSize: '11px', borderTop: '1px solid #334155' }}>
              Showing 20 of {sorted.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Alerts;