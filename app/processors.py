from typing import List, Dict, Union, Any, Optional
import re

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
    def __init__(self, variables: Dict[str, Any]):
        self.variables = variables
    
    def process(self, text: str) -> str:
        """
        Replace variable placeholders with their values
        Supports both {var} and {{var}} formats
        """
        result = text
        
        # Process each variable
        for name, value in self.variables.items():
            # Single brace format: {var}
            placeholder = f"{{{name}}}"
            if placeholder in result:
                result = result.replace(placeholder, str(value))
                
            # Double brace format: {{var}}
            double_placeholder = f"{{{{{name}}}}}"
            if double_placeholder in result:
                result = result.replace(double_placeholder, str(value))
        
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

class KnobWeightProcessor(TextProcessor):
    """
    Process text based on knob values to adjust weights
    """
    def __init__(self, knobs: Dict[int, Dict[str, Any]]):
        self.knobs = knobs
    
    def process(self, text: str) -> str:
        """
        Find patterns like [text:knob_id] and replace with (text:weight)
        where weight is derived from the knob value
        """
        # Pattern: [text:knob_id] or [text:knob_id:mode]
        pattern = r'\[(.*?):([\d]+)(?::(A|B|C))?\]'
        
        def replace_match(match):
            content = match.group(1)
            knob_id = int(match.group(2))
            mode = match.group(3) if match.group(3) else "A"
            
            if knob_id in self.knobs:
                knob_data = self.knobs[knob_id]
                value = knob_data.get("value", 50)
                knob_min = knob_data.get("min", 0)
                knob_max = knob_data.get("max", 100)
                
                # Normalize value to 0-1 range
                normalized = (value - knob_min) / (knob_max - knob_min) if knob_max > knob_min else 0.5
                
                # Apply different transformations based on mode
                if mode == "A":  # Linear: 0-2 range
                    weight = normalized * 2
                elif mode == "B":  # Exponential: 0.1-10 range
                    weight = 0.1 + (normalized ** 2) * 9.9
                elif mode == "C":  # Inverse: 2-0 range (high knob = low weight)
                    weight = 2 - (normalized * 2)
                else:
                    weight = normalized * 2
                
                # Format weight with 2 decimal places, remove trailing zeros
                weight_str = f"{weight:.2f}".rstrip('0').rstrip('.') if '.' in f"{weight:.2f}" else f"{weight:.2f}"
                
                return f"({content}:{weight_str})"
            return match.group(0)  # Return unchanged if knob not found
        
        return re.sub(pattern, replace_match, text)

class TextCycleProcessor(TextProcessor):
    """
    Process text based on knob values to cycle through text options
    """
    def __init__(self, knobs: Dict[int, Dict[str, Any]]):
        self.knobs = knobs
    
    def process(self, text: str) -> str:
        """
        Find patterns like {cycle:knob_id:option1,option2,option3}
        and replace with the selected option based on knob value
        """
        # Pattern: {cycle:knob_id:option1,option2,option3}
        pattern = r'\{cycle:([\d]+):(.*?)\}'
        
        def replace_match(match):
            knob_id = int(match.group(1))
            options_str = match.group(2)
            options = [opt.strip() for opt in options_str.split(',')]
            
            if not options:
                return ""
                
            if knob_id in self.knobs and options:
                knob_data = self.knobs[knob_id]
                value = knob_data.get("value", 50)
                knob_min = knob_data.get("min", 0)
                knob_max = knob_data.get("max", 100)
                
                # Normalize value to 0-1 range
                normalized = (value - knob_min) / (knob_max - knob_min) if knob_max > knob_min else 0.5
                
                # Map normalized value to option index
                option_index = min(int(normalized * len(options)), len(options) - 1)
                
                return options[option_index]
            
            # Default to first option if knob not found
            return options[0] if options else ""
        
        return re.sub(pattern, replace_match, text)

class TextVariableProcessor(TextProcessor):
    """
    Process text variables based on knob values
    """
    def __init__(self, knobs: Dict[int, Dict[str, Any]], variables: Dict[str, Any]):
        self.knobs = knobs
        self.variables = variables
        
    def process(self, text: str) -> str:
        """
        Process text variables that are defined with comma-separated values
        and controlled by knobs
        """
        result = text
        
        # Process each variable that might be a text variable with multiple values
        for var_name, var_value in self.variables.items():
            if isinstance(var_value, str) and ',' in var_value:
                # This might be a text variable with multiple values
                options = [opt.strip() for opt in var_value.split(',')]
                
                # Find the knob that controls this variable
                controlling_knob = None
                for knob_id, knob_data in self.knobs.items():
                    if knob_data.get("variable_name") == var_name or knob_data.get("label") == var_name:
                        controlling_knob = knob_id
                        break
                
                if controlling_knob is not None and options:
                    # Get the knob value and normalize it
                    knob_data = self.knobs[controlling_knob]
                    value = float(knob_data.get("value", 50))
                    knob_min = float(knob_data.get("min", 0))
                    knob_max = float(knob_data.get("max", 100))
                    
                    # Normalize value to 0-1 range
                    normalized = (value - knob_min) / (knob_max - knob_min) if knob_max > knob_min else 0.5
                    
                    # Map normalized value to option index
                    option_index = min(int(normalized * len(options)), len(options) - 1)
                    selected_value = options[option_index]
                    
                    # Replace the variable placeholder with the selected value
                    placeholder = f"{{{var_name}}}"
                    result = result.replace(placeholder, selected_value)
                    
                    # Also handle double braces format
                    double_placeholder = f"{{{{{var_name}}}}}"
                    result = result.replace(double_placeholder, selected_value)
                    
                    # Update the variable in the variables dictionary to the selected value
                    # This ensures other processors that use this variable will use the selected value
                    self.variables[var_name] = selected_value
            elif var_name in self.variables:
                # For non-text variables, just ensure they're properly formatted
                # This handles the case where a variable might be a number from a knob
                placeholder = f"{{{var_name}}}"
                double_placeholder = f"{{{{{var_name}}}}}"
                
                if placeholder in result or double_placeholder in result:
                    # Convert to string if it's not already
                    str_value = str(var_value)
                    result = result.replace(placeholder, str_value)
                    result = result.replace(double_placeholder, str_value)
        
        return result

class ConditionalProcessor(TextProcessor):
    """
    Process conditional text based on variable values
    """
    def __init__(self, variables: Dict[str, Any]):
        self.variables = variables
    
    def process(self, text: str) -> str:
        """
        Process conditional expressions in the format:
        {if:variable_name:true_text|false_text}
        or
        {if:variable_name>value:true_text|false_text}
        """
        # Pattern: {if:condition:true_text|false_text}
        pattern = r'\{if:(.*?):(.*?)\|(.*?)\}'
        
        def replace_match(match):
            condition = match.group(1)
            true_text = match.group(2)
            false_text = match.group(3)
            
            # Check for comparison operators
            comp_match = re.match(r'(.*?)([<>=!]+)(.*)', condition)
            if comp_match:
                var_name = comp_match.group(1).strip()
                operator = comp_match.group(2)
                compare_value = comp_match.group(3).strip()
                
                # Get variable value
                if var_name in self.variables:
                    var_value = self._get_variable_value(self.variables[var_name])
                    
                    # Convert compare_value to appropriate type
                    try:
                        if compare_value.lower() == "true":
                            compare_value = True
                        elif compare_value.lower() == "false":
                            compare_value = False
                        elif '.' in compare_value:
                            compare_value = float(compare_value)
                        else:
                            compare_value = int(compare_value)
                    except ValueError:
                        # Keep as string if conversion fails
                        pass
                    
                    # Evaluate condition
                    condition_met = False
                    if operator == "==":
                        condition_met = var_value == compare_value
                    elif operator == "!=":
                        condition_met = var_value != compare_value
                    elif operator == ">":
                        condition_met = var_value > compare_value
                    elif operator == "<":
                        condition_met = var_value < compare_value
                    elif operator == ">=":
                        condition_met = var_value >= compare_value
                    elif operator == "<=":
                        condition_met = var_value <= compare_value
                    
                    return true_text if condition_met else false_text
            else:
                # Simple variable existence check
                var_name = condition.strip()
                if var_name in self.variables:
                    var_value = self._get_variable_value(self.variables[var_name])
                    # For boolean values or truthy check
                    if isinstance(var_value, bool):
                        return true_text if var_value else false_text
                    # For non-boolean values, check if they exist and are not empty
                    return true_text if var_value else false_text
            
            return false_text  # Default to false text
        
        return re.sub(pattern, replace_match, text)
    
    def _get_variable_value(self, variable: Any) -> Any:
        """Extract the actual value from a variable which might be a dict with type information"""
        if isinstance(variable, dict) and "type" in variable and "value" in variable:
            return variable["value"]
        return variable

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
