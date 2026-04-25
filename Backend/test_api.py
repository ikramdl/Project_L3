import requests

BASE_URL = "http://127.0.0.1:5000/api"
def test_route(endpoint, params=None):
    url = f"{BASE_URL}{endpoint}"
    try:
        print(f"Testing {url}...", end=" ")
        response = requests.get(url, params=params)
        if response.status_code == 200:
            data = response.json()
            # Check if we actually got data or just an empty list
            count = len(data) if isinstance(data, list) else "1 object"
            print(f"✅ SUCCESS ({count} items found)")
        else:
            print(f"❌ FAILED (Status: {response.status_code})")
    except Exception as e:
        print(f"🔥 ERROR: Could not connect to server. Is Flask running?")

if __name__ == "__main__":
    print("--- 🔍 PFE BACKEND SYSTEM TEST 🔍 ---\n")
    
    # 1. Test General Dashboard
    test_route("/dashboard/stats")
    
    # 2. Test Filtering (Simulating a user selection)
    test_route("/dashboard/map", params={"type": "INTERNATIONAL", "severity": "Critical"})
    
    # 3. Test Global State Panels
    test_route("/dashboard/active-routes")
    test_route("/dashboard/chronic-issues")
    
    # 4. Test Dropdowns
    test_route("/filters/options")
    
    print("\n--- TEST COMPLETE ---")