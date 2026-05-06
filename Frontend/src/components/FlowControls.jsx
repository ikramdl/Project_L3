import React from 'react';
import { Activity, Eye, EyeOff } from 'lucide-react';

/**
 * FlowControls — small floating overlay for flow visibility + severity filter.
 *
 * Props:
 *   show:        boolean — flows visible?
 *   severity:    'All' | 'Critical' | 'Warning' | 'Normal'
 *   flowCount:   number  — currently visible flow count (for the badge)
 *   totalFlows:  number  — total flows available (for the badge)
 *   onToggle:    fn(nextShow)
 *   onSeverity:  fn(nextSeverity)
 */
const FlowControls = ({
  show,
  severity,
  flowCount = 0,
  totalFlows = 0,
  onToggle,
  onSeverity
}) => {
  const wrap = {
    position: 'absolute',
    top: '12px',
    right: '12px',
    zIndex: 1000,
    background: 'rgba(15, 23, 42, 0.92)',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '10px 12px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    fontFamily: 'sans-serif',
    fontSize: '12px',
    color: 'white',
    backdropFilter: 'blur(4px)'
  };

  const toggleBtn = {
    background: show ? '#3b82f6' : '#475569',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    padding: '6px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontWeight: 'bold',
    transition: 'background 0.15s'
  };

  const select = {
    background: '#0f172a',
    color: 'white',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '6px 8px',
    fontSize: '12px',
    outline: 'none',
    cursor: show ? 'pointer' : 'not-allowed',
    opacity: show ? 1 : 0.5
  };

  const badge = {
    color: '#94a3b8',
    fontSize: '11px',
    fontFamily: 'monospace'
  };

  return (
    <div style={wrap}>
      <button style={toggleBtn} onClick={() => onToggle(!show)}>
        {show ? <Eye size={14} /> : <EyeOff size={14} />}
        {show ? 'Flows ON' : 'Flows OFF'}
      </button>

      <select
        style={select}
        value={severity}
        onChange={e => onSeverity(e.target.value)}
        disabled={!show}
      >
        <option value="All">All severities</option>
        <option value="Critical">Critical only</option>
        <option value="Warning">Warning only</option>
        <option value="Normal">Normal only</option>
      </select>

      {show && (
        <span style={badge}>
          <Activity size={11} style={{ display: 'inline', marginRight: '4px' }} />
          {flowCount} / {totalFlows}
        </span>
      )}
    </div>
  );
};

export default FlowControls;