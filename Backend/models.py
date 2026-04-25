from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Gateway(db.Model):
    __tablename__ = 'gateways'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True)
    x = db.Column(db.Float) 
    y = db.Column(db.Float)

class Destination(db.Model):
    __tablename__ = 'destinations'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100))
    country = db.Column(db.String(100))
    dest_type = db.Column(db.String(50))
    x = db.Column(db.Float)
    y = db.Column(db.Float)

class TrafficStat(db.Model):
    __tablename__ = 'traffic_stats'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date)
    gateway_id = db.Column(db.Integer, db.ForeignKey('gateways.id'))
    dest_id = db.Column(db.Integer, db.ForeignKey('destinations.id'))
    call_attempts = db.Column(db.Integer)
    answered_calls = db.Column(db.Integer)
    interworking_fail = db.Column(db.Integer)
    congestion_times = db.Column(db.Integer)
    paging_no_response = db.Column(db.Integer)
    # Added to support your 10-KPI Engine math
    seizure_traffic = db.Column(db.Float)
    connected_traffic = db.Column(db.Float)
    route_overflow = db.Column(db.Integer)
    user_busy = db.Column(db.Integer)
    absent_subscriber = db.Column(db.Integer)

class Anomaly(db.Model):
    __tablename__ = 'anomalies'
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date)
    gateway_id = db.Column(db.Integer, db.ForeignKey('gateways.id'))
    dest_id = db.Column(db.Integer, db.ForeignKey('destinations.id'))
    kpi_name = db.Column(db.String(50))
    value = db.Column(db.Float)
    z_score = db.Column(db.Float)  # <--- CRITICAL: Added for your Z-score logic
    severity = db.Column(db.String(20))
    
    gateway = db.relationship('Gateway', backref='anomalies')
    destination = db.relationship('Destination', backref='anomalies')