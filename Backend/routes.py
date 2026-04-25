from flask import jsonify, request
from app import app, db
from models import Gateway, Destination, Anomaly, TrafficStat
from sqlalchemy import func

def get_latest_date():
    latest = db.session.query(func.max(TrafficStat.date)).scalar()
    return str(latest) if latest else "2026-04-22"

@app.route('/api/dashboard/stats', methods=['GET'])
def get_global_stats():
    target_date = request.args.get('date') or get_latest_date()
    stats = db.session.query(
        func.sum(TrafficStat.call_attempts).label('total_attempts'),
        func.sum(TrafficStat.answered_calls).label('total_answered'),
        func.sum(TrafficStat.interworking_fail).label('total_fail')
    ).filter(TrafficStat.date == target_date).first()

    attempts = stats.total_attempts or 0
    answered = stats.total_answered or 0
    asr = (answered / attempts * 100) if attempts > 0 else 0

    return jsonify({
        "date": target_date,
        "attempts": int(attempts),
        "asr": round(float(asr), 2),
        "failures": int(stats.total_fail or 0)
    })

@app.route('/api/dashboard/map', methods=['GET'])
def get_map_data():
    target_date = request.args.get('date') or get_latest_date()
    
    # Query using the simple 'x' and 'y' from your screenshots
    results = db.session.query(
        Gateway.name,
        Gateway.x,
        Gateway.y,
        TrafficStat.call_attempts,
        TrafficStat.answered_calls
    ).join(TrafficStat, Gateway.id == TrafficStat.gateway_id)\
     .filter(TrafficStat.date == target_date).all()

    map_points = []
    for row in results:
        attempts = row.call_attempts or 0
        answered = row.answered_calls or 0
        asr = (answered / attempts * 100) if attempts > 0 else 0
        
        status = "Critical" if asr < 50 else "Normal"
        
        map_points.append({
            "name": row.name,
            "lat": float(row.x), 
            "lng": float(row.y), 
            "asr": round(asr, 2),
            "status": status
        })
    return jsonify(map_points)
@app.route('/api/dashboard/active-routes', methods=['GET'])
def get_active_routes():
    # Placeholder for active routes logic
    return jsonify({"status": "success", "data": []})

@app.route('/api/dashboard/chronic-issues', methods=['GET'])
def get_chronic_issues():
    # Placeholder for chronic issues logic
    return jsonify({"status": "success", "data": []})

@app.route('/api/filters/options', methods=['GET'])
def get_filter_options():
    gateways = db.session.query(Gateway.name).all()
    countries = db.session.query(Destination.country).distinct().all()
    return jsonify({
        "gateways": [g[0] for g in gateways],
        "countries": [c[0] for c in countries],
        "latest_date": get_latest_date()
    })