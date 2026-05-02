import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

# 1. Register facility
print("1. Registering facility...")
r = requests.post(f"{BASE_URL}/facility/register", json={"name": "Test Clinic", "password": "pass"})
fac = r.json().get("facility", {})
fac_code = fac.get("code")
print(f"Facility registered: {fac_code}")

# 2. Register patient
print("2. Registering patient...")
r = requests.post(f"{BASE_URL}/user/create", json={
    "name": "Test Patient",
    "password": "pass",
    "contact": "test@test.com",
    "addiction_types": ["alcohol"],
    "facility_code": fac_code,
    "is_premium": False,
    "dob": "1990-01-01"
})
pat = r.json().get("user", {})
pat_id = pat.get("id")
print(f"Patient registered: {pat_id}, Status: {pat.get('status')}")

# 3. Facility approves patient
print("3. Approving patient...")
r = requests.post(f"{BASE_URL}/facility/approve/{pat_id}")
print("Approve status:", r.json())

# 4. Patient Syncs checkins and journal
print("4. Patient syncing data...")
r = requests.post(f"{BASE_URL}/patient/sync", json={
    "user_id": pat_id,
    "checkins": [{"date": "2026-05-02", "mood": "good", "urge": 2}],
    "journal": [{"date": "2026-05-02", "mood": "good", "text": "Feeling great!"}],
    "profile": {"name": "Test Patient", "contact": "test@test.com"}
})
print("Patient sync:", r.json())

# 5. Facility gets patients
print("5. Facility loading patients...")
r = requests.get(f"{BASE_URL}/facility/patients/{fac_code}")
data = r.json()
print("Facility patients count:", len(data.get("patients", [])))
if len(data.get("patients", [])) > 0:
    p = data["patients"][-1]
    print(f"Checkins count: {len(p.get('checkins', []))}")
    print(f"Journal count: {len(p.get('journal', []))}")

# 6. Facility creates treatment plan
print("6. Facility saving treatment plan...")
r = requests.post(f"{BASE_URL}/treatment-plan/save", json={
    "user_id": pat_id,
    "diagnosis": "Test Diagnosis",
    "meds": "Test Meds",
    "therapy": "CBT",
    "goals": [{"text": "Stay sober", "done": False}],
    "notes": "Test notes",
    "cnotes": "Private notes",
    "appt": "2026-05-10"
})
print("Treatment plan save:", r.json())

# 7. Patient loads 'My Care'
print("7. Patient loading My Care...")
r = requests.get(f"{BASE_URL}/patient/my-care/{pat_id}")
my_care = r.json()
print("My Care facility:", my_care.get("facility", {}).get("name"))
print("My Care treatment plan:", my_care.get("treatment_plan", {}).get("plan", {}).get("diagnosis"))
print("My Care tasks:", len(my_care.get("tasks", [])))
