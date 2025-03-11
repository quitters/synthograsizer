from pydantic import BaseModel
from typing import List, Dict, Optional, Union

class TextProcessor:
    """
    Base class for text processing operations
    """
    def process(self, text: str) -> str:
        """
        Process the input text and return the modified text
        """
        return text

class VariableSubstitution(TextProcessor):
    """
    Processor that substitutes variables in text
    """
    def __init__(self, variables: Dict[str, Union[str, float, bool]]):
        self.variables = variables
    
    def process(self, text: str) -> str:
        """
        Replace variable placeholders with their values
        Format: {variable_name}
        """
        result = text
        for name, value in self.variables.items():
            placeholder = f"{{{name}}}"
            if placeholder in result:
                result = result.replace(placeholder, str(value))
        return result

class WeightedCombination(TextProcessor):
    """
    Processor that combines text segments with weights
    """
    def __init__(self, segments: List[str], weights: List[float]):
        if len(segments) != len(weights):
            raise ValueError("Number of segments must match number of weights")
        self.segments = segments
        self.weights = weights
    
    def process(self, text: str) -> str:
        """
        Combine segments with weights in the format:
        (segment1:weight1), (segment2:weight2), ...
        """
        result = []
        for segment, weight in zip(self.segments, self.weights):
            if weight != 1.0:
                result.append(f"({segment}:{weight})")
            else:
                result.append(segment)
        return ", ".join(result)

class ProcessorPipeline(TextProcessor):
    """
    Pipeline of text processors that are applied in sequence
    """
    def __init__(self, processors: List[TextProcessor]):
        self.processors = processors
    
    def process(self, text: str) -> str:
        """
        Apply all processors in sequence
        """
        result = text
        for processor in self.processors:
            result = processor.process(result)
        return result

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
