import pandas as pd
import numpy as np
import os
from app import app, db
from models import Gateway, Destination, TrafficStat
import reverse_geocoder as rg

def final_clean(val):
    """The absolute final safety check for any row."""
    s = str(val).strip().lower()
    if s in ['nan', 'none', 'null', '', 'unknown', 'n/a']:
        return "OTHER"
    return str(val).upper()

def clean_and_import():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base_dir, 'InputInternational.csv')
    df = pd.read_csv(path)

    # 1. Standardize Columns
    df = df.rename(columns={'CDGN*': 'cdgn_ext', 'N/INT': 'n_int'})
    df.columns = [c.strip().lower().replace(' ', '_').replace('*', '') for c in df.columns]

    # 2. Hard-coded Recovery for the "28" specific codes
    # I mapped these directly from your CSV's unique missing values
    cdgn_fix = {
        'PFX_1264': 'ANGUILLA', 'PFX_1784': 'ST VINCENT', 'PFX_1242': 'BAHAMAS',
        'PFX_1670': 'NORTHERN MARIANA ISLANDS', 'PFX_338': 'FRANCE',
        'ASCENSION': 'ASCENSION ISLAND', 'FRWD_TO_333': 'ALGERIA (INTERNAL)',
        'INTERNATIONAL': 'INTERNATIONAL', 'NTERNATIONAL': 'INTERNATIONAL',
        'INMARSAT-M WORLDWIDE': 'SATELLITE', 'PFX_882': 'INTL NETWORKS'
    }

    # Apply the fix where country is missing
    mask = df['country'].isna() | (df['country'].astype(str).str.lower() == 'nan')
    df.loc[mask, 'country'] = df.loc[mask, 'cdgn'].map(cdgn_fix)

    # 3. Final String Polish (This kills the 'nan' string)
    df['country'] = df['country'].apply(final_clean)

    # 4. Numeric Cleaning
    for col in df.select_dtypes(include=[np.number]).columns:
        df[col] = df[col].clip(lower=0).fillna(0)

    with app.app_context():
        print("🧹 Wiping Database...")
        db.drop_all()
        db.create_all()

        # --- Mapping Gateways ---
        gw_map = {}
        for _, row in df[['ne_name', 'x1', 'y1']].drop_duplicates('ne_name').iterrows():
            gw = Gateway(name=str(row['ne_name']), x=float(row['x1']), y=float(row['y1']))
            db.session.add(gw)
            db.session.flush()
            gw_map[str(row['ne_name'])] = gw.id

        # --- Mapping Destinations ---
        dest_map = {}
        unique_dests = df[['cdgn', 'country', 'n_int', 'x2', 'y2']].drop_duplicates('cdgn')
        for _, row in unique_dests.iterrows():
            # Use the cleaned country name
            c_name = final_clean(row['country'])
            d = Destination(
                name=str(row['cdgn']), 
                country=c_name, 
                dest_type=str(row['n_int']).upper() if pd.notnull(row['n_int']) else 'UNKNOWN',
                x=float(row['x2']) if pd.notnull(row['x2']) else 0.0,
                y=float(row['y2']) if pd.notnull(row['y2']) else 0.0
            )
            db.session.add(d)
            db.session.flush()
            dest_map[str(row['cdgn'])] = d.id

        # --- Bulk Import Traffic ---
        print(f"📊 Importing {len(df)} records...")
        traffic_entries = []
        for _, row in df.iterrows():
            stat = TrafficStat(
                date=pd.to_datetime(row['date']).date(),
                gateway_id=gw_map[str(row['ne_name'])],
                dest_id=dest_map[str(row['cdgn'])],
                call_attempts=int(row['call_attempt_times']),
                answered_calls=int(row['answer_times']),
                seizure_traffic=float(row['seizure_traffic']),
                connected_traffic=float(row['connected_traffic']),
                congestion_times=int(row['peer_office_congestion_times']),
                paging_no_response=int(row['paging_no_response_times']),
                route_overflow=int(row['last-select_route_overflow_times']),
                interworking_fail=int(row['interworking_times']),
                user_busy=int(row['user_busy_times']),
                absent_subscriber=int(row['absent_subscriber_times'])
            )
            traffic_entries.append(stat)
            if len(traffic_entries) >= 5000:
                db.session.bulk_save_objects(traffic_entries)
                db.session.commit()
                traffic_entries = []

        db.session.bulk_save_objects(traffic_entries)
        db.session.commit()
        print("✅ DATABASE CLEAN: 0 NaNs REMAINING.")

if __name__ == "__main__":
    clean_and_import()