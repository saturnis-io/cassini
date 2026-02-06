"""User API schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    """Schema for creating a new user."""

    username: str = Field(..., min_length=3, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    password: str = Field(..., min_length=8)


class UserUpdate(BaseModel):
    """Schema for updating a user."""

    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[str] = Field(None, max_length=255)
    password: Optional[str] = Field(None, min_length=8)
    is_active: Optional[bool] = None


class PlantRoleResponse(BaseModel):
    """Schema for a user's role at a plant."""

    plant_id: int
    plant_name: str
    plant_code: str
    role: str

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    """Schema for user response (no password)."""

    id: int
    username: str
    email: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserWithRolesResponse(UserResponse):
    """Schema for user response with plant role assignments."""

    plant_roles: list[PlantRoleResponse] = []


class PlantRoleAssign(BaseModel):
    """Schema for assigning a plant role to a user."""

    plant_id: int
    role: str = Field(..., pattern=r"^(operator|supervisor|engineer|admin)$")


class LoginRequest(BaseModel):
    """Schema for login request."""

    username: str
    password: str
    remember_me: bool = False


class TokenResponse(BaseModel):
    """Schema for token response."""

    access_token: str
    token_type: str = "bearer"


class LoginResponse(TokenResponse):
    """Schema for login response with user data."""

    user: UserWithRolesResponse
