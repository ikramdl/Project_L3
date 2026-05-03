import requests

BASE_URL = "http://127.0.0.1:5000/api"


def test_route(label, endpoint, params=None):
    url = f"{BASE_URL}{endpoint}"
    try:
        print(f"  {label:<40}", end=" ")
        r = requests.get(url, params=params)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                count = f"{len(data)} items"
            elif isinstance(data, dict):
                if 'flows' in data:
                    count = f"{len(data['flows'])} flows, {len(data['gateways'])} gateways"
                else:
                    count = "1 object"
            else:
                count = "?"
            print(f"✅ {count}")
        else:
            print(f"❌ Status {r.status_code}")
    except Exception as e:
        print(f"🔥 {e}")


if __name__ == "__main__":
    print("\n--- 🔍 BACKEND FILTER TEST 🔍 ---\n")

    print("[1] No filters (baseline)")
    test_route("stats",          "/dashboard/stats")
    test_route("map",            "/dashboard/map")
    test_route("active-routes",  "/dashboard/active-routes")
    test_route("chronic-issues", "/dashboard/chronic-issues")
    test_route("filters/options","/filters/options")

    print("\n[2] Filter by country=MOROCCO")
    test_route("stats",          "/dashboard/stats",          {"country": "MOROCCO"})
    test_route("map",            "/dashboard/map",            {"country": "MOROCCO"})
    test_route("active-routes",  "/dashboard/active-routes",  {"country": "MOROCCO"})
    test_route("chronic-issues", "/dashboard/chronic-issues", {"country": "MOROCCO"})

    print("\n[3] Filter by type=INTERNATIONAL")
    test_route("stats",          "/dashboard/stats",          {"type": "INTERNATIONAL"})
    test_route("map",            "/dashboard/map",            {"type": "INTERNATIONAL"})
    test_route("active-routes",  "/dashboard/active-routes",  {"type": "INTERNATIONAL"})
    test_route("chronic-issues", "/dashboard/chronic-issues", {"type": "INTERNATIONAL"})

    print("\n[4] Filter by severity=Critical")
    test_route("map",            "/dashboard/map",            {"severity": "Critical"})
    test_route("chronic-issues", "/dashboard/chronic-issues", {"severity": "Critical"})

    print("\n[5] Combined filters")
    test_route("map (MOROCCO+INTL+Critical)", "/dashboard/map",
               {"country": "MOROCCO", "type": "INTERNATIONAL", "severity": "Critical"})

    print("\n[6] Router details endpoint")
    GW_ID = 3   # 👈 replace with the ID you noted from Step 1
    test_route("router-details (no filter)", "/dashboard/router-details",
               {"gateway_id": GW_ID})
    test_route("router-details + country",   "/dashboard/router-details",
               {"gateway_id": GW_ID, "country": "MOROCCO"})
    test_route("router-details + type",      "/dashboard/router-details",
               {"gateway_id": GW_ID, "type": "INTERNATIONAL"})
    test_route("router-details (missing id)","/dashboard/router-details")
    test_route("router-details (bad id)",    "/dashboard/router-details",
               {"gateway_id": 999999})
    

    print("\n[7] Country details endpoint")
    test_route("country-details (MOROCCO)",  "/dashboard/country-details",
               {"country": "MOROCCO"})
    test_route("country-details + type",     "/dashboard/country-details",
               {"country": "MOROCCO", "type": "INTERNATIONAL"})
    test_route("country-details (lowercase)","/dashboard/country-details",
               {"country": "morocco"})
    test_route("country-details (missing)",  "/dashboard/country-details")
    test_route("country-details (typo)",     "/dashboard/country-details",
               {"country": "MOROCO"})
    

    print("\n[8] Map upgrade — flows + normalization")
    test_route("map (default limit)",   "/dashboard/map")
    test_route("map limit=20",          "/dashboard/map", {"limit": 20})
    test_route("map limit=5",           "/dashboard/map", {"limit": 5})
    test_route("map + severity=Critical","/dashboard/map", {"severity": "Critical"})
    test_route("map + country=MOROCCO", "/dashboard/map", {"country": "MOROCCO"})



    print("\n[9] Time-series helper integration")
    import requests as _r

    r = _r.get(f"{BASE_URL}/dashboard/router-details", params={"gateway_id": 3})
    if r.status_code == 200:
        ts = r.json().get('timeseries', [])
        keys_ok = ts and all(k in ts[0] for k in ('time', 'asr', 'traffic', 'congestion'))
        print(f"  router-details timeseries shape:        {'✅' if keys_ok else '❌'} ({len(ts)} points)")
    else:
        print(f"  router-details                           ❌ {r.status_code}")

    r = _r.get(f"{BASE_URL}/dashboard/country-details", params={"country": "MOROCCO"})
    if r.status_code == 200:
        ts = r.json().get('timeseries', [])
        keys_ok = ts and all(k in ts[0] for k in ('time', 'asr', 'traffic', 'congestion'))
        print(f"  country-details timeseries shape:       {'✅' if keys_ok else '❌'} ({len(ts)} points)")
    else:
        print(f"  country-details                          ❌ {r.status_code}")

    print("\n--- TEST COMPLETE ---\n")