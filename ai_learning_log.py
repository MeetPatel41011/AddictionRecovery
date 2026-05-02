"""
AI Learning Log — Generates a comprehensive report showing how the AI
has been learning from user interactions across the entire system.

Queries the task_outcomes table and produces a structured log showing:
- Total learning events
- Per-addiction performance trends
- Clinician vs General task effectiveness
- Top/bottom performing tasks
- Q-value evolution snapshots
- Cross-user intelligence metrics
"""

import json
import os
import logging
from datetime import datetime
from db import (
    get_connection, get_cursor, init_tables,
    get_top_tasks_for_addiction, get_clinician_vs_general_stats,
    get_aggregate_rewards_batch
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

LOG_FILE = "ai_learning_log.json"


def get_system_overview():
    """Returns high-level stats about the entire AI learning system."""
    with get_connection() as conn:
        cur = get_cursor(conn)

        # Total outcomes
        cur.execute("SELECT COUNT(*) as total FROM task_outcomes")
        total_outcomes = cur.fetchone()['total']

        # Unique users who've contributed learning data
        cur.execute("SELECT COUNT(DISTINCT user_id) as total FROM task_outcomes WHERE user_id IS NOT NULL")
        active_learners = cur.fetchone()['total']

        # Total users
        cur.execute("SELECT COUNT(*) as total FROM users")
        total_users = cur.fetchone()['total']

        # Premium users
        cur.execute("SELECT COUNT(*) as total FROM users WHERE is_premium = TRUE")
        premium_users = cur.fetchone()['total']

        # Clinician tasks uploaded
        cur.execute("SELECT COUNT(*) as total FROM clinician_tasks")
        clinician_tasks = cur.fetchone()['total']

        # Unique addiction types with learning data
        cur.execute("SELECT DISTINCT addiction_type FROM task_outcomes WHERE addiction_type IS NOT NULL AND addiction_type != ''")
        addiction_types = [row['addiction_type'] for row in cur.fetchall()]

        # Average reward across all completions
        cur.execute("SELECT AVG(reward) as avg, STDDEV(reward) as stddev FROM task_outcomes")
        reward_stats = cur.fetchone()
        avg_reward = float(reward_stats['avg']) if reward_stats['avg'] else 0.0
        stddev_reward = float(reward_stats['stddev']) if reward_stats['stddev'] else 0.0

        # Overall completion rate
        cur.execute("SELECT COUNT(*) FILTER(WHERE completed = TRUE) as done, COUNT(*) as total FROM task_outcomes")
        comp = cur.fetchone()
        completion_rate = (comp['done'] / comp['total'] * 100) if comp['total'] > 0 else 0

        # Average urge reduction
        cur.execute("SELECT AVG(urge_before - urge_after) as avg_reduction FROM task_outcomes WHERE completed = TRUE")
        urge_data = cur.fetchone()
        avg_urge_reduction = float(urge_data['avg_reduction']) if urge_data['avg_reduction'] else 0.0

        # Date range
        cur.execute("SELECT MIN(created_at) as first, MAX(created_at) as last FROM task_outcomes")
        dates = cur.fetchone()

    return {
        "total_learning_events": total_outcomes,
        "active_learners": active_learners,
        "total_users": total_users,
        "premium_users": premium_users,
        "clinician_tasks_uploaded": clinician_tasks,
        "addiction_types_tracked": addiction_types,
        "average_reward": round(avg_reward, 4),
        "reward_stddev": round(stddev_reward, 4),
        "completion_rate_pct": round(completion_rate, 1),
        "avg_urge_reduction": round(avg_urge_reduction, 2),
        "data_range": {
            "first_event": str(dates['first']) if dates['first'] else "N/A",
            "last_event": str(dates['last']) if dates['last'] else "N/A"
        }
    }


def get_per_addiction_analysis():
    """Returns detailed learning metrics per addiction type."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT 
                addiction_type,
                COUNT(*) as total_events,
                COUNT(DISTINCT user_id) as unique_users,
                AVG(reward) as avg_reward,
                COUNT(*) FILTER(WHERE completed = TRUE) as completions,
                COUNT(*) FILTER(WHERE completed = FALSE) as failures,
                AVG(urge_before) as avg_urge_before,
                AVG(urge_after) as avg_urge_after,
                AVG(urge_before - urge_after) as avg_urge_reduction,
                AVG(streak) as avg_streak
            FROM task_outcomes
            WHERE addiction_type IS NOT NULL AND addiction_type != ''
            GROUP BY addiction_type
            ORDER BY total_events DESC
        """)
        results = []
        for row in cur.fetchall():
            total = row['total_events']
            results.append({
                "addiction_type": row['addiction_type'],
                "total_events": total,
                "unique_users": row['unique_users'],
                "avg_reward": round(float(row['avg_reward']), 4) if row['avg_reward'] else 0,
                "completion_rate_pct": round(row['completions'] / total * 100, 1) if total > 0 else 0,
                "avg_urge_before": round(float(row['avg_urge_before']), 1) if row['avg_urge_before'] else 0,
                "avg_urge_after": round(float(row['avg_urge_after']), 1) if row['avg_urge_after'] else 0,
                "avg_urge_reduction": round(float(row['avg_urge_reduction']), 2) if row['avg_urge_reduction'] else 0,
                "avg_streak": round(float(row['avg_streak']), 1) if row['avg_streak'] else 0,
            })
        return results


def get_source_comparison():
    """Compares how clinician-prescribed tasks vs general tasks perform."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT 
                task_source,
                COUNT(*) as total_events,
                AVG(reward) as avg_reward,
                COUNT(*) FILTER(WHERE completed = TRUE) as completions,
                AVG(urge_before - urge_after) as avg_urge_reduction,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT addiction_type) as addiction_types_covered
            FROM task_outcomes
            GROUP BY task_source
        """)
        results = {}
        for row in cur.fetchall():
            total = row['total_events']
            results[row['task_source']] = {
                "total_events": total,
                "avg_reward": round(float(row['avg_reward']), 4) if row['avg_reward'] else 0,
                "completion_rate_pct": round(row['completions'] / total * 100, 1) if total > 0 else 0,
                "avg_urge_reduction": round(float(row['avg_urge_reduction']), 2) if row['avg_urge_reduction'] else 0,
                "unique_users": row['unique_users'],
                "addiction_types_covered": row['addiction_types_covered'],
            }
        return results


def get_warm_start_readiness():
    """
    Shows which addiction types have enough data for warm-starting new users.
    A key metric showing the system IS learning cross-user intelligence.
    """
    readiness = {}
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT addiction_type, COUNT(DISTINCT task_id) as tasks_with_data
            FROM task_outcomes
            WHERE addiction_type IS NOT NULL AND addiction_type != ''
            GROUP BY addiction_type
        """)
        all_data = {row['addiction_type']: row['tasks_with_data'] for row in cur.fetchall()}

    for addiction_type, total_tasks_with_any_data in all_data.items():
        # The batch function requires >= 3 samples per task
        priors = get_aggregate_rewards_batch(addiction_type)
        readiness[addiction_type] = {
            "tasks_with_any_data": total_tasks_with_any_data,
            "tasks_ready_for_warm_start": len(priors),
            "sample_priors": dict(list(priors.items())[:5]) if priors else {},
            "is_ready": len(priors) > 0,
        }

    return readiness


def get_recent_events(limit=20):
    """Returns the most recent learning events."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        cur.execute("""
            SELECT 
                o.task_id, o.task_source, o.addiction_type,
                o.mood_before, o.urge_before, o.urge_after,
                o.completed, o.reward, o.streak, o.is_premium,
                o.created_at,
                u.name as user_name
            FROM task_outcomes o
            LEFT JOIN users u ON o.user_id = u.id
            ORDER BY o.created_at DESC
            LIMIT %s
        """, (limit,))
        events = []
        for row in cur.fetchall():
            events.append({
                "timestamp": str(row['created_at']),
                "user": row['user_name'] or "Anonymous",
                "task_id": row['task_id'],
                "source": row['task_source'],
                "addiction": row['addiction_type'] or "N/A",
                "mood": row['mood_before'],
                "urge_before": row['urge_before'],
                "urge_after": row['urge_after'],
                "urge_delta": (row['urge_before'] or 0) - (row['urge_after'] or 0),
                "completed": row['completed'],
                "reward": round(float(row['reward']), 3) if row['reward'] else 0,
                "streak": row['streak'],
                "premium": row['is_premium'],
            })
        return events


def get_top_bottom_tasks():
    """Returns the best and worst performing tasks across all addictions."""
    with get_connection() as conn:
        cur = get_cursor(conn)
        # Top tasks
        cur.execute("""
            SELECT task_id, task_source, addiction_type,
                   AVG(reward) as avg_reward, COUNT(*) as times_used,
                   AVG(urge_before - urge_after) as avg_urge_reduction
            FROM task_outcomes
            WHERE completed = TRUE
            GROUP BY task_id, task_source, addiction_type
            HAVING COUNT(*) >= 3
            ORDER BY avg_reward DESC
            LIMIT 10
        """)
        top = [dict(row) for row in cur.fetchall()]
        for t in top:
            t['avg_reward'] = round(float(t['avg_reward']), 4) if t['avg_reward'] else 0
            t['avg_urge_reduction'] = round(float(t['avg_urge_reduction']), 2) if t['avg_urge_reduction'] else 0

        # Bottom tasks
        cur.execute("""
            SELECT task_id, task_source, addiction_type,
                   AVG(reward) as avg_reward, COUNT(*) as times_used,
                   AVG(urge_before - urge_after) as avg_urge_reduction
            FROM task_outcomes
            WHERE completed = TRUE
            GROUP BY task_id, task_source, addiction_type
            HAVING COUNT(*) >= 3
            ORDER BY avg_reward ASC
            LIMIT 10
        """)
        bottom = [dict(row) for row in cur.fetchall()]
        for t in bottom:
            t['avg_reward'] = round(float(t['avg_reward']), 4) if t['avg_reward'] else 0
            t['avg_urge_reduction'] = round(float(t['avg_urge_reduction']), 2) if t['avg_urge_reduction'] else 0

    return {"top_performing": top, "bottom_performing": bottom}


def generate_learning_log():
    """
    Main function: generates a complete AI learning log and saves it.
    """
    logger.info("=" * 60)
    logger.info("  GENERATING AI LEARNING LOG")
    logger.info("=" * 60)

    log = {
        "meta": {
            "generated_at": datetime.now().isoformat(),
            "description": "Recovery Compass AI Learning Log - Shows what the RL model has learned from user interactions",
            "version": "2.0.0"
        },
        "system_overview": get_system_overview(),
        "per_addiction_analysis": get_per_addiction_analysis(),
        "clinician_vs_general": get_source_comparison(),
        "warm_start_readiness": get_warm_start_readiness(),
        "task_rankings": get_top_bottom_tasks(),
        "recent_events": get_recent_events(limit=50),
    }

    # Save to JSON
    with open(LOG_FILE, 'w', encoding='utf-8') as f:
        json.dump(log, f, indent=2, ensure_ascii=False, default=str)

    # Also print a human-readable summary to console
    overview = log["system_overview"]
    print("\n" + "=" * 60)
    print("  RECOVERY COMPASS - AI LEARNING LOG")
    print("=" * 60)

    print(f"\n  Generated: {log['meta']['generated_at']}")
    print(f"\n  --- SYSTEM OVERVIEW ---")
    print(f"  Total learning events:     {overview['total_learning_events']}")
    print(f"  Active learners:           {overview['active_learners']}")
    print(f"  Total users:               {overview['total_users']}")
    print(f"  Premium users:             {overview['premium_users']}")
    print(f"  Clinician tasks uploaded:  {overview['clinician_tasks_uploaded']}")
    print(f"  Addiction types tracked:   {', '.join(overview['addiction_types_tracked']) or 'None yet'}")
    print(f"  Average reward:            {overview['average_reward']} (stddev: {overview['reward_stddev']})")
    print(f"  Completion rate:           {overview['completion_rate_pct']}%")
    print(f"  Avg urge reduction:        {overview['avg_urge_reduction']}")
    print(f"  Data range:                {overview['data_range']['first_event']} to {overview['data_range']['last_event']}")

    # Per-addiction breakdown
    addictions = log["per_addiction_analysis"]
    if addictions:
        print(f"\n  --- PER-ADDICTION LEARNING ---")
        for a in addictions:
            print(f"\n  [{a['addiction_type'].upper()}]")
            print(f"    Events: {a['total_events']}  |  Users: {a['unique_users']}  |  Completion: {a['completion_rate_pct']}%")
            print(f"    Avg reward: {a['avg_reward']}  |  Urge reduction: {a['avg_urge_reduction']}")
            print(f"    Avg streak: {a['avg_streak']}")

    # Source comparison
    sources = log["clinician_vs_general"]
    if sources:
        print(f"\n  --- CLINICIAN vs GENERAL TASKS ---")
        for source, stats in sources.items():
            print(f"\n  [{source.upper()}]")
            print(f"    Events: {stats['total_events']}  |  Avg reward: {stats['avg_reward']}")
            print(f"    Completion: {stats['completion_rate_pct']}%  |  Urge reduction: {stats['avg_urge_reduction']}")

    # Warm start readiness
    warm = log["warm_start_readiness"]
    if warm:
        print(f"\n  --- WARM-START READINESS (Cross-User Intelligence) ---")
        for addiction, data in warm.items():
            status = "READY" if data['is_ready'] else "NEEDS MORE DATA"
            print(f"    {addiction}: {data['tasks_ready_for_warm_start']} tasks warm-startable [{status}]")
            if data['sample_priors']:
                for tid, reward in list(data['sample_priors'].items())[:3]:
                    print(f"      {tid}: avg_reward = {reward:.3f}")

    # Top/bottom tasks
    rankings = log["task_rankings"]
    if rankings["top_performing"]:
        print(f"\n  --- TOP PERFORMING TASKS ---")
        for i, t in enumerate(rankings["top_performing"][:5], 1):
            print(f"    {i}. {t['task_id']} ({t['task_source']}/{t['addiction_type']}) "
                  f"reward={t['avg_reward']} urge_reduction={t['avg_urge_reduction']} "
                  f"used={t['times_used']}x")

    # Recent events
    recent = log["recent_events"]
    if recent:
        print(f"\n  --- RECENT LEARNING EVENTS (last {min(len(recent), 10)}) ---")
        for ev in recent[:10]:
            status = "DONE" if ev['completed'] else "SKIP"
            print(f"    [{ev['timestamp'][:19]}] {ev['user']}: "
                  f"task={ev['task_id']} ({ev['source']}) "
                  f"urge {ev['urge_before']}->{ev['urge_after']} "
                  f"reward={ev['reward']} [{status}]")

    print(f"\n  Full log saved to: {os.path.abspath(LOG_FILE)}")
    print("=" * 60)

    return log


if __name__ == "__main__":
    init_tables()
    generate_learning_log()
