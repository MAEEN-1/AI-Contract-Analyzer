from datetime import datetime

from pydantic import BaseModel, Field, field_validator

MAX_QUESTION_CHARS = 2000


class ContractQuestion(BaseModel):
    question: str = Field(max_length=MAX_QUESTION_CHARS)

    @field_validator("question")
    @classmethod
    def question_is_not_blank(cls, question: str) -> str:
        question = question.strip()
        if not question:
            raise ValueError("Question must not be empty")
        return question


class Source(BaseModel):
    """A passage of the contract that supports an answer."""

    page: int
    text: str


class ContractAnswer(BaseModel):
    answer: str
    sources: list[Source]


class ChatEntry(BaseModel):
    question: str
    answer: str
    sources: list[Source]
    created_at: datetime


class AnalysisOut(BaseModel):
    """The AI Backend's analysis, as returned by ai_backend.analysis.ContractAnalysis."""

    analysis: dict
    created_at: datetime


class AnalysisStarted(BaseModel):
    status: str
