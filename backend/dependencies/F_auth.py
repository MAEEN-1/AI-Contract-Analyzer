from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase_auth.errors import (
    AuthApiError,
    AuthInvalidJwtError,
    AuthSessionMissingError,
    AuthRetryableError,
    AuthUnknownError,
)
from httpx import RequestError
from pydantic import ValidationError

from services.F_auth_service import AI_CONSENT_KEY, get_user_from_token


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Bearer token is required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    if not token.isascii() or any(
        ord(character) <= 32 or ord(character) == 127 for character in token
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user = get_user_from_token(token)
    except (RequestError, AuthRetryableError) as error:
        raise HTTPException(
            status_code=503,
            detail="Authentication service unavailable",
        ) from error
    except (AuthInvalidJwtError, AuthSessionMissingError) as error:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error
    except (AuthUnknownError, ValidationError) as error:
        raise HTTPException(
            status_code=502,
            detail="Invalid response from authentication service",
        ) from error
    except AuthApiError as error:
        if error.status == 429 or error.status >= 500:
            raise HTTPException(
                status_code=503,
                detail="Authentication service unavailable",
            ) from error

        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from error

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


def require_ai_consent(user=Depends(get_current_user)):
    """For endpoints that send the user's data to OpenAI."""
    metadata = user.user_metadata or {}

    if not metadata.get(AI_CONSENT_KEY):
        raise HTTPException(
            status_code=403,
            detail="AI processing consent is required",
        )

    return user
