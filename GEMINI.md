# Recovery Routine AI: Adaptive Daily Scheduling Pipeline

## Project Overview
This project is an adaptive, AI-driven scheduling application designed to help users recede from behavioral and substance addictions. The core mechanic is a dynamic daily to-do list that adapts based on user preferences, their completion rate of yesterday's tasks, and their end-of-day emotional state. 

This repository currently focuses **strictly on Step 1 (Backend, Data Processing, and ML/SLM Pipeline)**. All frontend development and advanced biometrics/compliance features are explicitly out of scope for this phase.

## The Core Loop
Every day, the application executes the following loop:
1.  **Ingest Context:** Collects the user's baseline profile (likes, safe places, healthy habits), yesterday's completed/missed to-dos, and yesterday's end-of-day mood/feeling.
2.  **Process Logic:** Cross-references this context against a clinical knowledge base.
3.  **Generate Schedule:** An SLM (Small Language Model) generates a highly customized, structured to-do list for the current day, complete with inspirational quotes and progressive task difficulty.

---

## Development Phases

### Step 1: Backend & ML Pipeline (ACTIVE)
**Target for Gemini CLI:** Your immediate objective is to build the data ingestion, knowledge graph, and model pipeline outlined below. Do not proceed to Step 2.

#### A. Document Parsing & Knowledge Base Creation
We are building the foundational logic using three specific clinical texts:
*   *Principles of Drug Addiction Treatment: A Research-Based Guide* (NIDA)
*   *SAMHSA TIP 34 Brief Interventions*
*   *ASAM Criteria Multidimensional Assessment Guide*

**Tasks:**
1.  Implement a PDF parsing script with OCR capabilities to ingest these three documents.
2.  Chunk the text contextually (maintaining the semantic meaning of clinical "If/Then" logic, interventions, and dimensions).
3.  Use an LLM to reason through the chunks and extract structured data.
4.  Output the structured data into a finalized JSON format or Knowledge Graph that maps specific triggers/states to actionable daily tasks.

#### B. Model Training & SLM Integration
1.  Train/fine-tune an ML model to navigate the newly created Knowledge Graph based on user variables (e.g., if user mood = "stressed" and missed tasks > 2, decrease task difficulty).
2.  Deploy this model alongside a Small Language Model (SLM).
3.  **Execution Flow:** The application sends the user's daily variables to the ML model -> The ML model identifies the correct clinical pathway/tasks from the Knowledge Base -> The SLM formats these tasks into human-readable, encouraging decorative text (the final daily To-Do list).

### Step 2: Frontend Application (PAUSED - DO NOT EXECUTE)
*This section is for architectural context only. No work is to be done here yet.*
*   User onboarding UI (collecting preferences, safe places, favorite foods).
*   Daily interactive checklist UI.
*   End-of-day mood logging and feedback collection.

---
