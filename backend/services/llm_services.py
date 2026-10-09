import os
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types


# Locate the project root and load its .env file.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


# Give Flora a consistent personality.
SYSTEM_INSTRUCTION = """
You are Flora AI, a helpful and knowledgeable AI assistant.

Instructions:
- Answer clearly and accurately.
- Explain technical concepts step by step when appropriate.
- Use Markdown for headings, lists, and code examples when useful.
- Consider the conversation history when answering.
- If you are uncertain about something, say so.
"""


def generate_reply(messages: list[dict[str, str]]) -> str:
    """Generate an AI response using Gemini."""

    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is missing from the project-root .env file."
        )

    # Create the Gemini client using the secret API key.
    client = genai.Client(api_key=api_key)

    # Convert Flora's message roles to Gemini's roles.
    contents = []

    for message in messages:
        role = (
            "model"
            if message["role"] == "assistant"
            else "user"
        )

        contents.append(
            types.Content(
                role=role,
                parts=[
                    types.Part(text=message["content"])
                ],
            )
        )

    # Generate the response using the full conversation history.
    response = client.models.generate_content(
        model=model_name,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
        ),
    )

    if not response.text:
        raise RuntimeError("Gemini returned an empty response.")

    return response.text
