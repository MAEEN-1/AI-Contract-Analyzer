from typing import Annotated
from pydantic import BaseModel, EmailStr, Field, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]

class RegisterData(BaseModel):
    first_name: Name
    last_name: Name
    email: EmailStr
    password: str = Field(min_length=1)

class LoginData(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)

class VerifyData(BaseModel):
    email: EmailStr
    code: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[0-9]{6,10}$")]

class ResendData(BaseModel):
    email: EmailStr