import logging
from starlette.concurrency import run_in_threadpool
from backend.services.llm_services import generate_reply
logger = logging.getLogger(__name__)

from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


# 1. Create the FastAPI application
app = FastAPI(
    title="Flora AI API",
    description="Backend API for Flora AI",
    version="0.1.0",
)


# 2. Allow the local frontend to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Development only
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 3. Define message and request schemas
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class SendMessageRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)
    model: str = "flora-1"


class ConversationCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class Conversation(BaseModel):
    id: str
    title: str
    messages: list[ChatMessage] = Field(default_factory=list)


# 4. Temporary in-memory storage
# Data will disappear when the backend restarts.
conversations: list[Conversation] = []


# 5. Basic endpoints
@app.get("/")
async def root():
    return {"message": "Welcome to Flora AI API"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


# 6. List all conversations
@app.get("/conversations")
async def get_conversations():
    return [
        {"id": conversation.id, "title": conversation.title}
        for conversation in conversations
    ]


# 7. Create a conversation
@app.post("/conversations")
async def create_conversation(data: ConversationCreate):
    title = data.title.strip()

    if not title:
        raise HTTPException(status_code=422, detail="Title cannot be empty")

    conversation = Conversation(
        id=str(uuid4()),
        title=title,
    )

    conversations.insert(0, conversation)

    return {"id": conversation.id, "title": conversation.title}


# 8. Retrieve one conversation, including its messages
@app.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    conversation = next(
        (item for item in conversations if item.id == conversation_id),
        None,
    )

    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conversation


# 9. Rename a conversation
@app.patch("/conversations/{conversation_id}")
async def rename_conversation(
    conversation_id: str,
    data: ConversationRename,
):
    conversation = next(
        (item for item in conversations if item.id == conversation_id),
        None,
    )

    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    title = data.title.strip()

    if not title:
        raise HTTPException(status_code=422, detail="Title cannot be empty")

    conversation.title = title

    return {"id": conversation.id, "title": conversation.title}


# 10. Delete a conversation
@app.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: str):
    for index, conversation in enumerate(conversations):
        if conversation.id == conversation_id:
            conversations.pop(index)
            return Response(status_code=204)

    raise HTTPException(status_code=404, detail="Conversation not found")


# 11. Receive a message and return a temporary response
@app.post("/conversations/{conversation_id}/messages")
async def send_message(
    conversation_id: str,
    data: SendMessageRequest,
):
    conversation = next(
        (item for item in conversations if item.id == conversation_id),
        None,
    )

    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    latest_user_message = next(
        (
            message
            for message in reversed(data.messages)
            if message.role == "user"
        ),
        None,
    )

    if latest_user_message is None:
        raise HTTPException(
            status_code=400,
            detail="At least one user message is required",
        )


    # Generate a real response using Gemini.
    try:
        message_history = [
            message.model_dump()
            for message in data.messages
        ]

        assistant_reply = await run_in_threadpool(
            generate_reply,
            message_history,
        )

    except RuntimeError as exc:
        logger.exception("Flora AI configuration or generation error")
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception("Gemini API request failed")
        raise HTTPException(
            status_code=502,
            detail="Gemini generation failed. Check the backend logs.",
        ) from exc

    # Save the conversation history and assistant response.
    conversation.messages = [
        *data.messages,
        ChatMessage(
            role="assistant",
            content=assistant_reply,
        ),
    ]

    return {"content": assistant_reply}
