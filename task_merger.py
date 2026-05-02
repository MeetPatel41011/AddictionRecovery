"""
Task Merger — Combines general knowledge base tasks with clinician-prescribed tasks.
For premium users, the merged pool is used by the RL model for recommendations.
"""

import json
import logging
from typing import List, Dict, Optional
from db import get_clinician_tasks, get_user

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class TaskMerger:
    """
    Merges two task sources:
    1. General knowledge base (output.json) — available to all users
    2. Clinician-prescribed tasks (PostgreSQL) — available to premium users only
    
    Merging rules:
    - Clinician tasks get source='clinician' and higher priority_weight
    - General tasks get source='general' and normal weight
    - "avoid" tasks are separated from "do" tasks in the output
    - If a clinician task's trigger overlaps with a general task, clinician wins
    """

    def __init__(self, general_json_path: str = "output.json"):
        self.general_tasks = self._load_general_tasks(general_json_path)

    @staticmethod
    def _load_general_tasks(json_path: str) -> List[Dict]:
        """Loads and indexes the general task database."""
        try:
            with open(json_path, 'r', encoding='utf-8') as f:
                raw = json.load(f)
            tasks = []
            for idx, task in enumerate(raw.get("data", [])):
                tasks.append({
                    "id": f"gen_{idx}",
                    "name": task.get("actionable_task", "General Task"),
                    "trigger": task.get("condition_trigger", ""),
                    "difficulty": task.get("difficulty", "Medium"),
                    "dimension": task.get("dimension", ""),
                    "source": "general",
                    "task_type": "do",
                    "priority_weight": 1.0,
                })
            logger.info(f"Loaded {len(tasks)} general tasks from {json_path}")
            return tasks
        except Exception as e:
            logger.error(f"Failed to load general tasks: {e}")
            return []

    @staticmethod
    def _format_clinician_tasks(clinician_rows: List[Dict]) -> tuple:
        """
        Converts clinician task DB rows into the same format as general tasks.
        Returns (do_tasks, avoid_tasks) separately.
        """
        do_tasks = []
        avoid_tasks = []

        for row in clinician_rows:
            formatted = {
                "id": f"clin_{row['id']}",
                "name": row["actionable_task"],
                "trigger": row["condition_trigger"],
                "difficulty": row.get("difficulty", "Medium"),
                "dimension": row.get("dimension", ""),
                "source": "clinician",
                "task_type": row.get("task_type", "do"),
                "priority_weight": 1.5 + (row.get("priority", 3) * 0.1),
                # priority 1 -> weight 1.6, priority 5 -> weight 2.0
                "addiction_type": row.get("addiction_type", ""),
                "created_by": row.get("created_by", ""),
            }

            if row.get("task_type") == "avoid":
                avoid_tasks.append(formatted)
            else:
                do_tasks.append(formatted)

        return do_tasks, avoid_tasks

    def get_merged_tasks(self, user_id: Optional[str] = None) -> Dict:
        """
        Returns the merged task pool for a user.
        
        For free users: only general tasks
        For premium users: general + clinician "do" tasks merged, 
                          clinician "avoid" tasks returned separately
        
        Returns:
            {
                "actionable_tasks": [...],   # merged "do" tasks for RL model
                "avoid_tasks": [...],         # "avoid" warnings (premium only)
                "is_premium": bool,
                "clinician_task_count": int,
                "general_task_count": int
            }
        """
        result = {
            "actionable_tasks": list(self.general_tasks),  # copy
            "avoid_tasks": [],
            "is_premium": False,
            "clinician_task_count": 0,
            "general_task_count": len(self.general_tasks),
        }

        if not user_id:
            return result

        # Check if user exists and is premium
        user = get_user(user_id)
        if not user:
            logger.warning(f"User {user_id} not found, returning general tasks only")
            return result

        if not user.get("is_premium", False):
            logger.info(f"User {user['name']} is free tier, returning general tasks only")
            return result

        # Premium user — fetch and merge clinician tasks
        clinician_rows = get_clinician_tasks(user_id)
        if not clinician_rows:
            logger.info(f"Premium user {user['name']} has no clinician tasks assigned")
            result["is_premium"] = True
            return result

        do_tasks, avoid_tasks = self._format_clinician_tasks(clinician_rows)

        # Merge: clinician "do" tasks are added to the pool
        # They have higher priority_weight so the RL model favors them
        merged = list(self.general_tasks) + do_tasks

        result["actionable_tasks"] = merged
        result["avoid_tasks"] = avoid_tasks
        result["is_premium"] = True
        result["clinician_task_count"] = len(do_tasks) + len(avoid_tasks)

        logger.info(
            f"Merged tasks for premium user {user['name']}: "
            f"{len(self.general_tasks)} general + {len(do_tasks)} clinician do + "
            f"{len(avoid_tasks)} clinician avoid"
        )

        return result

    def get_tasks_for_rl(self, user_id: Optional[str] = None) -> List[Dict]:
        """
        Returns only the actionable "do" tasks formatted for the RL model.
        This is the direct replacement for the old tasks_db loading.
        """
        merged = self.get_merged_tasks(user_id)
        return merged["actionable_tasks"]


if __name__ == "__main__":
    merger = TaskMerger()
    result = merger.get_merged_tasks()
    print(f"General tasks loaded: {result['general_task_count']}")
    print(f"Sample task: {result['actionable_tasks'][0] if result['actionable_tasks'] else 'None'}")
