import pdfplumber
import pytesseract
from pdf2image import convert_from_path
import json
import os
import re
import logging
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import List, Optional
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- Models for Strict JSON Schema ---
class TaskMapping(BaseModel):
    condition_trigger: str = Field(description="The user's state, mood, or clinical condition (e.g., 'stressed', 'missed tasks > 2', 'craving').")
    actionable_task: str = Field(description="A specific, clear, daily task the user can perform.")
    dimension: Optional[str] = Field(description="The ASAM dimension or clinical category this falls under.")
    difficulty: str = Field(description="Relative difficulty of the task: Low, Medium, High.")

class ExtractionResult(BaseModel):
    mappings: List[TaskMapping]

# --- Core Pipeline Classes ---
class PDFParser:
    """Handles PDF ingestion and fallback OCR."""
    def __init__(self, use_ocr: bool = True):
        self.use_ocr = use_ocr

    def extract_text(self, pdf_path: str) -> str:
        logger.info(f"Extracting text from {pdf_path}")
        full_text = ""
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for i, page in enumerate(pdf.pages):
                    text = page.extract_text()
                    if text:
                        full_text += text + "\n\n"
                    elif self.use_ocr:
                        logger.info(f"No text found on page {i+1}, falling back to OCR.")
                        full_text += self._ocr_page(pdf_path, i) + "\n\n"
            return full_text
        except Exception as e:
            logger.error(f"Error parsing PDF: {e}")
            raise

    def _ocr_page(self, pdf_path: str, page_num: int) -> str:
        try:
            images = convert_from_path(pdf_path, first_page=page_num+1, last_page=page_num+1)
            if images:
                return pytesseract.image_to_string(images[0])
        except Exception as e:
            logger.warning(f"OCR failed for page {page_num + 1}: {e}")
        return ""


class TextChunker:
    """Breaks text into logical, semantic chunks."""
    @staticmethod
    def chunk_contextually(text: str, max_chars: int = 3000) -> List[str]:
        """
        Chunks text contextually by double newlines (paragraphs/sections) 
        to preserve 'If/Then' clinical rules and interventions intact.
        """
        logger.info("Chunking text contextually.")
        # Split by paragraph/section breaks
        paragraphs = re.split(r'\n\s*\n', text)
        chunks = []
        current_chunk = ""

        for para in paragraphs:
            para = para.strip()
            if not para:
                continue
            
            # Keep semantic blocks intact. Only split if a single chunk gets too large.
            if len(current_chunk) + len(para) > max_chars and current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = para + "\n\n"
            else:
                current_chunk += para + "\n\n"
                
        if current_chunk:
            chunks.append(current_chunk.strip())
            
        logger.info(f"Created {len(chunks)} chunks.")
        return chunks


class LLMExtractor:
    """Handles LLM interactions for extraction and refinement."""
    def __init__(self, api_key: str):
        self.client = OpenAI(api_key=api_key)
        self.model_name = "gpt-4o-mini"

    @staticmethod
    def get_system_prompt() -> str:
        return (
            "You are an expert clinical data extractor. Your goal is to analyze clinical texts regarding "
            "addiction treatment and extract actionable, daily 'To-Do' tasks mapped to specific user states.\n\n"
            "Extract the following structure from the text chunk:\n"
            "- condition_trigger: The user's state, mood, or clinical condition (e.g., 'stressed', 'missed tasks > 2', 'craving').\n"
            "- actionable_task: A specific, clear, daily task the user can perform.\n"
            "- dimension: The ASAM dimension or clinical category this falls under.\n"
            "- difficulty: The relative difficulty of the task (Low, Medium, High).\n\n"
            "If the chunk contains 'If/Then' rules, map the 'If' to condition_trigger and the 'Then' to actionable_task. "
        )

    def extract(self, chunk: str) -> ExtractionResult:
        logger.info("Extracting data from chunk using LLM.")
        try:
            response = self.client.beta.chat.completions.parse(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": self.get_system_prompt()},
                    {"role": "user", "content": f"Extract clinical tasks from the following text chunk:\n\n{chunk}"}
                ],
                response_format=ExtractionResult,
            )
            return response.choices[0].message.parsed
        except Exception as e:
            logger.error(f"Error during extraction: {e}")
            return ExtractionResult(mappings=[])

    def refine(self, chunk: str, extracted_data: ExtractionResult) -> ExtractionResult:
        logger.info("Refining extracted data via Self-Evaluation loop.")
        try:
            refinement_prompt = (
                "Review the original text chunk and the extracted JSON data below. "
                "Evaluate your previous extraction. Did you miss any crucial 'If/Then' logic, interventions, or dimensions? "
                "Is any data incorrectly formatted? "
                "Output the corrected and complete data.\n\n"
                f"Original Chunk:\n{chunk}\n\n"
                f"Extracted JSON:\n{extracted_data.model_dump_json()}"
            )
            response = self.client.beta.chat.completions.parse(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": self.get_system_prompt()},
                    {"role": "user", "content": refinement_prompt}
                ],
                response_format=ExtractionResult,
            )
            return response.choices[0].message.parsed
        except Exception as e:
            logger.error(f"Error during refinement: {e}")
            return extracted_data

# --- Main Pipeline Execution ---
def run_pipeline(pdf_path: str, output_json: str):
    load_dotenv(override=True)
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY environment variable is not set. Please set it before running.")
        return

    parser = PDFParser(use_ocr=True)
    chunker = TextChunker()
    extractor = LLMExtractor(api_key=api_key)

    text = parser.extract_text(pdf_path)
    chunks = chunker.chunk_contextually(text)
    
    all_mappings = []
    
    for i, chunk in enumerate(chunks):
        logger.info(f"Processing chunk {i+1}/{len(chunks)}")
        
        # Step 1: Initial Extraction
        initial_extraction = extractor.extract(chunk)
        
        # Step 2: Self-Evaluation and Refinement Loop
        if initial_extraction and initial_extraction.mappings:
            refined_extraction = extractor.refine(chunk, initial_extraction)
            if refined_extraction and refined_extraction.mappings:
                all_mappings.extend(refined_extraction.mappings)
            
    # Save Final JSON Output
    final_output = {
        "api_usage_metadata": {
            "provider": "OpenAI",
            "model": "gpt-4o-mini",
            "environment_variable": "OPENAI_API_KEY",
            "description": "This metadata indicates the API service used for generating the JSON data below."
        },
        "data": [m.model_dump() for m in all_mappings]
    }
    
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_json) or '.', exist_ok=True)
    
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(final_output, f, indent=2, ensure_ascii=False)
        
    logger.info(f"Pipeline complete. Data successfully saved to {output_json}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Extract clinical tasks from PDFs.")
    parser.add_argument("pdf_path", help="Path to the input PDF file.")
    parser.add_argument("output_json", help="Path to the output JSON file.")
    
    args = parser.parse_args()
    run_pipeline(args.pdf_path, args.output_json)
