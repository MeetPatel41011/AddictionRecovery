import requests
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key={api_key}"
payload = {
    "systemInstruction": { "parts": [{"text": "You are a recovery coach."}] },
    "contents": [{"role": "user", "parts": [{"text": "Hello, I am struggling today."}]}]
}
r = requests.post(url, json=payload)
print(r.status_code)
print(r.json())
