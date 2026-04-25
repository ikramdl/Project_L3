import pandas as pd

def calculate_all_kpis(df):
    """
    The 10 Core Engineering KPIs for Djezzy International Traffic.
    """
    # Safety: Replace 0 with 1 for denominators to avoid DivisionByZero errors
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
    df['user_behavior_failure'] = ((df['user_busy'] + df['ringed_no_answer_times']) / att) * 100
    df['reachability'] = (1 - (df['absent_subscriber'] / att)) * 100
    df['seizure_success'] = (df['seizure_traffic'] / att) * 100
    
    return df