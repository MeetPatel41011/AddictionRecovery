"""Quick integration test for all new features."""
import requests
import json

BASE = "http://localhost:8000"

# Test 1: Create a user WITH facility code (should be pending)
r = requests.post(f"{BASE}/user/create", json={
    "name": "Test OTP User",
    "addiction_types": ["alcohol"],
    "facility_code": "CLINIC001",
    "is_premium": False,
    "dob": "1995-06-15"
})
d = r.json()
user = d["user"]
user_id = str(user["id"])
print("=== Test 1: Create User with Facility Code ===")
print(f"Status: {user['status']}")  # Should be 'pending'
print(f"User ID: {user_id}")
print(f"DOB: {user.get('dob')}")
assert user["status"] == "pending", f"Expected pending, got {user['status']}"

# Test 2: Check pending users for CLINIC001
r2 = requests.get(f"{BASE}/facility/pending-users/CLINIC001")
d2 = r2.json()
print(f"\n=== Test 2: Pending Users for CLINIC001 ===")
print(f"Pending count: {d2['pending_count']}")

# Test 3: Check user status
r3 = requests.get(f"{BASE}/user/status/{user_id}")
d3 = r3.json()
print(f"\n=== Test 3: User Status ===")
print(f"Status: {d3['status']}")
assert d3["status"] == "pending"

# Test 4: Approve the user
r4 = requests.post(f"{BASE}/facility/approve/{user_id}")
d4 = r4.json()
print(f"\n=== Test 4: Approve User ===")
print(f"Result: {d4['status']} - {d4['message']}")
assert d4["status"] == "success"

# Test 5: Check status again (should be 'active')
r5 = requests.get(f"{BASE}/user/status/{user_id}")
d5 = r5.json()
print(f"\n=== Test 5: Post-Approval Status ===")
print(f"Status: {d5['status']}")
assert d5["status"] == "active"

# Test 6: Set premium + external schedule
requests.post(f"{BASE}/user/set-premium", json={"user_id": user_id, "is_premium": True})
r7 = requests.post(f"{BASE}/api/v1/external/schedule", json={
    "user_id": user_id,
    "clinician_name": "Dr. Martinez",
    "facility_code": "CLINIC001",
    "schedule_period": "weekly",
    "schedule_label": "Week of April 22, 2026",
    "tasks": [
        {"actionable_task": "Morning meditation - 15 min", "difficulty": "Low", "priority": 4, "addiction_type": "alcohol"},
        {"actionable_task": "Attend AA meeting", "difficulty": "Medium", "priority": 5, "addiction_type": "alcohol"},
        {"actionable_task": "Avoid bars and nightclubs", "task_type": "avoid", "priority": 5, "addiction_type": "alcohol"}
    ]
})
d7 = r7.json()
print(f"\n=== Test 6: External Schedule API ===")
print(f"Result: {d7['status']} | Tasks created: {d7['tasks_created']}")
print(f"Audit file: {d7['audit_file']}")
assert d7["status"] == "success"

# Test 7: Verify client records has data
r8 = requests.get(f"{BASE}/api/v1/client-records/{user_id}")
d8 = r8.json()
print(f"\n=== Test 7: Client Records ===")
print(f"Record count: {d8['record_count']}")
print(f"Has data: {d8['has_data']}")
assert d8["has_data"] == True
assert d8["record_count"] >= 1

# Test 8: Create a free user (no facility code, should be 'active')
r9 = requests.post(f"{BASE}/user/create", json={
    "name": "Free User",
    "addiction_types": ["tobacco"],
    "is_premium": False
})
d9 = r9.json()
free_user = d9["user"]
print(f"\n=== Test 8: Free User (no facility code) ===")
print(f"Status: {free_user['status']}")
assert free_user["status"] == "active"

# Test 9: Free user has no client records
r10 = requests.get(f"{BASE}/api/v1/client-records/{free_user['id']}")
d10 = r10.json()
print(f"\n=== Test 9: Free User Client Records ===")
print(f"Record count: {d10['record_count']}")
print(f"Has data: {d10['has_data']}")
assert d10["has_data"] == False

print("\n" + "=" * 50)
print("ALL 9 TESTS PASSED!")
print("=" * 50)
