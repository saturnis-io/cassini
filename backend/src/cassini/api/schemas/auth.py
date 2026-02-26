"""Auth-related request/response schemas."""

from pydantic import BaseModel


class ForgotPasswordRequest(BaseModel):
    identifier: str  # username or email


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    email: str | None = None


class UpdateProfileResponse(BaseModel):
    message: str
    email_verification_sent: bool = False
