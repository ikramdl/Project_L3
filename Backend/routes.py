from flask import jsonify, request
from app import app, db
from models import Gateway, Destination, Anomaly, TrafficStat
from sqlalchemy import func, and_
from datetime import datetime, timedelta
import math

def get_latest_date():
    """Auto-pick the most recent date in traffic_stats (D-1 logic)."""
    latest = db.session.query(func.max(TrafficStat.date)).scalar()
    return str(latest) if latest else "2026-04-22"


def parse_filters():
    """
    Read filter query params once. Returns a dict with:
      date, country, type, severity
    Empty/missing values become None (= filter not applied).
    """
    return {
        'date':     request.args.get('date') or get_latest_date(),
        'country':  (request.args.get('country') or '').strip().upper() or None,
        'type':     (request.args.get('type') or '').strip().upper() or None,
        'severity': (request.args.get('severity') or '').strip() or None,
    }


def apply_traffic_filters(query, f, joined_destination=False):
    """
    Apply filters to a query that involves TrafficStat (and optionally Destination).
    `f` is the dict from parse_filters().
    `joined_destination` tells us whether Destination is already in the FROM clause.
    """
    query = query.filter(TrafficStat.date == f['date'])

    if f['country'] or f['type']:
        if not joined_destination:
            query = query.join(Destination, Destination.id == TrafficStat.dest_id)
        if f['country']:
            query = query.filter(Destination.country == f['country'])
        if f['type']:
            query = query.filter(Destination.dest_type == f['type'])

    return query


# ============================================================
# 1. GLOBAL STATS — KPI cards
# ============================================================
@app.route('/api/dashboard/stats', methods=['GET'])
def get_global_stats():
    """
    Network-wide KPI aggregates.
    Filters: date, country, type
    """
    f = parse_filters()

    q = db.session.query(
        func.sum(TrafficStat.call_attempts).label('total_attempts'),
        func.sum(TrafficStat.answered_calls).label('total_answered'),
        func.sum(TrafficStat.interworking_fail).label('total_fail'),
        func.sum(TrafficStat.seizure_traffic).label('total_seizure'),
        func.sum(TrafficStat.connected_traffic).label('total_connected'),
        func.sum(TrafficStat.congestion_times).label('total_congestion')
    )
    q = apply_traffic_filters(q, f)
    stats = q.first()

    attempts   = stats.total_attempts   or 0
    answered   = stats.total_answered   or 0
    seizure    = stats.total_seizure    or 0
    connected  = stats.total_connected  or 0
    congestion = stats.total_congestion or 0

    asr = (answered  / attempts * 100) if attempts > 0 else 0
    ner = (connected / seizure  * 100) if seizure  > 0 else 0
    congestion_index = (congestion / attempts * 100) if attempts > 0 else 0

    return jsonify({
        "date": f['date'],
        "filters_applied": {k: v for k, v in f.items() if v and k != 'date'},
        "total_attempts": int(attempts),
        "asr": round(float(asr), 2),
        "ner": round(float(ner), 2),
        "congestion_index": round(float(congestion_index), 2),
        "failures": int(stats.total_fail or 0)
    })


# ============================================================
# 2. MAP DATA — gateways, destinations, flows (UPGRADED)
# ============================================================
@app.route('/api/dashboard/map', methods=['GET'])
def get_map_data():
    """
    Returns network visualization data: gateways, destinations, flows.

    Severity rules (in priority order):
      1. If (gateway, destination) has a row in `anomalies` for this date
         -> use stored severity
      2. Else if ASR < 50%   -> 'Critical'
      3. Else if ASR < 70%   -> 'Warning'
      4. Else                -> 'Normal'

    Flow selection (anti-overload):
      - Top N flows by volume (default 100, configurable via ?limit=)
      - PLUS every flow with severity == 'Critical' or 'Warning'
        (so anomalies are never hidden, even if low-volume)

    normalized_volume:
      - log-scaled min-max normalization across the returned flows
      - range [0, 1], suitable for direct mapping to Leaflet line weight

    Filters: date, country, type, severity
    """
    f = parse_filters()
    limit = int(request.args.get('limit', 100))

    def valid_coords(lat, lng):
        if lat is None or lng is None:
            return False
        if lat == 0 and lng == 0:
            return False
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            return False
        return True

    # ----- 1. Anomaly lookup -----
    severity_rank = {'Critical': 2, 'Warning': 1}
    anomaly_q = db.session.query(
        Anomaly.gateway_id, Anomaly.dest_id, Anomaly.severity
    ).filter(Anomaly.date == f['date'])

    anomaly_map = {}
    for a in anomaly_q.all():
        key = (a.gateway_id, a.dest_id)
        prev = anomaly_map.get(key)
        if prev is None or severity_rank.get(a.severity, 0) > severity_rank.get(prev, 0):
            anomaly_map[key] = a.severity

    # ----- 2. Aggregate traffic per (gateway, destination) -----
    q = db.session.query(
        Gateway.id.label('gw_id'),
        Gateway.name.label('gw_name'),
        Gateway.x.label('gw_lat'),
        Gateway.y.label('gw_lng'),
        Destination.id.label('dest_id'),
        Destination.name.label('dest_name'),
        Destination.country.label('dest_country'),
        Destination.dest_type.label('dest_type'),
        Destination.x.label('dest_lat'),
        Destination.y.label('dest_lng'),
        func.sum(TrafficStat.call_attempts).label('volume'),
        func.sum(TrafficStat.answered_calls).label('answered'),
        func.sum(TrafficStat.congestion_times).label('congestion')
    ).join(TrafficStat, Gateway.id == TrafficStat.gateway_id)\
     .join(Destination, Destination.id == TrafficStat.dest_id)\
     .filter(TrafficStat.date == f['date'])\
     .filter(TrafficStat.call_attempts > 0)

    if f['country']:
        q = q.filter(Destination.country == f['country'])
    if f['type']:
        q = q.filter(Destination.dest_type == f['type'])

    q = q.group_by(
        Gateway.id, Gateway.name, Gateway.x, Gateway.y,
        Destination.id, Destination.name, Destination.country,
        Destination.dest_type, Destination.x, Destination.y
    )

    rows = q.all()

    # ----- 3. Build raw flows with computed severity -----
    raw_flows = []
    for r in rows:
        if not (valid_coords(r.gw_lat, r.gw_lng) and valid_coords(r.dest_lat, r.dest_lng)):
            continue

        volume = int(r.volume or 0)
        answered = int(r.answered or 0)
        congestion = int(r.congestion or 0)
        asr = round((answered / volume * 100), 2) if volume > 0 else 0.0

        severity = anomaly_map.get((r.gw_id, r.dest_id))
        if severity is None:
            if asr < 50:
                severity = 'Critical'
            elif asr < 70:
                severity = 'Warning'
            else:
                severity = 'Normal'

        if f['severity'] and severity != f['severity']:
            continue

        raw_flows.append({
            "_row": r,
            "volume": volume,
            "asr": asr,
            "congestion": congestion,
            "severity": severity
        })

    # ----- 4. Select top-N flows + always include all anomalies -----
    raw_flows.sort(key=lambda x: x['volume'], reverse=True)
    top_volume = raw_flows[:limit]
    anomaly_extras = [
        x for x in raw_flows[limit:]
        if x['severity'] in ('Critical', 'Warning')
    ]
    selected = top_volume + anomaly_extras

    # ----- 5. Log-scaled min-max normalization on selected flows -----
    if selected:
        log_vols = [math.log1p(x['volume']) for x in selected]  # log1p handles 0 safely
        lo, hi = min(log_vols), max(log_vols)
        span = hi - lo if hi > lo else 1.0
    else:
        lo, span = 0, 1.0

    # ----- 6. Build response collections -----
    gateways = {}
    destinations = {}
    flows = []

    for x in selected:
        r = x['_row']
        norm = (math.log1p(x['volume']) - lo) / span
        norm = round(max(0.0, min(1.0, norm)), 4)

        if r.gw_id not in gateways:
            gateways[r.gw_id] = {
                "id": r.gw_id,
                "gateway_name": r.gw_name,
                "lat": float(r.gw_lat),
                "lng": float(r.gw_lng)
            }

        if r.dest_id not in destinations:
            destinations[r.dest_id] = {
                "id": r.dest_id,
                "name": r.dest_name,
                "country": r.dest_country,
                "type": r.dest_type,
                "lat": float(r.dest_lat),
                "lng": float(r.dest_lng)
            }

        flows.append({
            "source_id": r.gw_id,
            "target_id": r.dest_id,
            "source": [float(r.gw_lat), float(r.gw_lng)],
            "target": [float(r.dest_lat), float(r.dest_lng)],
            "volume": x['volume'],
            "normalized_volume": norm,
            "asr": x['asr'],
            "congestion": x['congestion'],
            "severity": x['severity']
        })

    return jsonify({
        "date": f['date'],
        "filters_applied": {k: v for k, v in f.items() if v and k != 'date'},
        "stats": {
            "total_flows_in_data": len(raw_flows),
            "flows_returned": len(flows),
            "limit": limit
        },
        "gateways": list(gateways.values()),
        "destinations": list(destinations.values()),
        "flows": flows
    })


# ============================================================
# 3. ACTIVE ROUTES — top destinations by volume
# ============================================================
@app.route('/api/dashboard/active-routes', methods=['GET'])
def get_active_routes():
    """
    Top N destination countries by volume.
    Filters: date, country, type
    """
    f = parse_filters()
    limit = int(request.args.get('limit', 5))

    q = db.session.query(
        Destination.country.label('destination'),
        func.sum(TrafficStat.call_attempts).label('volume'),
        func.sum(TrafficStat.answered_calls).label('answered')
    ).join(TrafficStat, Destination.id == TrafficStat.dest_id)\
     .filter(TrafficStat.date == f['date'])\
     .filter(TrafficStat.call_attempts > 0)

    if f['country']:
        q = q.filter(Destination.country == f['country'])
    if f['type']:
        q = q.filter(Destination.dest_type == f['type'])

    q = q.group_by(Destination.country)\
         .order_by(func.sum(TrafficStat.call_attempts).desc())\
         .limit(limit)

    rows = q.all()

    result = []
    for r in rows:
        volume = int(r.volume or 0)
        answered = int(r.answered or 0)
        asr = round((answered / volume * 100), 2) if volume > 0 else 0.0
        result.append({
            "destination": r.destination or "UNKNOWN",
            "volume": volume,
            "asr": asr
        })

    return jsonify(result)


# ============================================================
# 4. CHRONIC ISSUES — anomalies table
# ============================================================
@app.route('/api/dashboard/chronic-issues', methods=['GET'])
def get_chronic_issues():
    """
    Reads precomputed anomalies.
    Filters: date, country, type, severity
    """
    f = parse_filters()
    limit = int(request.args.get('limit', 50))

    q = db.session.query(
        Anomaly.date,
        Anomaly.kpi_name,
        Anomaly.value,
        Anomaly.z_score,
        Anomaly.severity,
        Gateway.name.label('gateway_name'),
        Destination.country.label('country'),
        Destination.dest_type.label('type')
    ).join(Gateway, Anomaly.gateway_id == Gateway.id)\
     .join(Destination, Anomaly.dest_id == Destination.id)

    # Anomaly date filter is optional — by default we show all chronic issues,
    # not just the latest day. If frontend explicitly sends ?date=, we filter.
    if request.args.get('date'):
        q = q.filter(Anomaly.date == f['date'])

    if f['country']:
        q = q.filter(Destination.country == f['country'])
    if f['type']:
        q = q.filter(Destination.dest_type == f['type'])
    if f['severity'] in ('Critical', 'Warning'):
        q = q.filter(Anomaly.severity == f['severity'])

    rows = q.order_by(func.abs(Anomaly.z_score).desc()).limit(limit).all()

    return jsonify([
        {
            "gateway_name": r.gateway_name,
            "country": r.country,
            "type": r.type,
            "kpi_name": r.kpi_name,
            "value": round(float(r.value), 2) if r.value is not None else None,
            "z_score": round(float(r.z_score), 2) if r.z_score is not None else None,
            "severity": r.severity,
            "date": str(r.date) if r.date else None
        }
        for r in rows
    ])


# ============================================================
# 5. FILTER OPTIONS — dropdown values
# ============================================================
@app.route('/api/filters/options', methods=['GET'])
def get_filter_options():
    """
    Provides dropdown values for the filter bar.
    Includes available types and severities so frontend doesn't hardcode them.
    """
    gateways = db.session.query(Gateway.name).order_by(Gateway.name).all()
    countries = db.session.query(Destination.country)\
        .filter(Destination.country.isnot(None))\
        .distinct().order_by(Destination.country).all()
    types = db.session.query(Destination.dest_type)\
        .filter(Destination.dest_type.isnot(None))\
        .distinct().all()

    return jsonify({
        "gateways": [g[0] for g in gateways],
        "countries": [c[0] for c in countries],
        "types": [t[0] for t in types],
        "severities": ["Critical", "Warning"],
        "latest_date": get_latest_date()
    })


    # ============================================================
# 6. ROUTER DETAILS — drill-down view for a single gateway
# ============================================================
@app.route('/api/dashboard/router-details', methods=['GET'])
def get_router_details():
    """
    Full analytics for a single gateway.
    Required: gateway_id
    Optional: date (default: latest), country, type
    Returns: gateway info, KPIs, totals, 30-day time-series,
             failure distribution, related anomalies.
    """
    # ----- 1. Validate input -----
    gw_id_raw = request.args.get('gateway_id')
    if not gw_id_raw:
        return jsonify({"error": "gateway_id is required"}), 400

    try:
        gateway_id = int(gw_id_raw)
    except ValueError:
        return jsonify({"error": "gateway_id must be an integer"}), 400

    gateway = db.session.query(Gateway).filter(Gateway.id == gateway_id).first()
    if not gateway:
        return jsonify({"error": f"gateway {gateway_id} not found"}), 404

    f = parse_filters()  # gives us date, country, type, severity (severity ignored here)

    # ----- 2. KPIs + Totals (single query, same scope) -----
    base_q = db.session.query(
        func.sum(TrafficStat.call_attempts).label('attempts'),
        func.sum(TrafficStat.answered_calls).label('answered'),
        func.sum(TrafficStat.seizure_traffic).label('seizure'),
        func.sum(TrafficStat.connected_traffic).label('connected'),
        func.sum(TrafficStat.congestion_times).label('congestion'),
        func.sum(TrafficStat.interworking_fail).label('interworking'),
        func.sum(TrafficStat.paging_no_response).label('paging'),
        func.sum(TrafficStat.route_overflow).label('route_overflow'),
        func.sum(TrafficStat.user_busy).label('user_busy'),
        func.sum(TrafficStat.absent_subscriber).label('absent')
    ).filter(TrafficStat.gateway_id == gateway_id)

    base_q = apply_traffic_filters(base_q, f)
    t = base_q.first()

    attempts   = int(t.attempts   or 0)
    answered   = int(t.answered   or 0)
    seizure    = float(t.seizure  or 0)
    connected  = float(t.connected or 0)
    congestion = int(t.congestion or 0)

    asr = round((answered  / attempts * 100), 2) if attempts > 0 else 0.0
    ner = round((connected / seizure  * 100), 2) if seizure  > 0 else 0.0
    cgi = round((congestion / attempts * 100), 2) if attempts > 0 else 0.0

    kpis = {"asr": asr, "ner": ner, "congestion_index": cgi}

    totals = {
        "call_attempts":     attempts,
        "answered_calls":    answered,
        "seizure_traffic":   round(seizure, 2),
        "connected_traffic": round(connected, 2)
    }

    # ----- 3. Time-series: last 30 days ending at f['date'] -----
    try:
        end_date = datetime.strptime(f['date'], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=29)

    ts_q = db.session.query(
        TrafficStat.date.label('date'),
        func.sum(TrafficStat.call_attempts).label('attempts'),
        func.sum(TrafficStat.answered_calls).label('answered')
    ).filter(TrafficStat.gateway_id == gateway_id)\
     .filter(TrafficStat.date >= start_date)\
     .filter(TrafficStat.date <= end_date)

    if f['country'] or f['type']:
        ts_q = ts_q.join(Destination, Destination.id == TrafficStat.dest_id)
        if f['country']:
            ts_q = ts_q.filter(Destination.country == f['country'])
        if f['type']:
            ts_q = ts_q.filter(Destination.dest_type == f['type'])

    ts_rows = ts_q.group_by(TrafficStat.date).order_by(TrafficStat.date).all()

    timeseries = []
    for r in ts_rows:
        a = int(r.attempts or 0)
        ans = int(r.answered or 0)
        timeseries.append({
            "date": str(r.date),
            "volume": a,
            "asr": round((ans / a * 100), 2) if a > 0 else 0.0
        })

    # ----- 4. Failure distribution -----
    failure_buckets = [
        ("Interworking",     int(t.interworking   or 0)),
        ("Peer Congestion",  congestion),
        ("Paging Timeout",   int(t.paging         or 0)),
        ("Route Overflow",   int(t.route_overflow or 0)),
        ("User Busy",        int(t.user_busy      or 0)),
        ("Absent Subscriber",int(t.absent         or 0)),
    ]
    fail_total = sum(c for _, c in failure_buckets)
    failures = [
        {
            "reason": name,
            "count": count,
            "percentage": round((count / fail_total * 100), 2) if fail_total > 0 else 0.0
        }
        for name, count in failure_buckets if count > 0
    ]
    failures.sort(key=lambda x: x['count'], reverse=True)

    # ----- 5. Related anomalies -----
    anom_q = db.session.query(
        Anomaly.date,
        Anomaly.kpi_name,
        Anomaly.value,
        Anomaly.z_score,
        Anomaly.severity,
        Destination.country.label('country')
    ).join(Destination, Anomaly.dest_id == Destination.id)\
     .filter(Anomaly.gateway_id == gateway_id)

    if f['country']:
        anom_q = anom_q.filter(Destination.country == f['country'])
    if f['type']:
        anom_q = anom_q.filter(Destination.dest_type == f['type'])

    anom_rows = anom_q.order_by(func.abs(Anomaly.z_score).desc()).limit(20).all()

    anomalies = [
        {
            "date": str(a.date) if a.date else None,
            "country": a.country,
            "kpi_name": a.kpi_name,
            "value": round(float(a.value), 2) if a.value is not None else None,
            "z_score": round(float(a.z_score), 2) if a.z_score is not None else None,
            "severity": a.severity
        }
        for a in anom_rows
    ]

    # ----- 6. Final response -----
    return jsonify({
        "gateway": {
            "id": gateway.id,
            "name": gateway.name,
            "lat": float(gateway.x) if gateway.x is not None else None,
            "lng": float(gateway.y) if gateway.y is not None else None
        },
        "date": f['date'],
        "filters_applied": {k: v for k, v in f.items() if v and k != 'date'},
        "kpis": kpis,
        "totals": totals,
        "timeseries": timeseries,
        "failures": failures,
        "anomalies": anomalies
    })


# ============================================================
# 7. COUNTRY DETAILS — drill-down view for a single country
# ============================================================
@app.route('/api/dashboard/country-details', methods=['GET'])
def get_country_details():
    """
    Full analytics for a single destination country.
    Required: country
    Optional: date (default: latest), type
    Returns: country info, KPIs, totals, top routers,
             30-day time-series, failure distribution, anomalies.
    """
    # ----- 1. Validate input -----
    country_raw = (request.args.get('country') or '').strip().upper()
    if not country_raw:
        return jsonify({"error": "country is required"}), 400

    exists = db.session.query(Destination.id)\
        .filter(Destination.country == country_raw).first()
    if not exists:
        return jsonify({"error": f"country '{country_raw}' not found"}), 404

    # Override the parsed country with our validated/uppercased value
    f = parse_filters()
    f['country'] = country_raw

    # ----- 2. KPIs + Totals -----
    base_q = db.session.query(
        func.sum(TrafficStat.call_attempts).label('attempts'),
        func.sum(TrafficStat.answered_calls).label('answered'),
        func.sum(TrafficStat.seizure_traffic).label('seizure'),
        func.sum(TrafficStat.connected_traffic).label('connected'),
        func.sum(TrafficStat.congestion_times).label('congestion'),
        func.sum(TrafficStat.interworking_fail).label('interworking'),
        func.sum(TrafficStat.paging_no_response).label('paging'),
        func.sum(TrafficStat.route_overflow).label('route_overflow'),
        func.sum(TrafficStat.user_busy).label('user_busy'),
        func.sum(TrafficStat.absent_subscriber).label('absent')
    )
    base_q = apply_traffic_filters(base_q, f)
    t = base_q.first()

    attempts   = int(t.attempts   or 0)
    answered   = int(t.answered   or 0)
    seizure    = float(t.seizure  or 0)
    connected  = float(t.connected or 0)
    congestion = int(t.congestion or 0)

    asr = round((answered  / attempts * 100), 2) if attempts > 0 else 0.0
    ner = round((connected / seizure  * 100), 2) if seizure  > 0 else 0.0
    cgi = round((congestion / attempts * 100), 2) if attempts > 0 else 0.0

    kpis = {"asr": asr, "ner": ner, "congestion_index": cgi}

    totals = {
        "call_attempts":     attempts,
        "answered_calls":    answered,
        "seizure_traffic":   round(seizure, 2),
        "connected_traffic": round(connected, 2)
    }

    # ----- 3. Top routers serving this country -----
    limit = int(request.args.get('limit', 10))
    top_q = db.session.query(
        Gateway.id.label('gw_id'),
        Gateway.name.label('gw_name'),
        func.sum(TrafficStat.call_attempts).label('volume'),
        func.sum(TrafficStat.answered_calls).label('answered')
    ).join(TrafficStat, Gateway.id == TrafficStat.gateway_id)\
     .join(Destination, Destination.id == TrafficStat.dest_id)\
     .filter(TrafficStat.date == f['date'])\
     .filter(Destination.country == country_raw)\
     .filter(TrafficStat.call_attempts > 0)

    if f['type']:
        top_q = top_q.filter(Destination.dest_type == f['type'])

    top_rows = top_q.group_by(Gateway.id, Gateway.name)\
                    .order_by(func.sum(TrafficStat.call_attempts).desc())\
                    .limit(limit).all()

    top_routers = []
    for r in top_rows:
        v = int(r.volume or 0)
        a = int(r.answered or 0)
        top_routers.append({
            "gateway_id": r.gw_id,
            "gateway_name": r.gw_name,
            "volume": v,
            "asr": round((a / v * 100), 2) if v > 0 else 0.0
        })

    # ----- 4. Time-series: last 30 days ending at f['date'] -----
    try:
        end_date = datetime.strptime(f['date'], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=29)

    ts_q = db.session.query(
        TrafficStat.date.label('date'),
        func.sum(TrafficStat.call_attempts).label('attempts'),
        func.sum(TrafficStat.answered_calls).label('answered')
    ).join(Destination, Destination.id == TrafficStat.dest_id)\
     .filter(Destination.country == country_raw)\
     .filter(TrafficStat.date >= start_date)\
     .filter(TrafficStat.date <= end_date)

    if f['type']:
        ts_q = ts_q.filter(Destination.dest_type == f['type'])

    ts_rows = ts_q.group_by(TrafficStat.date)\
                  .order_by(TrafficStat.date).all()

    timeseries = []
    for r in ts_rows:
        a = int(r.attempts or 0)
        ans = int(r.answered or 0)
        timeseries.append({
            "date": str(r.date),
            "volume": a,
            "asr": round((ans / a * 100), 2) if a > 0 else 0.0
        })

    # ----- 5. Failure distribution -----
    failure_buckets = [
        ("Interworking",     int(t.interworking   or 0)),
        ("Peer Congestion",  congestion),
        ("Paging Timeout",   int(t.paging         or 0)),
        ("Route Overflow",   int(t.route_overflow or 0)),
        ("User Busy",        int(t.user_busy      or 0)),
        ("Absent Subscriber",int(t.absent         or 0)),
    ]
    fail_total = sum(c for _, c in failure_buckets)
    failures = [
        {
            "reason": name,
            "count": count,
            "percentage": round((count / fail_total * 100), 2) if fail_total > 0 else 0.0
        }
        for name, count in failure_buckets if count > 0
    ]
    failures.sort(key=lambda x: x['count'], reverse=True)

    # ----- 6. Anomaly summary (counts) + recent anomalies (list) -----
    anom_base = db.session.query(Anomaly)\
        .join(Destination, Anomaly.dest_id == Destination.id)\
        .filter(Destination.country == country_raw)
    if f['type']:
        anom_base = anom_base.filter(Destination.dest_type == f['type'])

    crit_count = anom_base.filter(Anomaly.severity == 'Critical').count()
    warn_count = anom_base.filter(Anomaly.severity == 'Warning').count()

    recent_q = db.session.query(
        Anomaly.date,
        Anomaly.kpi_name,
        Anomaly.value,
        Anomaly.z_score,
        Anomaly.severity,
        Gateway.name.label('gateway_name')
    ).join(Gateway, Anomaly.gateway_id == Gateway.id)\
     .join(Destination, Anomaly.dest_id == Destination.id)\
     .filter(Destination.country == country_raw)

    if f['type']:
        recent_q = recent_q.filter(Destination.dest_type == f['type'])

    recent_rows = recent_q.order_by(func.abs(Anomaly.z_score).desc()).limit(20).all()

    anomaly_summary = {
        "critical_count": crit_count,
        "warning_count": warn_count,
        "total_count": crit_count + warn_count,
        "recent": [
            {
                "date": str(a.date) if a.date else None,
                "gateway_name": a.gateway_name,
                "kpi_name": a.kpi_name,
                "value": round(float(a.value), 2) if a.value is not None else None,
                "z_score": round(float(a.z_score), 2) if a.z_score is not None else None,
                "severity": a.severity
            }
            for a in recent_rows
        ]
    }

    # ----- 7. Final response -----
    return jsonify({
        "country": country_raw,
        "date": f['date'],
        "filters_applied": {k: v for k, v in f.items() if v and k not in ('date', 'country')},
        "kpis": kpis,
        "totals": totals,
        "top_routers": top_routers,
        "timeseries": timeseries,
        "failures": failures,
        "anomaly_summary": anomaly_summary
    })