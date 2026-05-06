import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid
} from 'recharts';

const API_BASE = "http://127.0.0.1:5000/api";

/**
 * ComparisonPanel — modal for side-by-side comparison.
 *
 * Props:
 *   open:         boolean
 *   onClose:      fn()
 *   countries:    string[] (from /filters/options)
 *   defaultDate:  string (current dashboard date)
 *   defaultCountry: string (current dashboard country, optional)
 */
const ComparisonPanel = ({ open, onClose, defaultDate, defaultCountry = '' }) => {
  const [countries, setCountries] = useState([]);
  const [country1, setCountry1] = useState(defaultCountry || '');
  const [country2, setCountry2] = useState('');
  const [date1, setDate1] = useState(defaultDate || '');
  const [date2, setDate2] = useState(defaultDate || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch country list when modal opens
  useEffect(() => {
    if (!open || countries.length > 0) return;
    axios.get(`${API_BASE}/filters/options`)
      .then(res => {
        const list = res.data.countries || [];
        setCountries(list);
        if (!country1 && list.length > 0) setCountry1(list[0]);
        if (!country2 && list.length > 1) setCountry2(list[1]);
      })
      .catch(e => console.error("Filter options error:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchComparison = () => {
    if (!country1 || !date1 || !date2) return;
    setLoading(true);
    setError(null);
    axios.get(`${API_BASE}/dashboard/compare`, {
      params: {
        country_1: country1,
        country_2: country2 || country1,
        date_1: date1,
        date_2: date2
      }
    })
      .then(res => setData(res.data))
      .catch(e => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  };

  // Auto-fetch when inputs change
  useEffect(() => {
    if (open) fetchComparison();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, country1, country2, date1, date2]);

  if (!open) return null;

  // ----- styles -----
  const overlay = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.6)',
    zIndex: 2000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'sans-serif'
  };
  const modal = {
    background: '#0f172a', color: 'white',
    width: '900px', maxWidth: '95vw',
    maxHeight: '90vh', overflowY: 'auto',
    borderRadius: '12px', padding: '24px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    position: 'relative'
  };
  const closeBtn = {
    position: 'absolute', top: '16px', right: '16px',
    background: '#334155', border: 'none', color: 'white',
    width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  };
  const inputRow = { display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' };
  const sideCard = { display: 'flex', flexDirection: 'column', gap: '6px' };
  const lbl = { fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' };
  const ctrl = {
    background: '#1e293b', color: 'white',
    border: '1px solid #334155', borderRadius: '6px',
    padding: '8px 10px', fontSize: '13px', minWidth: '160px'
  };

  const handleOverlayClick = e => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div style={overlay} onClick={handleOverlayClick}>
      <div style={modal}>
        <button style={closeBtn} onClick={onClose}><X size={18} /></button>

        <h2 style={{ margin: '0 0 4px', fontSize: '20px' }}>Comparison Mode</h2>
        <p style={{ margin: '0 0 20px', color: '#94a3b8', fontSize: '13px' }}>
          Compare two countries on the same date, or one country across two dates.
        </p>

        {/* Inputs */}
        <div style={inputRow}>
          <div style={sideCard}>
            <span style={lbl}>Side A — Country</span>
            <select style={ctrl} value={country1} onChange={e => setCountry1(e.target.value)}>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={sideCard}>
            <span style={lbl}>Side A — Date</span>
            <input type="date" style={ctrl} value={date1} onChange={e => setDate1(e.target.value)} />
          </div>
          <div style={sideCard}>
            <span style={lbl}>Side B — Country</span>
            <select style={ctrl} value={country2} onChange={e => setCountry2(e.target.value)}>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={sideCard}>
            <span style={lbl}>Side B — Date</span>
            <input type="date" style={ctrl} value={date2} onChange={e => setDate2(e.target.value)} />
          </div>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>Loading…</div>}
        {error && <div style={{ background: '#7f1d1d', padding: '12px', borderRadius: '6px', color: '#fecaca' }}>{error}</div>}

        {data && !loading && (
          <ComparisonContent data={data} />
        )}
      </div>
    </div>
  );
};

// ---------- Inner content (split for readability) ----------
const ComparisonContent = ({ data }) => {
  const { side_1, side_2, differences } = data;

  const kpiBox = {
    background: '#1e293b', padding: '12px',
    borderRadius: '8px', textAlign: 'center'
  };
  const kpiVal = { fontSize: '24px', fontWeight: 'bold' };
  const kpiLbl = { fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' };

  const renderDelta = (deltaPp, isPositiveBetter) => {
    if (deltaPp === 0) return <span style={{ color: '#64748b' }}><Minus size={14} /> 0</span>;
    const isPositive = deltaPp > 0;
    const isGood = isPositive === isPositiveBetter;
    const color = isGood ? '#22c55e' : '#ef4444';
    const Icon = isPositive ? ArrowUp : ArrowDown;
    return (
      <span style={{ color, display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
        <Icon size={14} /> {Math.abs(deltaPp)}
      </span>
    );
  };

  // Chart data — one row per KPI, two bars
  const chartData = [
    { kpi: 'ASR',        side_a: side_1.kpis.asr,              side_b: side_2.kpis.asr },
    { kpi: 'NER',        side_a: side_1.kpis.ner,              side_b: side_2.kpis.ner },
    { kpi: 'Congestion', side_a: side_1.kpis.congestion_index, side_b: side_2.kpis.congestion_index }
  ];

  const labelA = `${side_1.country} · ${side_1.date}`;
  const labelB = `${side_2.country} · ${side_2.date}`;

  return (
    <>
      {/* Side-by-side KPI cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        gap: '20px',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        {/* Side A */}
        <div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px' }}>{labelA}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div style={kpiBox}>
              <div style={kpiLbl}>ASR</div>
              <div style={{ ...kpiVal, color: '#22c55e' }}>{side_1.kpis.asr}%</div>
            </div>
            <div style={kpiBox}>
              <div style={kpiLbl}>NER</div>
              <div style={{ ...kpiVal, color: '#8b5cf6' }}>{side_1.kpis.ner}%</div>
            </div>
            <div style={kpiBox}>
              <div style={kpiLbl}>Cong.</div>
              <div style={{ ...kpiVal, color: '#f59e0b' }}>{side_1.kpis.congestion_index}%</div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px' }}>
            Attempts: {side_1.totals.call_attempts.toLocaleString()}
          </div>
        </div>

        {/* Diff column */}
        <div style={{ textAlign: 'center', padding: '0 12px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>Δ</div>
          <div style={{ marginBottom: '6px', fontSize: '13px' }}>{renderDelta(differences.asr_pp, true)}</div>
          <div style={{ marginBottom: '6px', fontSize: '13px' }}>{renderDelta(differences.ner_pp, true)}</div>
          <div style={{ marginBottom: '6px', fontSize: '13px' }}>{renderDelta(differences.congestion_index_pp, false)}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
            Volume: {differences.call_attempts_pct > 0 ? '+' : ''}{differences.call_attempts_pct}%
          </div>
        </div>

        {/* Side B */}
        <div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '8px', textAlign: 'right' }}>{labelB}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            <div style={kpiBox}>
              <div style={kpiLbl}>ASR</div>
              <div style={{ ...kpiVal, color: '#22c55e' }}>{side_2.kpis.asr}%</div>
            </div>
            <div style={kpiBox}>
              <div style={kpiLbl}>NER</div>
              <div style={{ ...kpiVal, color: '#8b5cf6' }}>{side_2.kpis.ner}%</div>
            </div>
            <div style={kpiBox}>
              <div style={kpiLbl}>Cong.</div>
              <div style={{ ...kpiVal, color: '#f59e0b' }}>{side_2.kpis.congestion_index}%</div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '8px', textAlign: 'right' }}>
            Attempts: {side_2.totals.call_attempts.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px' }}>
        <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '8px' }}>
          KPI Comparison
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="kpi" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={12} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px' }} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="side_a" name={labelA} fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="side_b" name={labelB} fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
};

export default ComparisonPanel;