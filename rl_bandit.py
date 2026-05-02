"""
Contextual Bandit RL model for adaptive task selection.
Enhanced with:
- Priority weighting for clinician-prescribed tasks
- Cross-user aggregate learning via task_outcomes table
- Warm-start Q-values from historical data
"""

import numpy as np
import logging
from typing import Optional

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class ContextualBandit:
    def __init__(self, tasks, epsilon=0.2, alpha=0.1, db_module=None):
        """
        Initializes the Contextual Bandit for task recommendation.
        
        Args:
            tasks (list of dict): The task database (general + clinician merged).
            epsilon (float): Exploration rate (e.g., 0.2 means 20% random exploration).
            alpha (float): Learning rate for Q-value updates.
            db_module: Reference to the db module for aggregate queries.
                       If None, aggregate learning is disabled.
        """
        self.tasks = tasks
        self.epsilon = epsilon
        self.alpha = alpha
        self.db = db_module
        
        # Q-table mapping states to task expected values
        # Format: { (mood, urge, streak): { task_id: q_value } }
        self.q_table = {}
        
        # Priority weights: clinician tasks get higher weight
        self.priority_weights = {}
        for task in tasks:
            self.priority_weights[task['id']] = task.get('priority_weight', 1.0)

    def get_state(self, mood, urge, streak):
        """Defines the current user state."""
        return (mood, urge, streak)

    def _ensure_state_exists(self, state, addiction_type=None):
        """
        Initializes state in the Q-table if not present.
        Uses aggregate priors from historical data when available.
        Batch-queries the DB once (not per-task) for performance.
        """
        if state not in self.q_table:
            # Fetch all aggregate priors in one batch query
            aggregate_priors = {}
            if self.db and addiction_type:
                try:
                    aggregate_priors = self.db.get_aggregate_rewards_batch(addiction_type)
                except Exception as e:
                    logger.warning(f"Could not fetch aggregate priors: {e}")

            self.q_table[state] = {}
            for task in self.tasks:
                task_id = task['id']
                prior = 0.0
                
                # Warm-start: clinician tasks start with a boost
                if task.get('source') == 'clinician':
                    prior = 0.3
                
                # Cross-user aggregate learning:
                # Use batch-fetched aggregate reward if available
                if task_id in aggregate_priors:
                    aggregate = aggregate_priors[task_id]
                    # Blend: 70% aggregate prior, 30% default prior
                    prior = 0.7 * aggregate + 0.3 * prior
                
                self.q_table[state][task_id] = prior

    def select_task(self, mood, urge, streak, addiction_type=None):
        """
        Selects a task using a weighted epsilon-greedy strategy.
        
        - epsilon% of the time: explore (random task)
        - (1-epsilon)% of the time: exploit (best task, weighted by priority)
        """
        state = self.get_state(mood, urge, streak)
        self._ensure_state_exists(state, addiction_type)
        
        if np.random.rand() < self.epsilon:
            # Explore: Randomly select a task
            chosen_task_id = np.random.choice([task['id'] for task in self.tasks])
        else:
            # Exploit: Select task with highest weighted Q-value
            q_values = self.q_table[state]
            # Apply priority weighting: Q * weight
            weighted_q = {
                t_id: q * self.priority_weights.get(t_id, 1.0) 
                for t_id, q in q_values.items()
            }
            max_q = max(weighted_q.values())
            # Handle ties randomly
            best_tasks = [t_id for t_id, q in weighted_q.items() if q == max_q]
            chosen_task_id = np.random.choice(best_tasks)
            
        return chosen_task_id

    def calculate_reward(self, completed, prev_urge, next_urge):
        """
        Calculates the reward based on task completion and urge change.
        """
        # Base reward
        reward = 0.5 if completed else -0.5
        
        # Multiplier / Urge adjustment
        if next_urge < prev_urge:
            reward += 0.5
        elif next_urge > prev_urge:
            reward -= 0.5
            
        return reward

    def update_model(self, state, task_id, reward):
        """
        Updates the Q-value for the selected task in the given state.
        
        Math Explanation:
        New Q(s,a) = Current Q(s,a) + alpha * [Reward - Current Q(s,a)]
        We incrementally move the current expected value toward the newly received reward
        by a step size of alpha (learning rate).
        """
        self._ensure_state_exists(state)
        
        current_q = self.q_table[state][task_id]
        
        # Q-value update formula
        new_q = current_q + self.alpha * (reward - current_q)
        self.q_table[state][task_id] = new_q
        
        return new_q

    def record_and_learn(
        self, 
        state, 
        task_id, 
        reward, 
        user_id=None,
        task_source="general",
        addiction_type=None,
        mood_before=None,
        urge_before=None,
        urge_after=None,
        completed=True,
        streak=0,
        is_premium=False
    ):
        """
        Combined method: updates Q-table AND records outcome to database.
        This is the function that makes the AI smarter over time.
        
        1. Updates this user's Q-value (per-session learning)
        2. Records the outcome to task_outcomes table (cross-user learning)
        3. Future users benefit from the aggregate data
        """
        # Step 1: Local Q-table update
        new_q = self.update_model(state, task_id, reward)
        
        # Step 2: Persist outcome to database for cross-user learning
        if self.db and user_id:
            try:
                self.db.record_outcome(
                    user_id=user_id,
                    task_id=task_id,
                    task_source=task_source,
                    addiction_type=addiction_type or "",
                    mood_before=mood_before or state[0],
                    urge_before=urge_before or state[1],
                    urge_after=urge_after if urge_after is not None else state[1],
                    completed=completed,
                    reward=reward,
                    streak=streak,
                    is_premium=is_premium
                )
            except Exception as e:
                logger.warning(f"Failed to record outcome to DB: {e}")
        
        return new_q

    def get_task_source(self, task_id: str) -> str:
        """Returns whether a task is 'general' or 'clinician'."""
        for task in self.tasks:
            if task['id'] == task_id:
                return task.get('source', 'general')
        return 'general'


if __name__ == "__main__":
    # Example JSON Database of tasks (with source tagging)
    tasks_db = [
        {"id": "t1", "name": "Take a 10-minute walk", "source": "general", "priority_weight": 1.0},
        {"id": "t2", "name": "Deep breathing exercise", "source": "general", "priority_weight": 1.0},
        {"id": "t3", "name": "Call a friend or sponsor", "source": "general", "priority_weight": 1.0},
        {"id": "c1", "name": "Attend your Tuesday AA meeting", "source": "clinician", "priority_weight": 2.0},
    ]
    
    # Initialize the bandit (without DB for standalone test)
    bandit = ContextualBandit(tasks=tasks_db, epsilon=0.2, alpha=0.1)
    
    # Define a user state
    current_mood = 2
    current_urge = 8
    current_streak = 3
    state = bandit.get_state(current_mood, current_urge, current_streak)
    
    # Select a task
    recommended_task = bandit.select_task(current_mood, current_urge, current_streak)
    print(f"Recommended Task ID: {recommended_task} for State: {state}")
    print(f"Task source: {bandit.get_task_source(recommended_task)}")
    
    # Simulate user action: Completed the task, urge went down to 5
    task_completed = True
    new_urge = 5
    
    # Calculate Reward
    reward = bandit.calculate_reward(completed=task_completed, prev_urge=current_urge, next_urge=new_urge)
    print(f"Calculated Reward: {reward}")
    
    # Update Model (without DB recording in standalone mode)
    bandit.update_model(state, recommended_task, reward)
    
    print("\nUpdated Q-table for this state:")
    for t_id, q_val in bandit.q_table[state].items():
        source = bandit.get_task_source(t_id)
        print(f"  Task {t_id} ({source}): {q_val:.3f}")
