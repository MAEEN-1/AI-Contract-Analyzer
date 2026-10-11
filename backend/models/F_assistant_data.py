from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

MAX_USER_MESSAGE_CHARS = 2000
MAX_ASSISTANT_MESSAGE_CHARS = 8000
MAX_MESSAGES = 20


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=MAX_ASSISTANT_MESSAGE_CHARS)

    @field_validator("content")
    @classmethod
    def content_is_not_blank(cls, content: str) -> str:
        content = content.strip()
        if not content:
            raise ValueError("Message must not be empty")
        return content

    @model_validator(mode="after")
    def user_message_is_short(self):
        if self.role == "user" and len(self.content) > MAX_USER_MESSAGE_CHARS:
            raise ValueError(f"Message must be {MAX_USER_MESSAGE_CHARS} characters or fewer")
        return self


class AssistantRequest(BaseModel):
    """The conversation so far, oldest first. The last message is the new question."""

    messages: list[AssistantMessage] = Field(min_length=1, max_length=MAX_MESSAGES)

    @field_validator("messages")
    @classmethod
    def last_message_is_from_user(cls, messages: list[AssistantMessage]) -> list[AssistantMessage]:
        if messages[-1].role != "user":
            raise ValueError("The last message must be from the user")
        return messages


class AssistantReply(BaseModel):
    reply: str
