import requests
import os
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
payload = {
    "systemInstruction": { "parts": [{"text": "You are a bot"}] },
    "contents": [{"role": "user", "parts": [{"text": "Hello, how are you?"}]}]
}
r = requests.post(url, json=payload)
print(r.status_code)
print(r.json())
