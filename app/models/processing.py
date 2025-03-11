from pydantic import BaseModel
from typing import List, Dict, Optional, Union

class ProcessorConfig(BaseModel):
    """
    Configuration for a text processor
    """
    type: str
    params: Dict[str, Union[str, float, bool, List[str], List[float], Dict]]

class ProcessingRequest(BaseModel):
    """
    Request to process text with a pipeline of processors
    """
    text: str
    processors: List[ProcessorConfig]
    
class ProcessingResponse(BaseModel):
    """
    Response from text processing
    """
    original: str
    processed: str
    success: bool
    message: Optional[str] = None
