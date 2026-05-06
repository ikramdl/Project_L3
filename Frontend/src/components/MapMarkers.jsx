import React, { useMemo } from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';

/**
 * MapMarkers — three-tier node hierarchy with corrected country coordinates.
 *
 *   Main Gateway (GW_*)   = large blue dot + pulsing halo
 *   Regional Router       = bright cyan dot
 *   Destination Country   = orange ring (placed at known capital coordinates)
 */

// Hardcoded capital coordinates for countries — the DB stores per-operator
// coordinates which are sometimes wrong, so we override with known values.
const COUNTRY_COORDS = {
  ALGERIA:        [36.7538,  3.0588],   // Algiers
  MOROCCO:        [34.0209, -6.8417],   // Rabat
  TUNISIA:        [36.8065, 10.1815],   // Tunis
  EGYPT:          [30.0444, 31.2357],   // Cairo
  LIBYA:          [32.8872, 13.1913],   // Tripoli
  FRANCE:         [48.8566,  2.3522],   // Paris
  BELGIUM:        [50.8503,  4.3517],   // Brussels
  GERMANY:        [52.5200, 13.4050],   // Berlin
  SPAIN:          [40.4168, -3.7038],   // Madrid
  ITALY:          [41.9028, 12.4964],   // Rome
  UK:             [51.5074, -0.1278],   // London
  USA:            [38.9072, -77.0369],  // Washington DC
  CANADA:         [45.4215, -75.6972],  // Ottawa
  CHINA:          [39.9042, 116.4074],  // Beijing
  INDIA:          [28.6139, 77.2090],   // New Delhi
  JAPAN:          [35.6762, 139.6503],  // Tokyo
  TURKEY:         [39.9334, 32.8597],   // Ankara
  RUSSIA:         [55.7558, 37.6173],   // Moscow
  BRAZIL:        [-15.7975, -47.8919],  // Brasília
  ARGENTINA:    [-34.6037, -58.3816],  // Buenos Aires
  AUSTRALIA:    [-35.2809, 149.1300],  // Canberra
  FINLAND:        [60.1695, 24.9354],   // Helsinki
  LUXEMBOURG:     [49.6117,  6.1300],   // Luxembourg City
  NICARAGUA:      [12.1364, -86.2514],  // Managua
  DOMINICA:       [15.3015, -61.3881],  // Roseau
  'DOMINICAN REPUBLIC': [18.4861, -69.9312],  // Santo Domingo
  // add more as you discover problem countries
};

const STYLE_ID = 'map-marker-styles-v3';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    /* MAIN GATEWAY */
    .gw-main {
      width: 22px; height: 22px;
      background: #2563eb;
      border: 3px solid #93c5fd;
      border-radius: 50%;
      box-shadow:
        0 0 0 4px rgba(37, 99, 235, 0.35),
        0 0 12px rgba(96, 165, 250, 0.6);
      cursor: pointer;
      position: relative;
    }
    .gw-main::after {
      content: '';
      position: absolute;
      top: -6px; left: -6px; right: -6px; bottom: -6px;
      border: 2px solid #60a5fa;
      border-radius: 50%;
      animation: gw-main-pulse 2s ease-out infinite;
    }
    @keyframes gw-main-pulse {
      0%   { transform: scale(0.85); opacity: 0.9; }
      100% { transform: scale(2.2);  opacity: 0;   }
    }

    /* REGIONAL ROUTER — bright cyan, visible against dark background */
    .gw-regional {
      width: 14px; height: 14px;
      background: #06b6d4;
      border: 2px solid #67e8f9;
      border-radius: 50%;
      box-shadow: 0 0 6px rgba(34, 211, 238, 0.5);
      cursor: pointer;
      transition: transform 0.15s, background 0.15s;
    }
    .gw-regional:hover {
      transform: scale(1.4);
      background: #22d3ee;
    }

    /* DESTINATION */
    .dest-marker {
      width: 14px; height: 14px;
      background: transparent;
      border: 3px solid #f97316;
      border-radius: 50%;
      cursor: pointer;
      transition: transform 0.15s, border-color 0.15s;
    }
    .dest-marker:hover {
      transform: scale(1.3);
      border-color: #fbbf24;
    }
  `;
  document.head.appendChild(s);
}

// ----- Icons -----
const mainGatewayIcon = L.divIcon({
  className: '',
  html: '<div class="gw-main"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11]
});

const regionalRouterIcon = L.divIcon({
  className: '',
  html: '<div class="gw-regional"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const destinationIcon = L.divIcon({
  className: '',
  html: '<div class="dest-marker"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

// ----- Tier classification -----
const isMainGateway = (name) => {
  if (!name) return false;
  return /^GW_/i.test(name);
};

const tierLabel = (name) =>
  isMainGateway(name) ? 'Main International Gateway' : 'Regional Router';

// Resolve country to canonical coords: hardcoded lookup → centroid fallback
const resolveCountryCoords = (country, destinations) => {
  // 1. Try hardcoded lookup
  const known = COUNTRY_COORDS[country];
  if (known) return known;

  // 2. Fallback: centroid of all destinations for this country, ignoring outliers
  const matches = destinations.filter(d =>
    d.country === country &&
    d.lat != null && d.lng != null &&
    !(d.lat === 0 && d.lng === 0)
  );
  if (matches.length === 0) return null;

  const avgLat = matches.reduce((s, d) => s + d.lat, 0) / matches.length;
  const avgLng = matches.reduce((s, d) => s + d.lng, 0) / matches.length;
  return [avgLat, avgLng];
};

const MapMarkers = ({ gateways = [], destinations = [], onSelectGateway, onSelectCountry }) => {
  // Split gateways by tier
  const { mainGateways, regionalRouters } = useMemo(() => {
    const main = [];
    const regional = [];
    gateways.forEach(g => {
      if (isMainGateway(g.gateway_name)) main.push(g);
      else regional.push(g);
    });
    return { mainGateways: main, regionalRouters: regional };
  }, [gateways]);

  // Aggregate destinations per country, with corrected coordinates
  const countryNodes = useMemo(() => {
    const map = {};
    destinations.forEach(d => {
      if (!d.country) return;
      if (!map[d.country]) {
        map[d.country] = { country: d.country, subOperators: 1 };
      } else {
        map[d.country].subOperators += 1;
      }
    });

    return Object.values(map)
      .map(c => {
        const coords = resolveCountryCoords(c.country, destinations);
        if (!coords) return null;
        return { ...c, lat: coords[0], lng: coords[1] };
      })
      .filter(Boolean);
  }, [destinations]);

  const renderGatewayMarker = (g, isMain) => (
    <Marker
      key={`gw-${g.id}`}
      position={[g.lat, g.lng]}
      icon={isMain ? mainGatewayIcon : regionalRouterIcon}
      zIndexOffset={isMain ? 1000 : 0}
      eventHandlers={{
        click: () => onSelectGateway && onSelectGateway(g)
      }}
    >
      <Popup>
        <div style={{ color: '#000', fontFamily: 'sans-serif', minWidth: '160px' }}>
          <div style={{
            fontSize: '10px', textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: isMain ? '#2563eb' : '#0891b2',
            fontWeight: 'bold',
            marginBottom: '2px'
          }}>
            {tierLabel(g.gateway_name)}
          </div>
          <strong>{g.gateway_name}</strong><br/>
          <span style={{ fontSize: '11px', color: '#64748b' }}>
            Click for router analytics
          </span>
        </div>
      </Popup>
    </Marker>
  );

  return (
    <>
      {regionalRouters.map(g => renderGatewayMarker(g, false))}
      {mainGateways.map(g => renderGatewayMarker(g, true))}

      {countryNodes.map(c => (
        <Marker
          key={`dest-${c.country}`}
          position={[c.lat, c.lng]}
          icon={destinationIcon}
          eventHandlers={{
            click: () => onSelectCountry && onSelectCountry(c.country)
          }}
        >
          <Popup>
            <div style={{ color: '#000', fontFamily: 'sans-serif' }}>
              <div style={{
                fontSize: '10px', textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: '#f97316', fontWeight: 'bold',
                marginBottom: '2px'
              }}>
                Destination Country
              </div>
              <strong>{c.country}</strong><br/>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                {c.subOperators} operator{c.subOperators > 1 ? 's' : ''} · click for country analytics
              </span>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
};

export default MapMarkers;