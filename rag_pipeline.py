import json
import os
import logging
import chromadb
from chromadb.utils import embedding_functions
from openai import OpenAI
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables (e.g., OPENAI_API_KEY)
load_dotenv(override=True)

# Check for API key
if not os.getenv("OPENAI_API_KEY"):
    logger.warning("OPENAI_API_KEY not found in environment. The SLM step will fail unless configured.")

class ClinicalRAGPipeline:
    def __init__(self, json_path: str, db_dir: str = "./chroma_db"):
        self.json_path = json_path
        self.db_dir = db_dir
        
        # Initialize ChromaDB client (Persistent so we don't re-embed every time)
        self.chroma_client = chromadb.PersistentClient(path=self.db_dir)
        
        # We use a lightweight sentence-transformer model for local, fast embeddings
        # 'all-MiniLM-L6-v2' is great for semantic matching of clinical text.
        self.embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
        
        # Get or create the collection
        self.collection = self.chroma_client.get_or_create_collection(
            name="clinical_interventions",
            embedding_function=self.embedding_fn
        )
        
        # Initialize the OpenAI client (acting as our SLM)
        self.openai_client = OpenAI()
        
    def populate_database(self):
        """Loads data from output.json and embeds it into ChromaDB."""
        # Check if the collection is already populated
        if self.collection.count() > 0:
            logger.info(f"Database already populated with {self.collection.count()} entries.")
            return

        logger.info(f"Loading data from {self.json_path}...")
        try:
            with open(self.json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            tasks = data.get("data", [])
            if not tasks:
                logger.error("No 'data' array found in JSON.")
                return

            documents = []
            metadatas = []
            ids = []

            for i, task in enumerate(tasks):
                # We embed a combination of the trigger and the task for best semantic search results
                doc_text = f"Condition/Trigger: {task['condition_trigger']}. Action: {task['actionable_task']}"
                documents.append(doc_text)
                
                # Store the structured data as metadata so we can retrieve exactly what we need
                metadatas.append({
                    "condition_trigger": str(task.get("condition_trigger", "") or ""),
                    "actionable_task": str(task.get("actionable_task", "") or ""),
                    "dimension": str(task.get("dimension", "") or ""),
                    "difficulty": str(task.get("difficulty", "") or "")
                })
                ids.append(f"task_{i}")

            logger.info(f"Embedding {len(documents)} tasks into vector database. This may take a minute on the first run...")
            
            # Add to ChromaDB in batches to avoid overwhelming memory
            batch_size = 500
            for i in range(0, len(documents), batch_size):
                self.collection.add(
                    documents=documents[i:i+batch_size],
                    metadatas=metadatas[i:i+batch_size],
                    ids=ids[i:i+batch_size]
                )
            logger.info("Database successfully populated!")

        except Exception as e:
            logger.error(f"Failed to populate database: {e}")

    def retrieve_relevant_tasks(self, user_state: str, n_results: int = 5):
        """Searches the vector database for clinical tasks matching the user's state."""
        logger.info(f"Querying knowledge base for state: '{user_state}'")
        results = self.collection.query(
            query_texts=[user_state],
            n_results=n_results
        )
        
        retrieved_tasks = []
        # ChromaDB returns a list of lists because you can pass multiple query_texts.
        # We only passed one, so we take index 0.
        for metadata in results['metadatas'][0]:
            retrieved_tasks.append(metadata)
            
        return retrieved_tasks

    def generate_daily_schedule(self, user_state: str, user_name: str = "User"):
        """The Core Loop: Retrieves tasks and uses an SLM to format a friendly schedule."""
        # 1. Retrieve the strict clinical rules (RAG)
        tasks = self.retrieve_relevant_tasks(user_state, n_results=4)
        
        if not tasks:
            return "No matching clinical guidelines found for today."

        # Format the retrieved tasks for the prompt
        clinical_guidelines_text = "\n".join([
            f"- Task: {t['actionable_task']} (Difficulty: {t['difficulty']})" 
            for t in tasks
        ])
        
        logger.info("Clinical guidelines retrieved. Sending to SLM for formatting...")

        # 2. Use the SLM (OpenAI model) to generate the final, human-readable schedule
        # The system prompt enforces strict adherence to the retrieved rules.
        prompt = f"""
You are an empathetic, encouraging assistant helping someone in addiction recovery.
Your job is to take specific clinical guidelines and turn them into a supportive daily schedule.

User's current state: {user_state}
Name: {user_name}

Here are the strict clinical tasks that MUST be included in today's schedule:
{clinical_guidelines_text}

Instructions:
1. Create a beautiful, encouraging daily schedule.
2. Include an inspirational quote at the top.
3. Seamlessly integrate the required clinical tasks into the schedule.
4. DO NOT invent new clinical/medical advice. Only use the tasks provided above.
5. Keep the tone warm, supportive, and non-judgmental.
"""

        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4o-mini", # Our "SLM" equivalent for this demonstration
                messages=[
                    {"role": "system", "content": "You are a clinical task formatter."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4 # Low temperature for more predictable, structured output
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Error communicating with SLM: {e}")
            return "Failed to generate schedule due to SLM error."

if __name__ == "__main__":
    # --- Execute the Pipeline ---
    json_file = "output.json"
    
    if not os.path.exists(json_file):
        logger.error(f"Could not find {json_file}. Please ensure Step 1.A is complete.")
        exit(1)

    # Initialize the pipeline
    pipeline = ClinicalRAGPipeline(json_path=json_file)
    
    # 1. Populate the Knowledge Graph (Vector Database)
    pipeline.populate_database()
    
    # 2. Simulate the Daily Core Loop
    print("\n" + "="*50)
    print("🚀 SIMULATING DAILY LOOP...")
    print("="*50)
    
    simulated_user_states = [
        "Mood is highly stressed, and missed 3 tasks yesterday.",
        "Experiencing strong cravings and feeling lonely.",
        "Feeling positive and motivated, completed all tasks yesterday!"
    ]
    
    # Let's run the simulation for the first state
    test_state = simulated_user_states[0]
    print(f"\nUser State Input: '{test_state}'\n")
    
    final_schedule = pipeline.generate_daily_schedule(user_state=test_state, user_name="Alex")
    
    print("\n" + "="*50)
    print("✨ GENERATED DAILY SCHEDULE (SLM OUTPUT) ✨")
    print("="*50)
    print(final_schedule)
