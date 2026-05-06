import React, { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-polylinedecorator';

const COLORS = {
  Critical: '#ef4444',
  Warning:  '#f59e0b',
  Normal:   '#22c55e'
};

const CRITICAL_BRIGHT = '#ff6b6b';

const STYLE_ID = 'flow-layer-styles-v4';
const injectStyles = () => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .flow-dimmed { opacity: 0.1 !important; }
  `;
  document.head.appendChild(style);
};

function buildCurvePoints(src, dst, steps) {
  if (!steps) steps = 16;
  const lat1 = src[0];
  const lng1 = src[1];
  const lat2 = dst[0];
  const lng2 = dst[1];
  const midLat = (lat1 + lat2) / 2;
  const midLng = (lng1 + lng2) / 2;
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const dist = Math.sqrt(dLat * dLat + dLng * dLng);
  const offset = dist * 0.2;
  const perpLat = -dLng;
  const perpLng = dLat;
  const norm = Math.sqrt(perpLat * perpLat + perpLng * perpLng) || 1;
  const ctrlLat = midLat + (perpLat / norm) * offset;
  const ctrlLng = midLng + (perpLng / norm) * offset;

  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const lat = u * u * lat1 + 2 * u * t * ctrlLat + t * t * lat2;
    const lng = u * u * lng1 + 2 * u * t * ctrlLng + t * t * lng2;
    pts.push([lat, lng]);
  }
  return pts;
}

const ARROW_PARAMS = {
  Critical: { repeat: 80,  speed: 3 },
  Warning:  { repeat: 120, speed: 2 },
  Normal:   { repeat: 180, speed: 1 }
};

const FlowLayer = ({ flows = [] }) => {
  const map = useMap();
  const layersRef = useRef({});
  const intervalRef = useRef(null);
  const offsetRef = useRef(0);
  const [selectedKey, setSelectedKey] = useState(null);

  useEffect(() => { injectStyles(); }, []);

  useEffect(() => {
    Object.values(layersRef.current).forEach(({ curve, decorator }) => {
      if (decorator && map.hasLayer(decorator)) map.removeLayer(decorator);
      if (curve && map.hasLayer(curve)) map.removeLayer(curve);
    });
    layersRef.current = {};

    if (!flows || flows.length === 0) return;

    const order = { Normal: 0, Warning: 1, Critical: 2 };
    const sorted = [...flows].sort((a, b) =>
      (order[a.severity] || 0) - (order[b.severity] || 0)
    );

    sorted.forEach(flow => {
      if (!Array.isArray(flow.source) || !Array.isArray(flow.target)) return;
      if (flow.source.length !== 2 || flow.target.length !== 2) return;

      const key = `${flow.source_id}-${flow.target_id}`;
      const baseColor = COLORS[flow.severity] || '#94a3b8';
      const color = flow.severity === 'Critical' ? CRITICAL_BRIGHT : baseColor;
      const baseWeight = 1.2 + (flow.normalized_volume || 0) * 3.5;
      const weight = flow.severity === 'Critical' ? baseWeight + 1 : baseWeight;

      const points = buildCurvePoints(flow.source, flow.target, 16);

      const curve = L.polyline(points, {
        color: color,
        weight: weight,
        opacity: 0.7,
        smoothFactor: 1.5
      });

      const params = ARROW_PARAMS[flow.severity] || ARROW_PARAMS.Normal;
      const arrowSymbol = L.Symbol.arrowHead({
        pixelSize: flow.severity === 'Critical' ? 11 : 8,
        polygon: false,
        pathOptions: {
          stroke: true,
          color: color,
          weight: 2,
          opacity: 0.95
        }
      });

      const decorator = L.polylineDecorator(curve, {
        patterns: [{
          offset: 0,
          repeat: params.repeat,
          symbol: arrowSymbol
        }]
      });

      curve.on('click', e => {
        L.DomEvent.stopPropagation(e);
        setSelectedKey(prev => prev === key ? null : key);
      });

      curve.bindTooltip(
        '<div style="font-size:12px;line-height:1.5;font-family:sans-serif">' +
        '<strong style="color:' + color + '">' + flow.severity + '</strong><br/>' +
        'Volume: <b>' + (flow.volume || 0).toLocaleString() + '</b><br/>' +
        'ASR: ' + flow.asr + '%' +
        '</div>',
        { sticky: true }
      );

      curve.addTo(map);
      decorator.addTo(map);

      layersRef.current[key] = { curve, decorator, params, weight, arrowSymbol };
    });

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const layers = layersRef.current;
      if (!layers || Object.keys(layers).length === 0) return;
      offsetRef.current = (offsetRef.current + 1) % 1000;

      Object.values(layers).forEach(({ decorator, params, arrowSymbol }) => {
        if (!decorator || !decorator._map) return;
        try {
          const px = (offsetRef.current * params.speed) % 200;
          decorator.setPatterns([{
            offset: px,
            repeat: params.repeat,
            symbol: arrowSymbol
          }]);
        } catch (err) {
          // ignore
        }
      });
    }, 250);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      Object.values(layersRef.current).forEach(({ curve, decorator }) => {
        if (decorator && map.hasLayer(decorator)) map.removeLayer(decorator);
        if (curve && map.hasLayer(curve)) map.removeLayer(curve);
      });
      layersRef.current = {};
    };
  }, [flows, map]);

  useEffect(() => {
    Object.entries(layersRef.current).forEach(([key, { curve, decorator, weight }]) => {
      if (!curve || !decorator) return;
      const isSelected = selectedKey === key;
      const anySelected = selectedKey !== null;

      try {
        if (anySelected && !isSelected) {
          curve.setStyle({ opacity: 0.1, weight });
          const el = decorator.getElement();
          if (el) el.classList.add('flow-dimmed');
        } else {
          curve.setStyle({
            opacity: isSelected ? 1 : 0.7,
            weight: isSelected ? weight + 2 : weight
          });
          const el = decorator.getElement();
          if (el) el.classList.remove('flow-dimmed');
          if (isSelected) {
            curve.bringToFront();
            decorator.bringToFront();
          }
        }
      } catch (err) {
        // ignore
      }
    });
  }, [selectedKey]);

  return null;
};

export default FlowLayer;