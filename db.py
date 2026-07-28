"""
Database layer for Recovery Compass — Neon PostgreSQL.
Handles users, clinician tasks, and task outcomes (AI learning engine).
"""

import os
import logging
import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from dotenv import load_dotenv

load_dotenv(override=True)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ── Connection ──────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL")


@contextmanager
def get_connection():
    """Context manager for database connections."""
    conn = None
    try:
        conn = psycopg2.connect(DATABASE_URL)
        yield conn
        conn.commit()
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Database error: {e}")
        raise
    finally:
        if conn:
            conn.close()


def get_cursor(conn):
    """Returns a RealDictCursor for dict-like row access."""
    return conn.cursor(cursor_factory=RealDictCursor)


# ── Table Creation ──────────────────────────────────────────────
def init_tables():
    """Creates all required tables if they don't exist."""
    with get_connection() as conn:
        cur = conn.cursor()

        # Users table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                password VARCHAR(255),
                contact VARCHAR(255) UNIQUE,
                is_premium BOOLEAN DEFAULT FALSE,
                addiction_types TEXT[] DEFAULT '{}',
                facility_code VARCHAR(50),
                status VARCHAR(20) DEFAULT 'active',
                dob DATE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)

        # Facilities table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS facilities (
                code VARCHAR(50) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)

        # Migrate existing users table if columns are missing
        cur.execute("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='users' AND column_name='status') THEN
                    ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'active';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='users' AND column_name='dob') THEN
                    ALTER TABLE users ADD COLUMN dob DATE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='users' AND column_name='password') THEN
                    ALTER TABLE users ADD COLUMN password VARCHAR(255);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='users' AND column_name='contact') THEN
                    ALTER TABLE users ADD COLUMN contact VARCHAR(255);
                END IF;
            END $$;
        """)

        # Add unique index on contact (ignore nulls from old rows)
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_contact_unique
            ON users(contact) WHERE contact IS NOT NULL;
        """)

        # Clinician tasks — per-user custom tasks from medical facilities
        cur.execute("""
            CREATE TABLE IF NOT EXISTS clinician_tasks (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                condition_trigger TEXT NOT NULL,
                actionable_task TEXT NOT NULL,
                task_type VARCHAR(10) DEFAULT 'do' CHECK (task_type IN ('do', 'avoid')),
                dimension TEXT,
                difficulty VARCHAR(10) DEFAULT 'Medium' CHECK (difficulty IN ('Low', 'Medium', 'High')),
                priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
                addiction_type VARCHAR(50),
                created_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)

        # Task outcomes — the AI learning engine
        # Every task completion (free + premium) is recorded here
        # The RL model queries aggregates to warm-start Q-values for new users
        cur.execute("""
            CREATE TABLE IF NOT EXISTS task_outcomes (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                task_id VARCHAR(100) NOT NULL,
                task_source VARCHAR(20) DEFAULT 'general' CHECK (task_source IN ('general', 'clinician')),
                addiction_type VARCHAR(50),
                mood_before INTEGER,
                urge_before INTEGER,
                urge_after INTEGER,
                completed BOOLEAN DEFAULT TRUE,
                reward FLOAT,
                streak INTEGER DEFAULT 0,
                is_premium BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            );
        """)

        # Index for fast aggregate queries (the AI learning loop)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_outcomes_task_addiction
            ON task_outcomes(task_id, addiction_type);
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_outcomes_source
            ON task_outcomes(task_source, addiction_type);
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_clinician_tasks_user
            ON clinician_tasks(user_id);
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_status
            ON users(status);
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_facility
            ON users(facility_code);
        """)

        logger.info("All database tables initialized successfully.")


# ── User CRUD ──────────────────────────────────────────────────
def create_user(name: str, password: str = None, contact: str = None, addiction_types: list = None,
                facility_code: str = None, is_premium: bool = False, dob: str = None) -> dict:
    """
    Creates a user and returns their record.
    If facility_code is provided, the user starts with status='pending'.
    Otherwise, they start as 'active'.
    contact is the user's email or phone number — must be unique.
    """
    # If user has a facility code, they need facility approval first
    status = 'pending' if facility_code else 'active'
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """INSERT INTO users (name, password, contact, addiction_types, facility_code, is_premium, status, dob)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (name, password, contact, addiction_types or [], facility_code, is_premium, status, dob)
        )
        user = cur.fetchone()
        logger.info(f"Created user: {user['name']} (id={user['id']}, contact={user.get('contact')}, status={user['status']})")
        return dict(user)


def get_user(user_id: str) -> dict:
    """Fetches a user by ID."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def set_premium(user_id: str, is_premium: bool) -> dict:
    """Toggles a user's premium status."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute(
            "UPDATE users SET is_premium = %s WHERE id = %s RETURNING *",
            (is_premium, user_id)
        )
        user = cur.fetchone()
        if user:
            logger.info(f"User {user['name']} premium status: {is_premium}")
            return dict(user)
        return None


def authenticate_user(contact: str, password: str) -> dict:
    """Authenticates a user by contact (email/phone) and password."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT * FROM users WHERE contact = %s AND password = %s", (contact, password))
        row = cur.fetchone()
        return dict(row) if row else None


def check_contact_exists(contact: str) -> bool:
    """Returns True if a user with this contact (email/phone) already exists."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT 1 FROM users WHERE contact = %s", (contact,))
        return cur.fetchone() is not None


# ── Facility CRUD ──────────────────────────────────────────────
def create_facility(name: str, code: str, password: str) -> dict:
    """Creates a new facility with a specific access code."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        try:
            cur.execute(
                "INSERT INTO facilities (code, name, password) VALUES (%s, %s, %s) RETURNING *",
                (code, name, password)
            )
            facility = cur.fetchone()
            logger.info(f"Created facility: {facility['name']} with code {facility['code']}")
            return dict(facility)
        except Exception as e:
            logger.error(f"Failed to create facility: {e}")
            return None


def authenticate_facility(code: str, password: str) -> dict:
    """Authenticates a facility by code and password."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT * FROM facilities WHERE code = %s AND password = %s", (code, password))
        row = cur.fetchone()
        return dict(row) if row else None


def get_facility_patients(facility_code: str) -> list:
    """
    Returns all users linked to a facility who have been approved (status='active').
    These are real patients who registered with the facility code.
    """
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """SELECT id, name, contact, addiction_types, dob, status, created_at, is_premium, facility_code
               FROM users 
               WHERE facility_code = %s AND status = 'active'
               ORDER BY created_at DESC""",
            (facility_code,)
        )
        return [dict(row) for row in cur.fetchall()]


# ── Facility Approval Workflow ──────────────────────────────────
def get_pending_users(facility_code: str = None) -> list:
    """
    Returns all users with status='pending'.
    If facility_code is provided, filters to that facility only.
    """
    with get_connection() as conn:
        cur = get_cursor(conn)
        if facility_code:
            cur.execute(
                "SELECT * FROM users WHERE status = 'pending' AND facility_code = %s ORDER BY created_at DESC",
                (facility_code,)
            )
        else:
            cur.execute("SELECT * FROM users WHERE status = 'pending' ORDER BY created_at DESC")
        return [dict(row) for row in cur.fetchall()]


def approve_user(user_id: str) -> dict:
    """Approves a pending user — sets status to 'active'."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute(
            "UPDATE users SET status = 'active' WHERE id = %s AND status = 'pending' RETURNING *",
            (user_id,)
        )
        user = cur.fetchone()
        if user:
            logger.info(f"APPROVED user: {user['name']} (id={user['id']})")
            return dict(user)
        return None


def reject_user(user_id: str) -> dict:
    """Rejects a pending user — sets status to 'rejected'."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute(
            "UPDATE users SET status = 'rejected' WHERE id = %s AND status = 'pending' RETURNING *",
            (user_id,)
        )
        user = cur.fetchone()
        if user:
            logger.info(f"REJECTED user: {user['name']} (id={user['id']})")
            return dict(user)
        return None


def get_user_status(user_id: str) -> str:
    """Returns just the status field for a user, or None if not found."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute("SELECT status FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        return row['status'] if row else None


# ── Clinician Tasks CRUD ────────────────────────────────────────
def upload_clinician_tasks(user_id: str, tasks: list, clinician_name: str = "Unknown") -> list:
    """
    Uploads a batch of clinician-prescribed tasks for a specific user.
    Each task should be a dict with: condition_trigger, actionable_task, task_type,
    difficulty, priority, addiction_type, dimension (optional).
    """
    created = []
    with get_connection() as conn:
        cur = get_cursor(conn)
        for task in tasks:
            cur.execute(
                """INSERT INTO clinician_tasks 
                   (user_id, condition_trigger, actionable_task, task_type, 
                    dimension, difficulty, priority, addiction_type, created_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
                (
                    user_id,
                    task.get("condition_trigger", ""),
                    task.get("actionable_task", ""),
                    task.get("task_type", "do"),
                    task.get("dimension"),
                    task.get("difficulty", "Medium"),
                    task.get("priority", 3),
                    task.get("addiction_type"),
                    clinician_name
                )
            )
            created.append(dict(cur.fetchone()))

    logger.info(f"Uploaded {len(created)} clinician tasks for user {user_id}")
    return created


def get_clinician_tasks(user_id: str) -> list:
    """Fetches all clinician-prescribed tasks for a user."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute(
            "SELECT * FROM clinician_tasks WHERE user_id = %s ORDER BY priority DESC, created_at DESC",
            (user_id,)
        )
        return [dict(row) for row in cur.fetchall()]


def delete_clinician_task(task_id: int) -> bool:
    """Deletes a single clinician task by its ID."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute("DELETE FROM clinician_tasks WHERE id = %s", (task_id,))
        deleted = cur.rowcount > 0
        if deleted:
            logger.info(f"Deleted clinician task {task_id}")
        return deleted


# ── Task Outcomes (AI Learning Engine) ──────────────────────────
def record_outcome(
    user_id: str,
    task_id: str,
    task_source: str,        # "general" or "clinician"
    addiction_type: str,
    mood_before: int,
    urge_before: int,
    urge_after: int,
    completed: bool,
    reward: float,
    streak: int = 0,
    is_premium: bool = False
) -> dict:
    """
    Records a task completion outcome.
    This is the raw data the AI learning loop uses to get smarter.
    """
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """INSERT INTO task_outcomes 
               (user_id, task_id, task_source, addiction_type, 
                mood_before, urge_before, urge_after, completed, 
                reward, streak, is_premium)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (user_id, task_id, task_source, addiction_type,
             mood_before, urge_before, urge_after, completed,
             reward, streak, is_premium)
        )
        outcome = dict(cur.fetchone())
        logger.info(f"Recorded outcome: task={task_id}, reward={reward:.2f}, source={task_source}")
        return outcome


def get_aggregate_reward(task_id: str, addiction_type: str) -> float:
    """
    Returns the average reward a task has earned historically
    across ALL users with the given addiction type.
    
    This is the core of cross-user learning:
    - A task that reduces urge well for alcohol users will have a high avg reward
    - New alcohol users instantly benefit from this aggregate intelligence
    """
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """SELECT AVG(reward) as avg_reward, COUNT(*) as sample_count
               FROM task_outcomes 
               WHERE task_id = %s AND addiction_type = %s""",
            (task_id, addiction_type)
        )
        row = cur.fetchone()
        if row and row['avg_reward'] is not None and row['sample_count'] >= 3:
            # Only use aggregate if we have enough samples (>=3) to avoid noise
            return float(row['avg_reward'])
        return 0.0


def get_aggregate_rewards_batch(addiction_type: str) -> dict:
    """
    Returns average rewards for ALL tasks for a given addiction type
    in a SINGLE query. Much faster than calling get_aggregate_reward per task.
    
    Returns: { task_id: avg_reward } for tasks with >= 3 samples
    """
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """SELECT task_id, AVG(reward) as avg_reward, COUNT(*) as sample_count
               FROM task_outcomes 
               WHERE addiction_type = %s
               GROUP BY task_id
               HAVING COUNT(*) >= 3""",
            (addiction_type,)
        )
        return {
            row['task_id']: float(row['avg_reward']) 
            for row in cur.fetchall()
        }


def get_top_tasks_for_addiction(addiction_type: str, limit: int = 10) -> list:
    """
    Returns the top-performing tasks for a given addiction type,
    ranked by average reward. Used to suggest effective tasks
    to clinicians treating patients with this addiction.
    """
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """SELECT task_id, task_source, 
                      AVG(reward) as avg_reward,
                      COUNT(*) as times_used,
                      AVG(urge_before - urge_after) as avg_urge_reduction
               FROM task_outcomes 
               WHERE addiction_type = %s AND completed = TRUE
               GROUP BY task_id, task_source
               HAVING COUNT(*) >= 3
               ORDER BY avg_reward DESC
               LIMIT %s""",
            (addiction_type, limit)
        )
        return [dict(row) for row in cur.fetchall()]


def get_clinician_vs_general_stats(addiction_type: str) -> dict:
    """
    Compares clinician task performance vs general task performance
    for a given addiction type. Used to demonstrate premium value.
    """
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute(
            """SELECT task_source,
                      AVG(reward) as avg_reward,
                      COUNT(*) as total_completions,
                      AVG(urge_before - urge_after) as avg_urge_reduction
               FROM task_outcomes
               WHERE addiction_type = %s AND completed = TRUE
               GROUP BY task_source""",
            (addiction_type,)
        )
        results = {row['task_source']: dict(row) for row in cur.fetchall()}
        return results


# ── Initialize on import ────────────────────────────────────────
if __name__ == "__main__":
    init_tables()
    print("[OK] Database tables created successfully!")

def check_chat_rate_limit(ip_address: str) -> bool:
    """Returns True if allowed, False if blocked (over 7/hour or 100/week)."""
    try:
        with get_connection() as conn:
            cur = conn.cursor()
            
            cur.execute("""
                CREATE TABLE IF NOT EXISTS chat_requests (
                    id SERIAL PRIMARY KEY,
                    ip_address VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Check last hour
            cur.execute("""
                SELECT COUNT(*) FROM chat_requests 
                WHERE ip_address = %s AND created_at >= NOW() - INTERVAL '1 hour'
            """, (ip_address,))
            hour_count = cur.fetchone()[0]
            
            # Check last week
            cur.execute("""
                SELECT COUNT(*) FROM chat_requests 
                WHERE ip_address = %s AND created_at >= NOW() - INTERVAL '1 week'
            """, (ip_address,))
            week_count = cur.fetchone()[0]
            
            if hour_count >= 7 or week_count >= 100:
                return False
                
            # Log this request
            cur.execute("INSERT INTO chat_requests (ip_address) VALUES (%s)", (ip_address,))
            return True
    except Exception as e:
        logger.error(f"Rate limit DB error (failing open): {e}")
        return True
