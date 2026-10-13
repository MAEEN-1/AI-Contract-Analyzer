import os
from pathlib import Path

from dotenv import load_dotenv
from httpx import Client as HttpClient
from supabase import create_client, Client
from supabase.client import ClientOptions

env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

# Sign-up waits for Supabase to send the code email over SMTP, which can take
# longer than httpx's 5 second default. A timeout makes Supabase drop the account.
REQUEST_TIMEOUT_SECONDS = 30


def get_supabase_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")

    if not url or not key:
        raise RuntimeError("Supabase URL or key is missing")

    return create_client(
        url,
        key,
        options=ClientOptions(
            auto_refresh_token=False,
            persist_session=False,
            httpx_client=HttpClient(
                timeout=REQUEST_TIMEOUT_SECONDS,
                follow_redirects=True,
            ),
        ),
    )