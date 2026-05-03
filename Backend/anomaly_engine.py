import pandas as pd
import numpy as np
from app import app, db
from models import TrafficStat, Anomaly


# ============================================================
# KPI calculation (unchanged math, kept here for engine self-containment)
# ============================================================
def calculate_all_kpis(df):
    """Computes the row-level KPIs needed for Z-score detection."""
    df = df.copy()
    att = df['call_attempts'].replace(0, 1)
    seiz = df['seizure_traffic'].replace(0, 1)

    df['asr'] = (df['answered_calls'] / att) * 100
    df['ner'] = (df['connected_traffic'] / seiz) * 100
    df['congestion_index'] = (df['congestion_times'] / att) * 100
    df['route_overflow_pct'] = (df['route_overflow'] / att) * 100
    df['interworking_pct'] = (df['interworking_fail'] / att) * 100
    df['paging_pct'] = (df['paging_no_response'] / att) * 100
    df['user_busy_pct'] = (df['user_busy'] / att) * 100
    df['absent_pct'] = (df['absent_subscriber'] / att) * 100

    return df


# ============================================================
# REASON CLASSIFICATION
# ============================================================
# Thresholds: a failure category becomes "dominant" above these ratios.
THRESHOLDS = {
    'high_congestion':       5.0,   # congestion / attempts %
    'route_overflow':        5.0,
    'interworking_failure':  5.0,
    'paging_timeout':       10.0,
    'subscriber_unreachable':20.0,
}


def classify_reason(row, kpi, z):
    """
    Determine the dominant root cause for an anomaly row.
    Returns (reason_tag, human_explanation).
    """
    # Collect failure ratios for this row (already computed in df)
    candidates = [
        ('high_congestion',        row['congestion_index'],  THRESHOLDS['high_congestion']),
        ('route_overflow',         row['route_overflow_pct'],THRESHOLDS['route_overflow']),
        ('interworking_failure',   row['interworking_pct'],  THRESHOLDS['interworking_failure']),
        ('paging_timeout',         row['paging_pct'],        THRESHOLDS['paging_timeout']),
        ('subscriber_unreachable', row['absent_pct'],        THRESHOLDS['subscriber_unreachable']),
    ]

    # Pick the candidate with the largest ratio above its threshold
    above = [(tag, val) for tag, val, thr in candidates if val >= thr]
    dominant = max(above, key=lambda x: x[1]) if above else None

    kpi_label = {
        'asr': 'ASR',
        'congestion_index': 'Congestion Index',
        'route_overflow': 'Route Overflow',
    }.get(kpi, kpi.upper())

    kpi_value = round(float(row[kpi]), 1)

    # CASE 1: A failure category is dominant
    if dominant:
        tag, val = dominant
        val = round(float(val), 1)
        msg_map = {
            'high_congestion':       f"{kpi_label} dropped to {kpi_value}% due to high peer congestion ({val}% of attempts)",
            'route_overflow':        f"{kpi_label} affected by route overflow ({val}% of attempts)",
            'interworking_failure':  f"{kpi_label} degraded — interworking failures hit {val}%",
            'paging_timeout':        f"{kpi_label} dropped — paging timeout reached {val}%",
            'subscriber_unreachable':f"{kpi_label} impacted — {val}% of attempts hit unreachable subscribers",
        }
        return tag, msg_map[tag]

    # CASE 2: No dominant failure — use statistical framing
    if z < 0:
        return 'traffic_drop', f"{kpi_label} fell to {kpi_value}% (z={z:.2f}, well below normal)"
    else:
        return 'traffic_spike', f"{kpi_label} rose to {kpi_value}% (z={z:.2f}, well above normal)"


# ============================================================
# MAIN ENGINE
# ============================================================
def run_anomaly_engine():
    with app.app_context():
        print("📥 Step 1: Loading Traffic from Database...")
        query = db.session.query(TrafficStat)
        df = pd.read_sql(query.statement, db.engine)

        if df.empty:
            print("❌ Error: TrafficStat table is empty!")
            return

        print("📊 Step 2: Calculating KPIs...")
        df = calculate_all_kpis(df)

        monitored_kpis = ['asr', 'congestion_index', 'route_overflow_pct']

        print("🧹 Step 3: Clearing old anomalies...")
        db.session.query(Anomaly).delete()
        db.session.commit()

        print("🧠 Step 4: Running Z-Score Analysis...")
        new_anomalies = []

        for (gw_id, dest_id), group in df.groupby(['gateway_id', 'dest_id']):
            for kpi in monitored_kpis:
                mean = group[kpi].mean()
                std = group[kpi].std()

                if std == 0 or np.isnan(std):
                    continue

                for _, row in group.iterrows():
                    z = (row[kpi] - mean) / std
                    abs_z = abs(z)

                    severity = None
                    if abs_z > 3.5:
                        severity = 'Critical'
                    elif abs_z > 2.0:
                        severity = 'Warning'

                    if severity and row['call_attempts'] > 20:
                        # 🆕 Generate reason + explanation
                        # Map back from the internal column name to the display name
                        kpi_display = 'route_overflow' if kpi == 'route_overflow_pct' else kpi
                        reason, explanation = classify_reason(row, kpi, z)

                        new_anomalies.append(Anomaly(
                            date=row['date'],
                            gateway_id=int(gw_id),
                            dest_id=int(dest_id),
                            kpi_name=kpi_display,
                            z_score=float(z),
                            value=float(row[kpi]),
                            severity=severity,
                            reason=reason,
                            explanation=explanation
                        ))

        print(f"💾 Step 5: Committing {len(new_anomalies)} anomalies...")
        db.session.bulk_save_objects(new_anomalies)
        db.session.commit()

        final_count = Anomaly.query.count()
        print(f"✅ DONE! {final_count} anomalies detected and stored.")


if __name__ == "__main__":
    run_anomaly_engine()