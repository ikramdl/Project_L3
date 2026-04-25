import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AlertTriangle, Activity, Globe, PhoneCall } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

const Dashboard = () => {
  const [stats, setStats] = useState({ total_attempts: 0, asr: 0 });
  const [anomalies, setAnomalies] = useState([]);
  const [activeRoutes, setActiveRoutes] = useState([]);
  const [mapPoints, setMapPoints] = useState([]);

  useEffect(() => {
    const API_BASE = "http://127.0.0.1:5000/api";

    // 1. Fetch KPI Totals
    axios.get(`${API_BASE}/dashboard/stats`).then(res => setStats(res.data)).catch(e => console.error("Stats Error"));

    // 2. Fetch the 708 Anomalies
    axios.get(`${API_BASE}/dashboard/chronic-issues`).then(res => setAnomalies(res.data)).catch(e => console.error("Anomalies Error"));

    // 3. Fetch Top 5 Routes for Chart
    axios.get(`${API_BASE}/dashboard/active-routes`).then(res => setActiveRoutes(res.data)).catch(e => console.error("Routes Error"));

    // 4. Fetch the 519 Map Gateways
    axios.get(`${API_BASE}/dashboard/map`).then(res => setMapPoints(res.data)).catch(e => console.error("Map Error"));
  }, []);

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', padding: '24px', fontFamily: 'sans-serif' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity color="#ef4444" /> DJEZZY NETWORK OPS
        </h1>
        <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold' }}>
          D-1 MONITORING
        </div>
      </div>

      {/* KPI ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
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
          <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{stats.total_attempts.toLocaleString()}</div>
        </div>
        <div style={{ background: '#1e293b', padding: '20px', borderRadius: '12px', borderLeft: '5px solid #22c55e' }}>
          <div style={{ color: '#94a3b8', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Globe size={14} /> AVG ASR
          </div>
          <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#22c55e' }}>{stats.asr}%</div>
        </div>
      </div>

      {/* MAP SECTION - UNLOCKED WORLD VIEW */}
      <div style={{ background: '#1e293b', borderRadius: '16px', padding: '10px', marginBottom: '24px' }}>
        <div style={{ height: '550px', width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
          <MapContainer 
            center={[36.75, 3.05]} // Starts in Algiers
            zoom={6} 
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
            // We REMOVED maxBounds so you can move anywhere
          >
            <TileLayer 
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
              noWrap={true} // This prevents the "Multiple Algerias" repetition
              attribution='&copy; OpenStreetMap'
            />
            {mapPoints.map((point, idx) => (
              <Marker key={idx} position={[point.lat || 36.75, point.lng || 3.05]}>
                <Popup>
                  <div style={{ color: '#000' }}>
                    <strong>{point.gateway_name}</strong> <br/>
                    ASR: {point.asr}%
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* BOTTOM SECTION: CHART & TABLE */}
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
                <Bar dataKey="volume" fill="#ef4444" radius={[4, 4, 0, 0]} />
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
                  <th style={{ padding: '8px' }}>Z-SCORE</th>
                </tr>
              </thead>
              <tbody style={{ fontSize: '13px' }}>
                {anomalies.slice(0, 15).map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                    <td style={{ padding: '8px', fontFamily: 'monospace' }}>{item.gateway_name}</td>
                    <td style={{ padding: '8px', color: '#fbbf24' }}>{item.z_score?.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;