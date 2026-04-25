import pandas as pd
import numpy as np
from app import app, db
from models import TrafficStat, Anomaly, Destination, Gateway

def calculate_all_kpis(df):
    """
    The 10 Core Engineering KPIs for Djezzy.
    Calculates metrics based on the database column names.
    """
    # Use a copy to avoid SettingWithCopy warnings
    df = df.copy()
    
    # Safety: Replace 0 with 1 for denominators
    att = df['call_attempts'].replace(0, 1)
    seiz_trf = df['seizure_traffic'].replace(0, 1)

    # --- The 10 KPIs ---
    df['asr'] = (df['answered_calls'] / att) * 100
    df['ner'] = (df['connected_traffic'] / seiz_trf) * 100
    df['congestion_index'] = (df['congestion_times'] / att) * 100
    df['traffic_load'] = df['call_attempts']
    df['psr'] = 100 - ((df['paging_no_response'] / att) * 100)
    df['route_overflow'] = (df['route_overflow'] / att) * 100
    df['interworking_failure'] = (df['interworking_fail'] / att) * 100
    # Note: Using 0 for ringed_no_answer_times if not in your current schema
    df['user_behavior_failure'] = ((df['user_busy'] + 0) / att) * 100 
    df['reachability'] = (1 - (df['absent_subscriber'] / att)) * 100
    df['seizure_success'] = (df['seizure_traffic'] / att) * 100
    
    return df

def run_anomaly_engine():
    with app.app_context():
        print("📥 Step 1: Loading Traffic from Database...")
        query = db.session.query(TrafficStat)
        df = pd.read_sql(query.statement, db.engine)

        if df.empty:
            print("❌ Error: TrafficStat table is empty!")
            return

        print("📊 Step 2: Calculating 10 Engineering KPIs...")
        df = calculate_all_kpis(df)

        # We will monitor these 3 critical KPIs for anomalies
        # You can add more to this list if you want to detect more types of issues
        monitored_kpis = ['asr', 'congestion_index', 'route_overflow']

        print("🧹 Step 3: Clearing old anomalies...")
        db.session.query(Anomaly).delete()

        print("🧠 Step 4: Running Z-Score Analysis (grouped by path)...")
        
        # Group by the IDs from your relational tables
        for (gw_id, dest_id), group in df.groupby(['gateway_id', 'dest_id']):
            
            for kpi in monitored_kpis:
                mean = group[kpi].mean()
                std = group[kpi].std()

                # Skip if no variation (cannot calculate Z-score)
                if std == 0 or np.isnan(std):
                    continue

                for _, row in group.iterrows():
                    # Calculate Z-Score
                    z = (row[kpi] - mean) / std
                    
                    # Apply your binôme's severity logic
                    severity = None
                    abs_z = abs(z)
                    
                    if abs_z > 3.5:
                        severity = 'Critical'
                    elif abs_z > 2.0:
                        severity = 'Warning'

                    # 🛡️ THE SAFETY FILTER: 
                    # Only flag if there is actual traffic (e.g. > 20 attempts)
                    # This prevents "False Positives" on tiny samples
                    if severity and row['call_attempts'] > 20:
                        new_anomaly = Anomaly(
                            date=row['date'],
                            gateway_id=int(gw_id),
                            dest_id=int(dest_id),
                            kpi_name=kpi,
                            z_score=float(z),
                            value=float(row[kpi]), # The actual KPI value (e.g. 15.5%)
                            severity=severity
                        )
                        db.session.add(new_anomaly)

        print("💾 Step 5: Committing to Database...")
        db.session.commit()
        
        final_count = Anomaly.query.count()
        print(f"✅ DONE! {final_count} anomalies detected and stored.")

if __name__ == "__main__":
    run_anomaly_engine()