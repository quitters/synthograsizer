from typing import Dict, Any, Optional
from pydantic import BaseModel


class Template(BaseModel):
    """
    Model for template data including knobs, variables, and prompt
    """
    name: str
    description: Optional[str] = None
    knobs: Dict[str, Any]
    variables: Dict[str, Any]
    prompt: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
