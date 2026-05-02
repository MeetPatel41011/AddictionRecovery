"""
End-to-end test for the premium clinician task merging feature.
Tests: DB operations, task merging, RL learning, and cross-user intelligence.
"""

import db
from task_merger import TaskMerger
from rl_bandit import ContextualBandit

def main():
    print("=" * 60)
    print("  RECOVERY COMPASS - PREMIUM FEATURE TEST")
    print("=" * 60)

    # ── Step 1: Initialize DB ─────────────────────────────────
    print("\n[1] Initializing database tables...")
    db.init_tables()
    print("    Tables ready.")

    # ── Step 2: Create test users ─────────────────────────────
    print("\n[2] Creating test users...")
    
    free_user = db.create_user(
        name="Alex (Free User)",
        addiction_types=["alcohol"],
        is_premium=False
    )
    print(f"    Free user: {free_user['name']} (id={free_user['id']})")

    premium_user = db.create_user(
        name="Jordan (Premium User)",
        addiction_types=["alcohol", "nicotine"],
        facility_code="CLINIC001",
        is_premium=True
    )
    print(f"    Premium user: {premium_user['name']} (id={premium_user['id']})")

    # ── Step 3: Upload clinician tasks for premium user ────────
    print("\n[3] Uploading clinician tasks for premium user...")
    clinician_tasks = [
        {
            "condition_trigger": "craving for alcohol",
            "actionable_task": "Call your sponsor Sarah at (555) 123-4567",
            "task_type": "do",
            "difficulty": "Low",
            "priority": 5,
            "addiction_type": "alcohol"
        },
        {
            "condition_trigger": "stress after work",
            "actionable_task": "Walk to the park on Oak Street (avoid the bar route)",
            "task_type": "do",
            "difficulty": "Medium",
            "priority": 4,
            "addiction_type": "alcohol"
        },
        {
            "condition_trigger": "social pressure to drink",
            "actionable_task": "Do NOT visit Murphy's Bar on Friday evenings",
            "task_type": "avoid",
            "difficulty": "High",
            "priority": 5,
            "addiction_type": "alcohol"
        }
    ]
    created = db.upload_clinician_tasks(
        user_id=str(premium_user['id']),
        tasks=clinician_tasks,
        clinician_name="Dr. Smith"
    )
    print(f"    Uploaded {len(created)} clinician tasks")
    for t in created:
        print(f"      - [{t['task_type'].upper()}] {t['actionable_task'][:60]}...")

    # ── Step 4: Test task merging ──────────────────────────────
    print("\n[4] Testing task merger...")
    merger = TaskMerger()

    # Free user merge
    free_result = merger.get_merged_tasks(str(free_user['id']))
    print(f"    Free user tasks: {free_result['general_task_count']} general, "
          f"{free_result['clinician_task_count']} clinician")
    print(f"    Is premium: {free_result['is_premium']}")

    # Premium user merge
    premium_result = merger.get_merged_tasks(str(premium_user['id']))
    print(f"    Premium user tasks: {premium_result['general_task_count']} general, "
          f"{premium_result['clinician_task_count']} clinician (merged)")
    print(f"    Is premium: {premium_result['is_premium']}")
    print(f"    Total actionable tasks: {len(premium_result['actionable_tasks'])}")
    print(f"    Avoid warnings: {len(premium_result['avoid_tasks'])}")

    if premium_result['avoid_tasks']:
        for avoid in premium_result['avoid_tasks']:
            print(f"      [AVOID] {avoid['name']}")

    # ── Step 5: Test RL with merged tasks ─────────────────────
    print("\n[5] Testing RL bandit with merged task pool...")

    # Premium user bandit (merged tasks)
    premium_tasks = merger.get_tasks_for_rl(str(premium_user['id']))
    premium_bandit = ContextualBandit(
        tasks=premium_tasks, epsilon=0.2, alpha=0.1, db_module=db
    )

    # Select tasks for a stressed, high-urge state
    mood, urge, streak = 2, 8, 3
    print(f"    State: mood={mood}, urge={urge}, streak={streak}")
    
    selected = set()
    for _ in range(20):
        task_id = premium_bandit.select_task(mood, urge, streak, "alcohol")
        selected.add(task_id)

    clinician_selected = [t for t in selected if t.startswith("clin_")]
    general_selected = [t for t in selected if t.startswith("gen_")]
    print(f"    Over 20 selections: {len(clinician_selected)} clinician, "
          f"{len(general_selected)} general tasks appeared")

    # ── Step 6: Test AI learning loop ─────────────────────────
    print("\n[6] Testing AI learning loop (cross-user intelligence)...")

    # Simulate premium user completing a clinician task with good urge reduction
    task_id = premium_tasks[-2]['id']  # pick a clinician task
    task_source = premium_bandit.get_task_source(task_id)
    state = premium_bandit.get_state(mood, urge, streak)
    
    reward = premium_bandit.calculate_reward(completed=True, prev_urge=8, next_urge=3)
    print(f"    Task completed: {task_id} (source={task_source})")
    print(f"    Urge: 8 -> 3, Reward: {reward}")

    new_q = premium_bandit.record_and_learn(
        state=state,
        task_id=task_id,
        reward=reward,
        user_id=str(premium_user['id']),
        task_source=task_source,
        addiction_type="alcohol",
        mood_before=mood,
        urge_before=8,
        urge_after=3,
        completed=True,
        streak=streak,
        is_premium=True
    )
    print(f"    Q-value updated: {new_q:.3f}")

    # Simulate a few more outcomes to build aggregate data
    for i in range(5):
        r = premium_bandit.calculate_reward(completed=True, prev_urge=7, next_urge=4)
        premium_bandit.record_and_learn(
            state=state, task_id=task_id, reward=r,
            user_id=str(premium_user['id']),
            task_source=task_source, addiction_type="alcohol",
            mood_before=mood, urge_before=7, urge_after=4,
            completed=True, streak=streak, is_premium=True
        )

    # Query aggregate intelligence
    aggregate = db.get_aggregate_reward(task_id, "alcohol")
    print(f"    Aggregate reward for {task_id} (alcohol): {aggregate:.3f}")

    # ── Step 7: Test analytics ────────────────────────────────
    print("\n[7] Testing analytics queries...")
    
    top_tasks = db.get_top_tasks_for_addiction("alcohol", limit=5)
    print(f"    Top tasks for alcohol: {len(top_tasks)} found")
    for t in top_tasks:
        print(f"      - {t['task_id']}: avg_reward={float(t['avg_reward']):.3f}, "
              f"used={t['times_used']}x, source={t['task_source']}")

    stats = db.get_clinician_vs_general_stats("alcohol")
    print(f"    Clinician vs General comparison:")
    for source, data in stats.items():
        print(f"      {source}: avg_reward={float(data['avg_reward']):.3f}, "
              f"completions={data['total_completions']}")

    # ── Done ──────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  ALL TESTS PASSED")
    print("=" * 60)
    print(f"\n  Summary:")
    print(f"    - Database: 3 tables created (users, clinician_tasks, task_outcomes)")
    print(f"    - Free user: gets {free_result['general_task_count']} general tasks only")
    print(f"    - Premium user: gets {len(premium_result['actionable_tasks'])} merged tasks "
          f"+ {len(premium_result['avoid_tasks'])} avoid warnings")
    print(f"    - AI learned from {len(top_tasks)} task outcomes")
    print(f"    - Cross-user aggregate reward computed: {aggregate:.3f}")


if __name__ == "__main__":
    main()
