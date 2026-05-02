"""
Recovery Compass — FastAPI Backend
Enhanced with premium clinician task merging and AI learning loop.
"""

import json
import os
from datetime import datetime
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import List, Optional

import client_data_manager

import db
from rl_bandit import ContextualBandit
from task_merger import TaskMerger

app = FastAPI(
    title="Recovery Compass API",
    description="AI-powered addiction recovery with adaptive task recommendations",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve the frontend HTML at root
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app.mount("/frontend", StaticFiles(directory=os.path.join(BASE_DIR, "frontend")), name="frontend")

@app.get("/")
async def serve_frontend():
    return FileResponse(os.path.join(BASE_DIR, "recovery-compass.html"))

# ── Initialize on startup ────────────────────────────────────────

# Initialize database tables
try:
    db.init_tables()
except Exception as e:
    print(f"⚠️ Database init warning (will retry on first use): {e}")

# Initialize the task merger and default RL bandit (general tasks only)
merger = TaskMerger(general_json_path="output.json")
default_tasks = merger.get_tasks_for_rl()

# Default bandit for free users (no DB-backed learning)
bandit = ContextualBandit(tasks=default_tasks, epsilon=0.2, alpha=0.1, db_module=db)

# Cache for per-user bandits (premium users get their own merged bandit)
user_bandits = {}


def get_bandit_for_user(user_id: Optional[str] = None) -> ContextualBandit:
    """
    Returns the appropriate bandit for a user:
    - Free users / no user_id: shared default bandit (general tasks only)
    - Premium users: personalized bandit with merged general + clinician tasks
    """
    if not user_id:
        return bandit

    # Check cache first
    if user_id in user_bandits:
        return user_bandits[user_id]

    # Get merged tasks for this user
    merged_tasks = merger.get_tasks_for_rl(user_id)

    # If they got more tasks than the default, they're premium with clinician tasks
    if len(merged_tasks) > len(default_tasks):
        user_bandit = ContextualBandit(
            tasks=merged_tasks, epsilon=0.2, alpha=0.1, db_module=db
        )
        user_bandits[user_id] = user_bandit
        return user_bandit

    # Free user — use shared bandit
    return bandit


# ── Request/Response Models ──────────────────────────────────────

class TaskCompletionRequest(BaseModel):
    task_id: str
    completed: bool
    prev_urge: int
    next_urge: int
    mood: int
    streak: int
    user_id: Optional[str] = None
    addiction_type: Optional[str] = None


class ClinicianTaskInput(BaseModel):
    condition_trigger: str
    actionable_task: str
    task_type: str = Field(default="do", pattern="^(do|avoid)$")
    difficulty: str = Field(default="Medium", pattern="^(Low|Medium|High)$")
    priority: int = Field(default=3, ge=1, le=5)
    addiction_type: Optional[str] = None
    dimension: Optional[str] = None


class ClinicianUploadRequest(BaseModel):
    user_id: str
    clinician_name: str = "Unknown Clinician"
    tasks: List[ClinicianTaskInput]


class UserCreateRequest(BaseModel):
    name: str
    password: Optional[str] = None
    contact: Optional[str] = None  # email or phone — unique identifier
    addiction_types: Optional[List[str]] = None
    facility_code: Optional[str] = None
    is_premium: bool = False
    dob: Optional[str] = None  # ISO date string e.g. "2000-01-15"

class UserLoginRequest(BaseModel):
    contact: str   # email or phone
    password: str

class FacilityRegisterRequest(BaseModel):
    name: str
    password: str

class FacilityLoginRequest(BaseModel):
    code: str
    password: str


class PremiumToggleRequest(BaseModel):
    user_id: str
    is_premium: bool


class ExternalScheduleTask(BaseModel):
    """A single task in an externally scheduled plan."""
    condition_trigger: str = ""
    actionable_task: str
    task_type: str = Field(default="do", pattern="^(do|avoid)$")
    difficulty: str = Field(default="Medium", pattern="^(Low|Medium|High)$")
    priority: int = Field(default=3, ge=1, le=5)
    addiction_type: Optional[str] = None


class ExternalScheduleRequest(BaseModel):
    """
    Payload from an external facility system (EMR, scheduler).
    Posts a weekly/monthly block of tasks for a specific patient.
    """
    user_id: str
    clinician_name: str = "Facility Scheduler"
    facility_code: str
    schedule_period: str = Field(description="e.g. 'weekly', 'biweekly', 'monthly'")
    schedule_label: str = Field(default="", description="e.g. 'Week of April 21, 2026'")
    tasks: List[ExternalScheduleTask]


# ── AI Coach Chat Endpoints ─────────────────────────────────────

from fastapi import Request

@app.post("/api/chat")
async def chat_with_coach(req: Request):
    """
    Proxies chat requests to the Gemini API securely.
    Reads GEMINI_API_KEY from environment variables.
    """
    import requests
    import logging
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured on server.")
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    
    try:
        body = await req.json()
        resp = requests.post(url, json=body)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logging.error(f"Chat API error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Task Recommendation Endpoints ─────────────────────────────────

@app.get("/get-tasks")
def get_tasks(
    mood: int = Query(...),
    urge: int = Query(...),
    streak: int = Query(...),
    user_id: Optional[str] = Query(None),
    addiction_type: Optional[str] = Query(None)
):
    """
    Returns 3 recommended tasks.
    - Free users: tasks from general knowledge base only
    - Premium users: tasks from merged general + clinician pool
    """
    user_bandit = get_bandit_for_user(user_id)
    recommended_tasks = []
    seen_ids = set()

    # Loop to get 3 unique tasks
    attempts = 0
    while len(recommended_tasks) < 3 and attempts < 30:
        task_id = user_bandit.select_task(mood, urge, streak, addiction_type)
        if task_id not in seen_ids:
            seen_ids.add(task_id)
            task_info = next((t for t in user_bandit.tasks if t["id"] == task_id), None)
            if task_info:
                recommended_tasks.append(task_info)
        attempts += 1

    # For premium users, also include avoid warnings
    avoid_tasks = []
    is_premium = False
    if user_id:
        merged = merger.get_merged_tasks(user_id)
        avoid_tasks = merged.get("avoid_tasks", [])
        is_premium = merged.get("is_premium", False)

    return {
        "tasks": recommended_tasks,
        "avoid_tasks": avoid_tasks,
        "is_premium": is_premium,
    }


@app.post("/complete-task")
def complete_task(req: TaskCompletionRequest):
    """
    Records task completion and updates the RL model.
    This endpoint powers the AI learning loop:
    1. Calculates reward from urge change + completion
    2. Updates the local Q-table (per-session learning)
    3. Records outcome to PostgreSQL (cross-user learning)
    """
    user_bandit = get_bandit_for_user(req.user_id)

    # Calculate reward
    reward = user_bandit.calculate_reward(
        completed=req.completed,
        prev_urge=req.prev_urge,
        next_urge=req.next_urge
    )

    # Define state
    state = user_bandit.get_state(req.mood, req.prev_urge, req.streak)

    # Determine task source
    task_source = user_bandit.get_task_source(req.task_id)

    # Check if user is premium
    is_premium = False
    if req.user_id:
        user = db.get_user(req.user_id)
        is_premium = user.get("is_premium", False) if user else False

    # Update model AND record outcome for cross-user learning
    new_q = user_bandit.record_and_learn(
        state=state,
        task_id=req.task_id,
        reward=reward,
        user_id=req.user_id,
        task_source=task_source,
        addiction_type=req.addiction_type,
        mood_before=req.mood,
        urge_before=req.prev_urge,
        urge_after=req.next_urge,
        completed=req.completed,
        streak=req.streak,
        is_premium=is_premium
    )

    return {
        "status": "success",
        "reward": reward,
        "new_q_value": new_q,
        "task_source": task_source,
        "learning_recorded": bool(req.user_id)
    }


# ── User Management Endpoints ─────────────────────────────────────

@app.post("/user/create")
def create_user(req: UserCreateRequest):
    """Creates a new user in the database. Contact must be unique."""
    # Check if contact already exists
    if req.contact:
        if db.check_contact_exists(req.contact):
            raise HTTPException(status_code=409, detail="This email/phone is already registered. Please login instead.")
    user = db.create_user(
        name=req.name,
        password=req.password,
        contact=req.contact,
        addiction_types=req.addiction_types,
        facility_code=req.facility_code,
        is_premium=req.is_premium,
        dob=req.dob
    )
    return {"status": "success", "user": user}

@app.post("/user/login")
def login_user(req: UserLoginRequest):
    """Authenticates a user by contact (email/phone) and password."""
    user = db.authenticate_user(req.contact, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email/phone or password")
    return {"status": "success", "user": user}

@app.get("/user/check-contact")
def check_contact(contact: str = Query(...)):
    """Checks if a contact (email/phone) is already registered."""
    exists = db.check_contact_exists(contact)
    return {"exists": exists}


@app.get("/user/{user_id}")
def get_user(user_id: str):
    """Fetches a user by ID."""
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.post("/user/set-premium")
def set_premium(req: PremiumToggleRequest):
    """Toggles premium status for a user."""
    user = db.set_premium(req.user_id, req.is_premium)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Invalidate cached bandit so it reloads with merged tasks
    if req.user_id in user_bandits:
        del user_bandits[req.user_id]

    return {
        "status": "success",
        "user": user,
        "message": f"Premium {'activated' if req.is_premium else 'deactivated'}"
    }


# ── Facility Auth and Approval Endpoints ────────────────────────────────────

import string
import random

@app.post("/facility/register")
def register_facility(req: FacilityRegisterRequest):
    """Registers a new facility and generates a unique access code."""
    # Generate a random 8-character uppercase alphanumeric code
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
    
    facility = db.create_facility(req.name, code, req.password)
    if not facility:
        raise HTTPException(status_code=400, detail="Failed to create facility")
    return {"status": "success", "facility": facility}

@app.post("/facility/login")
def login_facility(req: FacilityLoginRequest):
    """Authenticates a facility using its access code and password."""
    facility = db.authenticate_facility(req.code, req.password)
    if not facility:
        raise HTTPException(status_code=401, detail="Invalid code or password")
    return {"status": "success", "facility": facility}

@app.get("/facility/patients/{facility_code}")
def get_facility_patients(facility_code: str):
    """
    Returns all approved (active) patients linked to a facility.
    Enriches each patient with their client data (check-ins, journal, etc.) if available.
    """
    patients = db.get_facility_patients(facility_code.upper())
    enriched = []
    for p in patients:
        pid = str(p["id"])
        # Try to load client data for this patient
        client_dir = os.path.join("client data", pid)
        checkins = []
        journal = []
        xp = 0
        assessment = {}
        profile = {}
        if os.path.isdir(client_dir):
            # Load profile
            profile_path = os.path.join(client_dir, "profile.json")
            if os.path.isfile(profile_path):
                try:
                    with open(profile_path, "r") as f:
                        profile = json.load(f)
                except: pass
            # Load check-ins
            ci_path = os.path.join(client_dir, "checkins.json")
            if os.path.isfile(ci_path):
                try:
                    with open(ci_path, "r") as f:
                        checkins = json.load(f)
                except: pass
            # Load journal
            j_path = os.path.join(client_dir, "journal.json")
            if os.path.isfile(j_path):
                try:
                    with open(j_path, "r") as f:
                        journal = json.load(f)
                except: pass

        # Calculate age from dob
        age = "?"
        if p.get("dob"):
            try:
                from datetime import date as _date
                dob = p["dob"] if isinstance(p["dob"], _date) else _date.fromisoformat(str(p["dob"]))
                today = _date.today()
                age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
            except: pass

        enriched.append({
            "id": pid,
            "name": p["name"],
            "contact": p.get("contact"),
            "age": profile.get("age") or age,
            "gender": profile.get("gender", "?"),
            "addictions": p.get("addiction_types") or profile.get("addictions") or [],
            "startDate": profile.get("startDate") or str(p.get("created_at", ""))[:10],
            "goal": profile.get("goal", "abstinence"),
            "checkins": checkins,
            "journal": journal,
            "xp": profile.get("xp", xp),
            "assessment": profile.get("assessment", assessment),
            "riskLevel": profile.get("riskLevel", "low"),
            "is_premium": p.get("is_premium", False),
        })

    return {
        "facility_code": facility_code.upper(),
        "patient_count": len(enriched),
        "patients": enriched
    }


@app.get("/facility/pending-users/{facility_code}")
def get_pending_users(facility_code: str):
    """
    Returns all users with status='pending' for a specific facility.
    Used by the facility portal's Approvals tab.
    """
    pending = db.get_pending_users(facility_code.upper())
    return {
        "facility_code": facility_code.upper(),
        "pending_count": len(pending),
        "users": pending
    }


@app.post("/facility/approve/{user_id}")
def approve_user(user_id: str):
    """
    Approves a pending user — sets their status to 'active'.
    Called by facility admin from the approvals dashboard.
    """
    user = db.approve_user(user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found or not in pending status"
        )
    return {
        "status": "success",
        "message": f"{user['name']} has been approved",
        "user": user
    }


@app.post("/facility/reject/{user_id}")
def reject_user(user_id: str):
    """
    Rejects a pending user — sets their status to 'rejected'.
    Called by facility admin from the approvals dashboard.
    """
    user = db.reject_user(user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found or not in pending status"
        )
    return {
        "status": "success",
        "message": f"{user['name']} has been rejected",
        "user": user
    }


@app.get("/user/status/{user_id}")
def get_user_status(user_id: str):
    """
    Returns just the status field for a user.
    Used by the frontend to poll for approval status.
    """
    status = db.get_user_status(user_id)
    if status is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user_id": user_id, "status": status}


# ── Patient Data Sync ──────────────────────────────────────────────

class PatientSyncRequest(BaseModel):
    """Sync patient data (check-ins, journal, profile) to the server."""
    user_id: str
    checkins: list = []
    journal: list = []
    profile: dict = {}
    xp: int = 0
    badges: list = []

@app.post("/patient/sync")
def sync_patient_data(req: PatientSyncRequest):
    """
    Receives the patient's full localStorage state and persists it
    to client data/{user_id}/ files on the server.
    This enables the facility portal to read real patient data.
    Called after every check-in, journal save, and on app init.
    """
    client_dir = os.path.join("client data", req.user_id)
    os.makedirs(client_dir, exist_ok=True)

    # Save check-ins
    ci_path = os.path.join(client_dir, "checkins.json")
    with open(ci_path, "w", encoding="utf-8") as f:
        json.dump(req.checkins, f, indent=2, default=str)

    # Save journal
    j_path = os.path.join(client_dir, "journal.json")
    with open(j_path, "w", encoding="utf-8") as f:
        json.dump(req.journal, f, indent=2, default=str)

    # Save profile
    profile_path = os.path.join(client_dir, "profile.json")
    profile_data = req.profile.copy() if req.profile else {}
    profile_data["xp"] = req.xp
    profile_data["badges"] = req.badges
    with open(profile_path, "w", encoding="utf-8") as f:
        json.dump(profile_data, f, indent=2, default=str)

    return {
        "status": "success",
        "synced": {
            "checkins": len(req.checkins),
            "journal": len(req.journal),
            "has_profile": bool(req.profile)
        }
    }


# ── Clinician Task Endpoints ──────────────────────────────────────

@app.post("/clinician/upload-tasks")
def upload_clinician_tasks(req: ClinicianUploadRequest):
    """
    Clinician uploads custom tasks for a specific premium user.
    These tasks get merged with the general knowledge base for
    personalized recommendations.
    
    AUDIT: Also saves an isolated JSON record to client data/{user_id}/
    for compliance and external system access.
    """
    user = db.get_user(req.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Upload tasks to database (for AI consumption)
    tasks_data = [t.model_dump() for t in req.tasks]
    created = db.upload_clinician_tasks(
        user_id=req.user_id,
        tasks=tasks_data,
        clinician_name=req.clinician_name
    )

    # AUDIT: Save an isolated JSON record to the file system
    # This creates client data/{user_id}/task_upload_YYYYMMDD_HHMMSS.json
    audit_record = client_data_manager.save_clinical_record(
        client_id=req.user_id,
        record_type="task_upload",
        data={
            "tasks_uploaded": tasks_data,
            "tasks_created_count": len(created),
            "task_ids": [t["id"] for t in created]
        },
        clinician_name=req.clinician_name,
        facility_code=user.get("facility_code")
    )

    # Invalidate cached bandit so it reloads with new clinician tasks
    if req.user_id in user_bandits:
        del user_bandits[req.user_id]

    return {
        "status": "success",
        "tasks_created": len(created),
        "tasks": created,
        "audit_file": audit_record["filename"]
    }


@app.get("/clinician/get-tasks/{user_id}")
def get_clinician_tasks_for_user(user_id: str):
    """Returns all clinician-prescribed tasks for a specific user."""
    tasks = db.get_clinician_tasks(user_id)
    return {
        "user_id": user_id,
        "task_count": len(tasks),
        "tasks": tasks
    }


@app.delete("/clinician/delete-task/{task_id}")
def delete_clinician_task(task_id: int):
    """Deletes a clinician-prescribed task."""
    deleted = db.delete_clinician_task(task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "success", "deleted_task_id": task_id}


# ── Treatment Plan Persistence ──────────────────────────────────

class TreatmentPlanSave(BaseModel):
    user_id: str
    diagnosis: str = ""
    meds: str = ""
    therapy: str = ""
    goals: list = []
    notes: str = ""    # visible to patient
    cnotes: str = ""   # private — NOT sent to patient
    appt: str = ""

@app.post("/treatment-plan/save")
def save_treatment_plan(req: TreatmentPlanSave):
    """Saves a treatment plan for a patient. Called by the facility portal."""
    client_dir = os.path.join("client data", req.user_id)
    os.makedirs(client_dir, exist_ok=True)
    plan_path = os.path.join(client_dir, "treatment_plan.json")
    plan_data = {
        "diagnosis": req.diagnosis,
        "meds": req.meds,
        "therapy": req.therapy,
        "goals": req.goals,
        "notes": req.notes,
        "cnotes": req.cnotes,
        "appt": req.appt,
        "updated_at": str(datetime.now())
    }
    with open(plan_path, "w") as f:
        json.dump(plan_data, f, indent=2)
    return {"status": "success", "message": "Treatment plan saved"}

@app.get("/treatment-plan/{user_id}")
def get_treatment_plan(user_id: str):
    """Returns the treatment plan for a patient (without private clinician notes)."""
    plan_path = os.path.join("client data", user_id, "treatment_plan.json")
    if not os.path.isfile(plan_path):
        return {"has_plan": False, "plan": None}
    with open(plan_path, "r") as f:
        plan = json.load(f)
    # Strip private clinician notes — patient should not see those
    plan.pop("cnotes", None)
    return {"has_plan": True, "plan": plan}


@app.get("/patient/my-care/{user_id}")
def get_patient_care(user_id: str):
    """
    Returns everything a patient needs to see from their clinic:
    - Treatment plan (without private notes)
    - Clinician-prescribed tasks
    - Facility info
    """
    # Get user info
    user = db.get_user(user_id)
    facility_name = None
    if user and user.get("facility_code"):
        with db.get_connection() as conn:
            cur = db.get_cursor(conn)
            cur.execute("SELECT name FROM facilities WHERE code = %s", (user["facility_code"],))
            fac = cur.fetchone()
            if fac:
                facility_name = fac["name"]

    # Get treatment plan
    plan_path = os.path.join("client data", user_id, "treatment_plan.json")
    plan = None
    if os.path.isfile(plan_path):
        with open(plan_path, "r") as f:
            plan = json.load(f)
        plan.pop("cnotes", None)  # strip private notes

    # Get clinician tasks
    tasks = db.get_clinician_tasks(user_id)

    return {
        "facility_name": facility_name,
        "facility_code": user.get("facility_code") if user else None,
        "treatment_plan": plan,
        "clinician_tasks": tasks,
        "task_count": len(tasks),
    }




@app.get("/analytics/top-tasks/{addiction_type}")
def get_top_tasks(addiction_type: str, limit: int = Query(10, ge=1, le=50)):
    """
    Returns the top-performing tasks for a given addiction type,
    based on aggregate outcomes from ALL users.
    Useful for:
    - Showing clinicians what works best for their patients
    - Validating the AI learning loop is working
    """
    top = db.get_top_tasks_for_addiction(addiction_type, limit)
    return {
        "addiction_type": addiction_type,
        "top_tasks": top
    }


@app.get("/analytics/clinician-vs-general/{addiction_type}")
def clinician_vs_general(addiction_type: str):
    """
    Compares average performance of clinician-prescribed tasks 
    vs general knowledge base tasks for a specific addiction type.
    Demonstrates the value of premium clinician input.
    """
    stats = db.get_clinician_vs_general_stats(addiction_type)
    return {
        "addiction_type": addiction_type,
        "comparison": stats
    }


@app.get("/ai-learning-log")
def get_ai_learning_log():
    """
    Generates and returns a complete AI learning report.
    Shows what the RL model has learned from all user interactions.
    """
    from ai_learning_log import generate_learning_log
    log = generate_learning_log()
    return log


# ── Client Records API (External System Access) ──────────────────

@app.get("/api/v1/client-records/{client_id}")
def get_client_records(
    client_id: str,
    record_type: Optional[str] = Query(None, description="Filter by record type e.g. task_upload, schedule, notes")
):
    """
    Returns ALL audit JSON records for a specific premium client.
    External systems (EHR, billing, compliance) can call this endpoint
    to pull the complete clinical history for a patient.
    
    Free-tier users will return an empty list (they have no audit files).
    """
    if record_type:
        records = client_data_manager.get_records_by_type(client_id, record_type)
    else:
        records = client_data_manager.get_all_records(client_id)

    return {
        "client_id": client_id,
        "record_count": len(records),
        "has_data": client_data_manager.client_has_data(client_id),
        "records": records
    }


@app.delete("/api/v1/client-records/{client_id}")
def delete_client_records(client_id: str):
    """
    Deletes ALL audit records for a client. DESTRUCTIVE.
    Use with extreme caution — for compliance/GDPR data erasure requests.
    """
    deleted = client_data_manager.delete_client_data(client_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="No data found for this client")
    return {
        "status": "success",
        "message": f"All audit records deleted for client {client_id}"
    }


# ── External Facility Scheduling API ──────────────────────────────

@app.post("/api/v1/external/schedule")
def external_schedule(req: ExternalScheduleRequest):
    """
    External endpoint for facility scheduling systems (EMRs, schedulers).
    When a facility creates a weekly/monthly schedule for a patient,
    they POST here. The system:
    1. Validates the user is premium
    2. Inserts the tasks into the clinician_tasks DB table (for AI use)
    3. Saves an audit JSON in client data/{user_id}/ (for record keeping)
    """
    # Verify user exists and is premium
    user = db.get_user(req.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.get("is_premium"):
        raise HTTPException(
            status_code=403,
            detail="User must be premium to receive scheduled tasks"
        )

    # Convert schedule tasks to clinician task format and insert into DB
    tasks_data = [t.model_dump() for t in req.tasks]
    created = db.upload_clinician_tasks(
        user_id=req.user_id,
        tasks=tasks_data,
        clinician_name=req.clinician_name
    )

    # Save an audit record to the file system
    audit_record = client_data_manager.save_clinical_record(
        client_id=req.user_id,
        record_type="schedule",
        data={
            "schedule_period": req.schedule_period,
            "schedule_label": req.schedule_label,
            "tasks": tasks_data,
            "tasks_created_count": len(created)
        },
        clinician_name=req.clinician_name,
        facility_code=req.facility_code
    )

    # Invalidate cached bandit so it picks up new tasks
    if req.user_id in user_bandits:
        del user_bandits[req.user_id]

    return {
        "status": "success",
        "schedule_period": req.schedule_period,
        "tasks_created": len(created),
        "audit_file": audit_record["filename"],
        "message": f"Schedule posted for {user['name']} ({req.schedule_period})"
    }
