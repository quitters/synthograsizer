from typing import List, Optional
from pydantic import BaseModel

class VariableValue(BaseModel):
    values: List[str]
    weights: Optional[List[float]] = None

class Variable(BaseModel):
    name: str
    feature_name: str
    value: VariableValue

class StableDiffusionInput(BaseModel):
    prompt: str
    negative_prompt: Optional[str] = None
    height: Optional[int] = 512
    width: Optional[int] = 512
    cfg_scale: Optional[float] = 7.0
    steps: Optional[int] = 20
    denoising_strength: Optional[float] = 0.7
    img2img_source: Optional[str] = None
