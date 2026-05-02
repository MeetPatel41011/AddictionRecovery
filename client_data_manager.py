"""
Client Data Manager — File-based clinical record keeping.
Creates isolated directories for each premium client under 'client data/{client_id}/'.
Every clinical update creates a timestamped JSON audit file.
Free-tier users are explicitly excluded from this system.
"""

import os
import json
import logging
from datetime import datetime
from typing import List, Dict, Optional

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Base directory for all client data — sits inside the project folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CLIENT_DATA_ROOT = os.path.join(BASE_DIR, "client data")


def _get_client_dir(client_id: str) -> str:
    """Returns the absolute path to a specific client's data directory."""
    return os.path.join(CLIENT_DATA_ROOT, str(client_id))


def ensure_client_dir(client_id: str) -> str:
    """
    Creates the client's data directory if it doesn't exist.
    Returns the directory path.
    """
    client_dir = _get_client_dir(client_id)
    os.makedirs(client_dir, exist_ok=True)
    logger.info(f"Ensured client directory exists: {client_dir}")
    return client_dir


def save_clinical_record(
    client_id: str,
    record_type: str,
    data: dict,
    clinician_name: str = "Unknown Clinician",
    facility_code: str = None
) -> dict:
    """
    Saves a clinical update as a timestamped JSON file in the client's folder.

    Args:
        client_id: The UUID of the premium user
        record_type: Type of record (e.g., 'schedule', 'notes', 'task_update')
        data: The actual clinical data to save
        clinician_name: Name of the clinician making the update
        facility_code: The facility code for traceability

    Returns:
        Dict with file path and metadata about the saved record
    """
    client_dir = ensure_client_dir(client_id)

    # Create a unique filename with timestamp
    timestamp = datetime.now()
    filename = f"{record_type}_{timestamp.strftime('%Y%m%d_%H%M%S_%f')}.json"
    filepath = os.path.join(client_dir, filename)

    # Build the complete record with metadata envelope
    record = {
        "meta": {
            "client_id": str(client_id),
            "record_type": record_type,
            "clinician_name": clinician_name,
            "facility_code": facility_code,
            "created_at": timestamp.isoformat(),
            "filename": filename
        },
        "data": data
    }

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(record, f, indent=2, ensure_ascii=False, default=str)

    logger.info(f"Saved clinical record: {filepath}")
    return {
        "filename": filename,
        "filepath": filepath,
        "record_type": record_type,
        "created_at": timestamp.isoformat()
    }


def get_all_records(client_id: str) -> List[Dict]:
    """
    Reads and returns ALL JSON records for a specific client.
    Returns them sorted by creation time (newest first).
    Returns empty list if the client has no directory (e.g., free-tier user).
    """
    client_dir = _get_client_dir(client_id)

    if not os.path.exists(client_dir):
        logger.info(f"No data directory found for client {client_id} (likely free-tier)")
        return []

    records = []
    for filename in os.listdir(client_dir):
        if not filename.endswith('.json'):
            continue
        filepath = os.path.join(client_dir, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                record = json.load(f)
                records.append(record)
        except (json.JSONDecodeError, IOError) as e:
            logger.warning(f"Could not read {filepath}: {e}")

    # Sort newest first
    records.sort(key=lambda r: r.get('meta', {}).get('created_at', ''), reverse=True)
    logger.info(f"Retrieved {len(records)} records for client {client_id}")
    return records


def get_records_by_type(client_id: str, record_type: str) -> List[Dict]:
    """Returns only records matching a specific type (e.g., 'schedule', 'notes')."""
    all_records = get_all_records(client_id)
    return [r for r in all_records if r.get('meta', {}).get('record_type') == record_type]


def client_has_data(client_id: str) -> bool:
    """Checks if a client has any clinical data on file."""
    client_dir = _get_client_dir(client_id)
    if not os.path.exists(client_dir):
        return False
    return any(f.endswith('.json') for f in os.listdir(client_dir))


def delete_client_data(client_id: str) -> bool:
    """
    Deletes ALL data for a client. Use with extreme caution.
    Returns True if data was deleted, False if no data existed.
    """
    import shutil
    client_dir = _get_client_dir(client_id)
    if os.path.exists(client_dir):
        shutil.rmtree(client_dir)
        logger.info(f"DELETED all data for client {client_id}")
        return True
    return False


if __name__ == "__main__":
    # Quick test
    test_id = "test-client-001"
    save_clinical_record(
        client_id=test_id,
        record_type="schedule",
        data={
            "tasks": [
                {"task": "Morning meditation", "time": "8:00 AM", "difficulty": "Low"},
                {"task": "Attend group therapy", "time": "2:00 PM", "difficulty": "Medium"}
            ],
            "period": "weekly",
            "week_of": "2026-04-15"
        },
        clinician_name="Dr. Smith",
        facility_code="CLINIC001"
    )
    records = get_all_records(test_id)
    print(f"Saved and retrieved {len(records)} records for {test_id}")
    print(json.dumps(records, indent=2))
    # Cleanup test
    delete_client_data(test_id)
    print("Test data cleaned up.")
