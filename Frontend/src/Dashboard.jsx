import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AlertTriangle, Activity, Globe, PhoneCall } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import FilterBar from './components/FilterBar';
import AnalyticsPanel from './components/AnalyticsPanel';

const API_BASE = "http://127.0.0.1:5000/api";

const Dashboard = () => {
  const [filters, setFilters] = useState({
    date: '',
    country: '',
    type: '',
    severity: ''
  });

  const [stats, setStats] = useState({ total_attempts: 0, asr: 0, ner: 0, congestion_index: 0 });
  const [anomalies, setAnomalies] = useState([]);
  const [activeRoutes, setActiveRoutes] = useState([]);
  const [mapPoints, setMapPoints] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState(null);

  // Refetch all data whenever filters change
  useEffect(() => {
    // Skip the very first render where filters.date is empty (FilterBar will set it once options load)
    if (!filters.date) return;

    const params = filters;

    axios.get(`${API_BASE}/dashboard/stats`, { params })
      .then(res => setStats(res.data))
      .catch(e => console.error("Stats Error", e));

    axios.get(`${API_BASE}/dashboard/chronic-issues`, { params })
      .then(res => setAnomalies(res.data))
      .catch(e => console.error("Anomalies Error", e));

    axios.get(`${API_BASE}/dashboard/active-routes`, { params })
      .then(res => setActiveRoutes(res.data))
      .catch(e => console.error("Routes Error", e));

    axios.get(`${API_BASE}/dashboard/map`, { params })
      .then(res => setMapPoints(res.data.gateways || []))
      .catch(e => console.error("Map Error", e));
  }, [filters]);

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', padding: '24px', fontFamily: 'sans-serif' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity color="#ef4444" /> DJEZZY NETWORK OPS
        </h1>
        <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
          D-1 MONITORING
        </div>
      </div>

      {/* FILTER BAR */}
      <FilterBar filters={filters} onChange={setFilters} />

      {/* KPI ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #ef4444' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <AlertTriangle size={14} /> ANOMALIES FOUND
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#ef4444' }}>{anomalies.length}</div>
        </div>
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #3b82f6' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <PhoneCall size={14} /> TOTAL CALLS
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>
            {(stats.total_attempts || 0).toLocaleString()}
          </div>
        </div>
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #22c55e' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Globe size={14} /> AVG ASR
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#22c55e' }}>{stats.asr}%</div>
        </div>
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #8b5cf6' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px' }}>NER</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#8b5cf6' }}>{stats.ner}%</div>
        </div>
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #f59e0b' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px' }}>CONGESTION</div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#f59e0b' }}>{stats.congestion_index}%</div>
        </div>
      </div>

      {/* MAP */}
      <div style={{ background: '#1e293b', borderRadius: '16px', padding: '10px', marginBottom: '24px' }}>
        <div style={{ height: '550px', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
          <MapContainer
            center={[36.75, 3.05]}
            zoom={6}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              noWrap={true}
              attribution='&copy; OpenStreetMap'
            />
            {mapPoints.map((point, idx) => (
              <Marker
                key={idx}
                position={[point.lat || 36.75, point.lng || 3.05]}
                eventHandlers={{
                  click: () => setSelectedTarget({ type: 'router', id: point.id })
                }}
              >
                <Popup>
                  <div style={{ color: '#000' }}>
                    <strong>{point.gateway_name}</strong><br/>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Click marker for details</span>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* BOTTOM: CHART + TABLE */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>

        {/* CHART */}
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '15px' }}>Traffic Volume (Top 5)</h2>
          <div style={{ height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activeRoutes}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="destination" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip contentStyle={{ background: '#0f172a', border: 'none', borderRadius: '8px' }} />
                <Bar
                  dataKey="volume"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(d) => setSelectedTarget({ type: 'country', value: d.destination })}
                />              
                </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TABLE */}
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px' }}>
          <h2 style={{ fontSize: '16px', marginBottom: '15px', color: '#ef4444' }}>Critical Anomalies</h2>
          <div style={{ overflowY: 'auto', maxHeight: '300px' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#1e293b', color: '#64748b', fontSize: '11px' }}>
                <tr>
                  <th style={{ padding: '8px' }}>GATEWAY</th>
                  <th style={{ padding: '8px' }}>KPI</th>
                  <th style={{ padding: '8px' }}>Z-SCORE</th>
                  <th style={{ padding: '8px' }}>SEVERITY</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: '13px' }}>
                {anomalies.slice(0, 15).map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{item.gateway_name}</td>
                    <td style={{ padding: '8px', color: '#94a3b8' }}>{item.kpi_name}</td>
                    <td style={{ padding: '8px', color: '#fbbf24' }}>{item.z_score?.toFixed(2)}</td>
                    <td style={{ padding: '8px', color: item.severity === 'Critical' ? '#ef4444' : '#f59e0b' }}>
                      {item.severity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
      <AnalyticsPanel
        target={selectedTarget}
        filters={filters}
        onClose={() => setSelectedTarget(null)}
      />
    </div>
  );
};

export default Dashboard;