from fastapi import APIRouter, HTTPException, WebSocket, Depends
from app.models.knob import KnobUpdate, Prompt, VariableGroup
from app.core.state_manager import StateManager
from typing import Dict, List, Optional
import os
from app.models.processing import ProcessingRequest, ProcessingResponse
from app.processors import VariableSubstitution, WeightedCombination, ProcessorPipeline
from app.models.template import Template
from app.core.template_manager import TemplateManager

router = APIRouter()

# Initialize template manager
template_manager = TemplateManager()

# Dependency to get the state manager
def get_state_manager():
    from app.main import state_manager
    return state_manager

@router.post("/knob/update")
async def update_knob(update: KnobUpdate, state_manager: StateManager = Depends(get_state_manager)):
    try:
        knob = state_manager.update_knob(
            update.knob_id,
            update.value,
            update.mode
        )
        return knob
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/prompt/update")
async def update_prompt(prompt: Prompt, state_manager: StateManager = Depends(get_state_manager)):
    try:
        updated_prompt = state_manager.update_prompt(prompt)
        return updated_prompt
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/state/save")
async def save_state(filename: str, state_manager: StateManager = Depends(get_state_manager)):
    try:
        # Ensure the state directory exists
        os.makedirs("states", exist_ok=True)
        # Save state to the states directory
        state_path = os.path.join("states", f"{filename}.json")
        state_manager.save_state(state_path)
        return {"message": "State saved successfully", "path": state_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/state/load")
async def load_state(filename: str, state_manager: StateManager = Depends(get_state_manager)):
    try:
        # Load state from the states directory
        state_path = os.path.join("states", f"{filename}.json")
        state_manager.load_state(state_path)
        return {"message": "State loaded successfully", "path": state_path}
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/mode/switch")
async def switch_mode(mode: str, state_manager: StateManager = Depends(get_state_manager)):
    try:
        state_manager.switch_mode(mode)
        return {"message": f"Switched to mode {mode}"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/state")
async def get_state(state_manager: StateManager = Depends(get_state_manager)):
    return state_manager.get_current_state()

@router.post("/variable-group/create")
async def create_variable_group(group: VariableGroup, state_manager: StateManager = Depends(get_state_manager)):
    try:
        state_manager.variable_groups[group.name] = group
        return group
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/variable-groups")
async def get_variable_groups(state_manager: StateManager = Depends(get_state_manager)) -> Dict[str, VariableGroup]:
    return state_manager.variable_groups

@router.get("/available-states")
async def get_available_states():
    try:
        # Ensure the state directory exists
        os.makedirs("states", exist_ok=True)
        # Get list of saved states
        states = []
        for file in os.listdir("states"):
            if file.endswith(".json"):
                states.append(file[:-5])  # Remove .json extension
        return {"states": states}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/process-prompt")
async def process_prompt(request: ProcessingRequest, state_manager: StateManager = Depends(get_state_manager)):
    try:
        # Create a pipeline of processors based on the request
        processors = []
        for processor_config in request.processors:
            if processor_config.type == "variable_substitution":
                variables = processor_config.params.get("variables", {})
                processors.append(VariableSubstitution(variables))
            elif processor_config.type == "weighted_combination":
                segments = processor_config.params.get("segments", [])
                weights = processor_config.params.get("weights", [])
                processors.append(WeightedCombination(segments, weights))
        
        # Create the pipeline and process the text
        pipeline = ProcessorPipeline(processors)
        processed_text = pipeline.process(request.text)
        
        # Return the processed text
        return ProcessingResponse(
            original=request.text,
            processed=processed_text,
            success=True
        )
    except Exception as e:
        return ProcessingResponse(
            original=request.text,
            processed=request.text,
            success=False,
            message=str(e)
        )

# Template management endpoints
@router.get("/templates")
async def list_templates():
    """
    List all available templates
    """
    templates = template_manager.list_templates()
    return {"templates": templates}

@router.get("/templates/{name}")
async def get_template(name: str):
    """
    Get a specific template by name
    """
    template = template_manager.load_template(name)
    if template is None:
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
    return template

@router.post("/templates")
async def create_template(template: Template):
    """
    Create a new template
    """
    success = template_manager.save_template(template)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save template")
    return {"message": f"Template '{template.name}' saved successfully"}

@router.put("/templates/{name}")
async def update_template(name: str, template: Template):
    """
    Update an existing template
    """
    # Ensure the template name in the path matches the template name in the body
    if name != template.name:
        template.name = name
    
    success = template_manager.save_template(template)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update template")
    return {"message": f"Template '{template.name}' updated successfully"}

@router.delete("/templates/{name}")
async def delete_template(name: str):
    """
    Delete a template by name
    """
    success = template_manager.delete_template(name)
    if not success:
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found or could not be deleted")
    return {"message": f"Template '{name}' deleted successfully"}

@router.post("/templates/from-state")
async def create_template_from_state(name: str, description: Optional[str] = None, state_manager: StateManager = Depends(get_state_manager)):
    """
    Create a new template from the current state
    """
    state = state_manager.get_current_state()
    
    template = Template(
        name=name,
        description=description,
        knobs=state.get("knobs", {}),
        variables={},  # We'll need to extract variables from the frontend
        prompt=state.get("prompt", {}).get("text", "") if state.get("prompt") else ""
    )
    
    success = template_manager.save_template(template)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save template")
    return {"message": f"Template '{template.name}' created from current state"}

@router.post("/templates/{name}/apply")
async def apply_template(name: str, state_manager: StateManager = Depends(get_state_manager)):
    """
    Apply a template to the current state
    """
    template = template_manager.load_template(name)
    if template is None:
        raise HTTPException(status_code=404, detail=f"Template '{name}' not found")
    
    # Update state with template data
    state_data = {
        "knobs": template.knobs,
        "prompt": {"text": template.prompt} if template.prompt else None
    }
    
    # Update state
    state_manager.update_state(state_data)
    
    return {"message": f"Template '{template.name}' applied successfully"}
