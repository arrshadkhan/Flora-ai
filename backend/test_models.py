import os
from pathlib import Path
from dotenv import load_dotenv
from google import genai
# Find the project root regardless of the terminal directory.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
# Load the secret settings from the root .env file.
load_dotenv(PROJECT_ROOT / ".env")
api_key = os.getenv("GEMINI_API_KEY")
model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
if not api_key:
    raise RuntimeError(
        "GEMINI_API_KEY is missing. Check the project-root .env file."
    )
# Create the Gemini client using our secret key.
client = genai.Client(api_key=api_key)
# Send a small test request to Gemini.
response = client.models.generate_content(
    model=model_name,
    contents="Reply with exactly: Flora AI is connected!",
)

print("Gemini response:")
print(response.text)
