import logging
from typing import Optional, Dict, Any
import jwt
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

logger = logging.getLogger("photo_culling.security")
security_scheme = HTTPBearer(auto_error=False)


class AuthenticatedUser:
    def __init__(self, user_id: str, email: Optional[str] = None, claims: Optional[Dict[str, Any]] = None):
        self.user_id = user_id
        self.email = email
        self.claims = claims or {}

    def __repr__(self):
        return f"<AuthenticatedUser user_id={self.user_id}>"


async def verify_clerk_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_scheme),
) -> AuthenticatedUser:
    """
    Validates Clerk JWT Bearer Token.
    If Clerk keys are not configured or DEBUG is enabled with no token, allows a developer studio user.
    """
    # If no token provided
    if not credentials:
        if settings.DEBUG or not settings.CLERK_PEM_PUBLIC_KEY:
            # Fallback developer studio user for local testing
            return AuthenticatedUser(
                user_id="studio_owner_dev",
                email="director@photostudio.ai",
                claims={"role": "studio_admin", "dev_mode": True},
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization Bearer header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # If Clerk PEM public key is configured, decode and verify signature
    if settings.CLERK_PEM_PUBLIC_KEY:
        try:
            # Format public key if standard PEM header is missing
            pub_key = settings.CLERK_PEM_PUBLIC_KEY.strip()
            if not pub_key.startswith("-----BEGIN PUBLIC KEY-----"):
                pub_key = f"-----BEGIN PUBLIC KEY-----\n{pub_key}\n-----END PUBLIC KEY-----"

            decoded = jwt.decode(
                token,
                pub_key,
                algorithms=["RS256"],
                options={"verify_aud": False},
            )
            user_id = decoded.get("sub", "unknown_user")
            email = decoded.get("email") or decoded.get("primary_email_address")
            return AuthenticatedUser(user_id=user_id, email=email, claims=decoded)
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Clerk session token has expired.",
            )
        except jwt.PyJWTError as e:
            logger.warning(f"Clerk JWT validation error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid authentication token: {str(e)}",
            )
    elif settings.CLERK_SECRET_KEY:
        try:
            decoded = jwt.decode(
                token,
                settings.CLERK_SECRET_KEY,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            user_id = decoded.get("sub", "unknown_user")
            return AuthenticatedUser(user_id=user_id, claims=decoded)
        except Exception as e:
            logger.warning(f"Clerk Secret Key decode error: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Clerk signature.",
            )
    else:
        # If no keys configured, allow in development
        try:
            # Unverified decode for dev inspection
            unverified = jwt.decode(token, options={"verify_signature": False})
            return AuthenticatedUser(
                user_id=unverified.get("sub", "dev_user"),
                claims=unverified,
            )
        except Exception:
            return AuthenticatedUser(
                user_id="studio_owner_dev",
                email="director@photostudio.ai",
                claims={"role": "studio_admin"},
            )


def get_current_user(user: AuthenticatedUser = Depends(verify_clerk_token)) -> AuthenticatedUser:
    """Dependency for securing endpoints with Clerk auth."""
    return user
