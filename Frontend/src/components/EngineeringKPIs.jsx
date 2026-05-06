import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const EngineeringKPIs = ({ stats }) => {
  const [open, setOpen] = useState(false);

  const items = [
    { key: 'psr',                   label: 'PSR',                 hint: 'Paging Success Rate',  color: '#10b981' },
    { key: 'reachability',          label: 'Reachability',        hint: 'Subscriber reachable', color: '#10b981' },
    { key: 'seizure_success',       label: 'Seizure Success',     hint: 'Calls successfully seized', color: '#3b82f6' },
    { key: 'interworking_failure',  label: 'Interworking Fail.',  hint: 'Inter-operator failures', color: '#ef4444' },
    { key: 'route_overflow_pct',    label: 'Route Overflow',      hint: 'Trunk capacity exceeded', color: '#f59e0b' },
    { key: 'user_behavior_failure', label: 'User Behavior',       hint: 'User-busy + ringing failures', color: '#a78bfa' },
    { key: 'traffic_load',          label: 'Traffic Load',        hint: 'Total call attempts', color: '#06b6d4' }
  ];

  return (
    <div style={{ marginBottom: '24px' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: '#1e293b',
          color: '#cbd5e1',
          border: '1px solid #334155',
          padding: '8px 14px',
          borderRadius: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}
      >
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Engineering KPIs ({open ? 'hide' : 'show'})
      </button>

      {open && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginTop: '12px',
          background: '#1e293b',
          padding: '16px',
          borderRadius: '10px'
        }}>
          {items.map(it => {
            const value = stats?.[it.key];
            const display = it.key === 'traffic_load'
              ? (value || 0).toLocaleString()
              : `${value ?? 0}${it.key === 'traffic_load' ? '' : '%'}`;
            return (
              <div key={it.key} style={{
                background: '#0f172a',
                padding: '12px',
                borderRadius: '8px',
                borderLeft: `3px solid ${it.color}`
              }}>
                <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>
                  {it.label}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', color: it.color, marginTop: '2px' }}>
                  {display}
                </div>
                <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                  {it.hint}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EngineeringKPIs;