import pandas as pd
import numpy as np
import os

def clean_international_data():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    input_path = os.path.join(base_dir, 'InputInternational.csv')
    
    if not os.path.exists(input_path):
        raise FileNotFoundError(f"Missing file: {input_path}")
        
    df = pd.read_csv(input_path)
    
    # Pre-rename CDGN* to avoid collision with CDGN before stripping symbols
    df = df.rename(columns={'CDGN*': 'cdgn_ext'})
    
    # Standardize remaining headers
    df.columns = [c.strip().lower().replace(' ', '_').replace('*', '').replace('/', '_').replace('%', 'pct') for c in df.columns]
    
    # Algeria context logic
    is_algeria = df['ne_name'].str.contains('ALGER|ORAN|ANNABA', case=False, na=False)
    df.loc[is_algeria & df['country'].isna(), 'country'] = 'ALGERIA'
    
    df['country'] = df['country'].fillna('UNKNOWN').str.upper()
    df['type'] = df['type'].fillna('OTHER')
    df['cdgn'] = df['cdgn'].fillna('UNKNOWN_DEST')
    
    # Coordinate and metric cleanup
    df[['x2', 'y2', 'x3', 'y3']] = df[['x2', 'y2', 'x3', 'y3']].fillna(0.0)
    numeric_cols = df.select_dtypes(include=[np.number]).columns
    for col in numeric_cols:
        df[col] = df[col].clip(lower=0)
        
    return df