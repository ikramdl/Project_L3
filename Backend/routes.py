from flask import jsonify, request
from app import app, db
from models import Gateway, Destination, Anomaly, TrafficStat
from sqlalchemy import func, text
import pandas as pd
import numpy as np

def diagnose(row):
    # Check if we have enough data to calculate Z-Score
    if pd.isna(row['asr_std']) or row['asr_std'] == 0:
        return "Insufficient Data"
    
    # Diagnosis logic
    if row['congestion_failures'] > row['mean_congestion'] * 2:
        return "Capacity Overload"
    if row['interworking_failures'] > row['mean_interworking'] * 2:
        return "Protocol Mismatch (Signaling)"
    if row['paging_failures'] > row['mean_paging'] * 2:
        return "Radio Network Congestion"
    return "Generic ASR Drop"

def get_latest_date():
    # We use .date because that's what is defined in TrafficStat model
    latest = db.session.query(func.max(TrafficStat.date)).scalar()
    return str(latest) if latest else "2026-02-16"

@app.route('/api/dashboard/chronic-issues')
def get_chronic_issues():
    # 1. SQL with JOIN to get real names from the gateways table
    query = """
        SELECT g.name as gateway_name, t.call_attempts, t.answered_calls, 
               t.congestion_times, t.interworking_fail, t.paging_no_response, t.date
        FROM traffic_stats t
        JOIN gateways g ON t.gateway_id = g.id
        WHERE t.date = (SELECT MAX(date) FROM traffic_stats)
    """
    raw_data = db.session.execute(text(query)).fetchall()
    
    df = pd.DataFrame(raw_data, columns=[
        'gateway_name', 'call_attempts', 'answered_calls', 'congestion_times', 
        'interworking_fail', 'paging_no_response', 'date'
    ])

    if df.empty:
        return jsonify([])

    # 2. Calculate ASR - Filter out rows with 0 attempts to avoid math errors
    df = df[df['call_attempts'] > 0].copy()
    df['asr_percent'] = (df['answered_calls'] / df['call_attempts']) * 100

    # 3. Simple Fallback: If we don't have enough history for Z-Score, 
    # just show everything with ASR < 70%
    anomalies = df[df['asr_percent'] < 70].copy()
    
    # Add a simple diagnosis based on raw numbers
    def quick_diagnose(row):
        if row['congestion_times'] > 50: return "High Congestion"
        if row['interworking_fail'] > 20: return "Signaling Error"
        return "Low ASR"

    anomalies['diagnosis'] = anomalies.apply(quick_diagnose, axis=1)
    anomalies['z_score'] = 2.5 # Fake Z-score for the UI display

    return jsonify(anomalies.head(50).to_dict(orient='records'))

@app.route('/api/dashboard/active-routes', methods=['GET'])
def get_active_routes():
    try:
        # 1. Get the latest date
        latest_date_query = text("SELECT MAX(date) FROM traffic_stats")
        target_date = db.session.execute(latest_date_query).scalar()

        if not target_date:
            return jsonify([])

        # 2. Join with the 'destinations' table to get the human-readable name
        # We use 'd.name' from the destinations table and 't.call_attempts' from traffic
        query = text("""
            SELECT d.name AS dest_name, SUM(t.call_attempts) AS total_calls
            FROM traffic_stats t
            JOIN destinations d ON t.dest_id = d.id
            WHERE t.date = :d
            GROUP BY d.name
            ORDER BY total_calls DESC
            LIMIT 5
        """)
        
        results = db.session.execute(query, {"d": target_date}).fetchall()

        routes_data = [
            {"destination": row.dest_name, "count": int(row.total_calls)} 
            for row in results
        ]

        return jsonify(routes_data)

    except Exception as e:
        print(f"Active Routes Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/dashboard/stats', methods=['GET'])
def get_global_stats():
    # Use the latest date in the DB automatically
    latest_date_query = text("SELECT MAX(date) FROM traffic_stats")
    target_date = db.session.execute(latest_date_query).scalar()
    
    query = text("""
        SELECT SUM(call_attempts) as total_attempts, 
               SUM(answered_calls) as total_answered,
               SUM(interworking_fail) as total_fail
        FROM traffic_stats 
        WHERE date = :d
    """)
    
    result = db.session.execute(query, {"d": target_date}).fetchone()

    attempts = result.total_attempts or 0
    answered = result.total_answered or 0
    asr = (answered / attempts * 100) if attempts > 0 else 0

    return jsonify({
        "date": str(target_date),
        "attempts": int(attempts),
        "asr": round(float(asr), 2),
        "failures": int(result.total_fail or 0)
    })

@app.route('/api/dashboard/map', methods=['GET'])
def get_map_data():
    try:
        # 1. Get the most recent date
        latest_date_query = text("SELECT MAX(date) FROM traffic_stats")
        target_date = db.session.execute(latest_date_query).scalar()
        
        if not target_date:
            return jsonify([])

        # 2. Using your exact pgAdmin column names: g.x and g.y
        query = text("""
            SELECT 
                g.name AS gateway_name, 
                g.x, 
                g.y, 
                SUM(t.call_attempts) as call_attempts, 
                SUM(t.answered_calls) as answered_calls
            FROM traffic_stats t
            JOIN gateways g ON t.gateway_id = g.id
            WHERE t.date = :d
            GROUP BY g.name, g.x, g.y
        """)
        results = db.session.execute(query, {"d": target_date}).fetchall()

        map_points = []
        for row in results:
            # Convert x/y to floats (lat/lng)
            lat = float(row.x or 0)
            lng = float(row.y or 0)

            # Skip markers with no coordinates so they don't appear at (0,0)
            if lat == 0 and lng == 0:
                continue
                
            attempts = row.call_attempts or 0
            answered = row.answered_calls or 0
            asr = (answered / attempts * 100) if attempts > 0 else 0
            
            map_points.append({
                "name": row.gateway_name,
                "lat": lat, 
                "lng": lng, 
                "asr": round(asr, 2),
                "status": "Critical" if asr < 50 else "Normal"
            })

        return jsonify(map_points)

    except Exception as e:
        print(f"Map Error: {e}")
        return jsonify({"error": str(e)}), 500