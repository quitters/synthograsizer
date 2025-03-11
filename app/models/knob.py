from pydantic import BaseModel
from typing import List, Optional, Union, Dict

class Variable(BaseModel):
    name: str
    value: str
    weight: float = 1.0

class VariableGroup(BaseModel):
    name: str
    variables: List[Variable]
    locked: bool = False
    color: str

class Knob(BaseModel):
    id: int
    value: Union[float, int]  # float for continuous mode, int for discrete mode
    mode: str  # 'A' for discrete, 'B' for continuous
    variable_group: Optional[VariableGroup] = None
    locked: bool = False

class KnobUpdate(BaseModel):
    knob_id: int
    value: Union[float, int]
    mode: str

class Prompt(BaseModel):
    text: str
    negative_text: Optional[str] = None
    settings: Dict[str, Union[int, float, str]] = {}
