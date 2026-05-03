import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = "http://127.0.0.1:5000/api";

/**
 * FilterBar — controlled component for filter state.
 * Reads `filters` from props, writes via `onChange(newFilters)`.
 * Fetches dropdown options once on mount.
 */
const FilterBar = ({ filters, onChange }) => {
  const [options, setOptions] = useState({
    countries: [],
    types: [],
    severities: [],
    latest_date: ''
  });
  const [loading, setLoading] = useState(true);

  // Fetch dropdown options once
  useEffect(() => {
    axios.get(`${API_BASE}/filters/options`)
      .then(res => {
        setOptions(res.data);
        // Initialize date to latest if not already set
        if (!filters.date && res.data.latest_date) {
          onChange({ ...filters, date: res.data.latest_date });
        }
      })
      .catch(e => console.error("Filter options error:", e))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (key, value) => {
    onChange({ ...filters, [key]: value });
  };

  const handleReset = () => {
    onChange({
      date: options.latest_date || '',
      country: '',
      type: '',
      severity: ''
    });
  };

  // ----- styles -----
  const wrap = {
    background: '#1e293b',
    padding: '16px 20px',
    borderRadius: '12px',
    marginBottom: '24px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    alignItems: 'flex-end'
  };
  const group = { display: 'flex', flexDirection: 'column', gap: '4px' };
  const label = { color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' };
  const input = {
    background: '#0f172a',
    color: 'white',
    border: '1px solid #334155',
    borderRadius: '6px',
    padding: '8px 10px',
    fontSize: '13px',
    minWidth: '140px',
    outline: 'none',
    fontFamily: 'inherit'
  };
  const resetBtn = {
    ...input,
    background: '#475569',
    cursor: 'pointer',
    fontWeight: 'bold',
    minWidth: 'auto',
    padding: '8px 16px'
  };

  if (loading) {
    return <div style={{ ...wrap, color: '#94a3b8' }}>Loading filters…</div>;
  }

  return (
    <div style={wrap}>
      {/* Date */}
      <div style={group}>
        <label style={label}>Date</label>
        <input
          type="date"
          style={input}
          value={filters.date || ''}
          onChange={e => handleChange('date', e.target.value)}
        />
      </div>

      {/* Country */}
      <div style={group}>
        <label style={label}>Country</label>
        <select
          style={input}
          value={filters.country || ''}
          onChange={e => handleChange('country', e.target.value)}
        >
          <option value="">All countries</option>
          {options.countries.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Type */}
      <div style={group}>
        <label style={label}>Type</label>
        <select
          style={input}
          value={filters.type || ''}
          onChange={e => handleChange('type', e.target.value)}
        >
          <option value="">All types</option>
          {options.types.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Severity */}
      <div style={group}>
        <label style={label}>Severity</label>
        <select
          style={input}
          value={filters.severity || ''}
          onChange={e => handleChange('severity', e.target.value)}
        >
          <option value="">All severities</option>
          {options.severities.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Reset */}
      <button style={resetBtn} onClick={handleReset}>Reset</button>

      {/* Active filter indicator */}
      <div style={{ marginLeft: 'auto', color: '#64748b', fontSize: '11px', alignSelf: 'center' }}>
        {Object.entries(filters).filter(([k, v]) => v && k !== 'date').length > 0
          ? `${Object.entries(filters).filter(([k, v]) => v && k !== 'date').length} filter(s) active`
          : 'No filters'}
      </div>
    </div>
  );
};

export default FilterBar;