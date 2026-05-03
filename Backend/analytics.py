"""
analytics.py
Reusable analytics helpers shared across multiple route endpoints.
All helpers operate at the SQL aggregation level (no pandas) for performance.
"""

from datetime import datetime, timedelta
from sqlalchemy import func
from models import db, TrafficStat, Destination


def compute_timeseries(
    end_date,
    days=30,
    start_date=None,
    gateway_id=None,
    country=None,
    type_=None,
):
    """
    Compute daily time-series of ASR, traffic volume, and congestion index
    over a date window, with optional filters.

    Args:
        end_date    (str | date): Last day of the window (inclusive). 'YYYY-MM-DD' or date.
        days        (int):        Window size in days. Used only if start_date is None.
        start_date  (str | date): Optional explicit start date. Overrides `days`.
        gateway_id  (int):        Optional gateway filter.
        country     (str):        Optional destination country filter (auto-uppercased).
        type_       (str):        Optional destination type filter (NATIONAL/INTERNATIONAL).

    Returns:
        List of dicts: [{ "time": "YYYY-MM-DD", "asr": float, "traffic": int, "congestion": float }, ...]
        Ordered by date ascending. Empty list if no data matches.
    """
    # ----- normalize dates -----
    end = _to_date(end_date) or datetime.utcnow().date()
    if start_date is not None:
        start = _to_date(start_date) or (end - timedelta(days=days - 1))
    else:
        start = end - timedelta(days=days - 1)

    # ----- base aggregation query -----
    q = db.session.query(
        TrafficStat.date.label('day'),
        func.sum(TrafficStat.call_attempts).label('attempts'),
        func.sum(TrafficStat.answered_calls).label('answered'),
        func.sum(TrafficStat.congestion_times).label('congestion')
    ).filter(TrafficStat.date >= start)\
     .filter(TrafficStat.date <= end)

    # ----- optional filters -----
    if gateway_id is not None:
        q = q.filter(TrafficStat.gateway_id == gateway_id)

    if country or type_:
        q = q.join(Destination, Destination.id == TrafficStat.dest_id)
        if country:
            q = q.filter(Destination.country == country.strip().upper())
        if type_:
            q = q.filter(Destination.dest_type == type_.strip().upper())

    rows = q.group_by(TrafficStat.date).order_by(TrafficStat.date).all()

    # ----- shape the response -----
    result = []
    for r in rows:
        attempts = int(r.attempts or 0)
        answered = int(r.answered or 0)
        congestion = int(r.congestion or 0)

        asr = round((answered / attempts * 100), 2) if attempts > 0 else 0.0
        cgi = round((congestion / attempts * 100), 2) if attempts > 0 else 0.0

        result.append({
            "time": str(r.day),
            "asr": asr,
            "traffic": attempts,
            "congestion": cgi
        })

    return result


def _to_date(value):
    """Normalize str or date to date. Returns None on parse failure."""
    if value is None:
        return None
    if hasattr(value, 'year') and hasattr(value, 'month'):
        return value
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None