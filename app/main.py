from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import List, Dict
import json
import os
import uuid
import logging
from .models.variable import Variable, StableDiffusionInput
from .api.routes import router as api_router
from .core.state_manager import StateManager
from .core.template_manager import TemplateManager
from .models.template import Template

app = FastAPI(title="Synthograsizer API")

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a shared state manager instance
state_manager = StateManager()

# Create a template manager instance
template_manager = TemplateManager()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()

logger = logging.getLogger(__name__)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Get client IP
    client = websocket.client
    
    # Add to connected clients
    client_id = str(uuid.uuid4())
    state_manager.add_client(client_id, websocket)
    
    try:
        # Send initial state
        await websocket.send_json({
            "type": "initial_state",
            "data": state_manager.get_current_state()
        })
        
        # Listen for messages
        async for message in websocket.iter_json():
            if isinstance(message, dict):
                if message.get("type") == "state_update":
                    # Update state
                    state_data = message.get("data", {})
                    state_manager.update_state(state_data)
                    
                    # Broadcast state update to all clients
                    await state_manager.broadcast({
                        "type": "state_update",
                        "data": state_manager.get_current_state()
                    })
                
                elif message.get("type") == "process_prompt":
                    # Process the prompt with variable substitution and other transformations
                    prompt_data = message.get("data", {})
                    text = prompt_data.get("text", "")
                    variables = prompt_data.get("variables", {})
                    
                    try:
                        from .processors import (
                            VariableSubstitution, 
                            KnobWeightProcessor, 
                            ConditionalProcessor, 
                            TextCycleProcessor,
                            TextVariableProcessor,
                            ProcessorPipeline
                        )
                        
                        # Get knob data from state manager
                        knobs = state_manager.get_current_state().get("knobs", {})
                        
                        # Convert knobs from string keys to int keys
                        knobs_int = {}
                        for k, v in knobs.items():
                            try:
                                knobs_int[int(k)] = v
                            except ValueError:
                                knobs_int[k] = v
                        
                        # Update knob data with variable names and text values
                        for knob_id, knob_data in knobs_int.items():
                            for var_name, var_value in variables.items():
                                if knob_data.get("label") == var_name:
                                    knob_data["variable_name"] = var_name
                                    # If this is a text variable with comma-separated values
                                    if isinstance(var_value, str) and ',' in var_value:
                                        knob_data["type"] = "text"
                                        knob_data["textValues"] = var_value
                                    else:
                                        knob_data["type"] = "number"
                                        
                        # Debug logging
                        logger.info(f"Processing prompt: {text}")
                        logger.info(f"Variables: {variables}")
                        logger.info(f"Knobs: {knobs_int}")
                        
                        # Create a pipeline with processors
                        processors = [
                            TextVariableProcessor(knobs_int, variables),  # Process text variables first
                            VariableSubstitution(variables),          # Then handle other variables
                            KnobWeightProcessor(knobs_int),               # Process weight syntax
                            TextCycleProcessor(knobs_int),                # Process cycle syntax
                            ConditionalProcessor(variables)           # Process conditional syntax
                        ]
                        pipeline = ProcessorPipeline(processors)
                        
                        # Process the text
                        processed_text = pipeline.process(text)
                        
                        # Debug logging
                        logger.info(f"Processed text: {processed_text}")
                        
                        # Send the result back
                        await websocket.send_json({
                            "type": "prompt_result",
                            "data": {
                                "original": text,
                                "processed": processed_text,
                                "success": True
                            }
                        })
                    except Exception as e:
                        logger.error(f"Error processing prompt: {str(e)}")
                        await websocket.send_json({
                            "type": "prompt_result",
                            "data": {
                                "original": text,
                                "processed": text,
                                "success": False,
                                "message": str(e)
                            }
                        })
                
                elif message.get("type") == "save_template":
                    # Save template
                    template_data = message.get("data", {})
                    
                    try:
                        # Create template object
                        template = Template(
                            name=template_data.get("name", f"Template {uuid.uuid4().hex[:8]}"),
                            description=template_data.get("description", ""),
                            knobs=template_data.get("knobs", {}),
                            variables=template_data.get("variables", {}),
                            prompt=template_data.get("prompt", "")
                        )
                        
                        # Save template
                        success = template_manager.save_template(template)
                        
                        # Send response
                        await websocket.send_json({
                            "type": "template_saved",
                            "data": {
                                "success": success,
                                "name": template.name,
                                "message": f"Template '{template.name}' saved successfully" if success else f"Failed to save template '{template.name}'"
                            }
                        })
                    except Exception as e:
                        logger.error(f"Error saving template: {str(e)}")
                        await websocket.send_json({
                            "type": "template_saved",
                            "data": {
                                "success": False,
                                "message": f"Error saving template: {str(e)}"
                            }
                        })
                
                elif message.get("type") == "load_template":
                    # Load template
                    template_name = message.get("data", {}).get("name")
                    
                    if not template_name:
                        await websocket.send_json({
                            "type": "template_loaded",
                            "data": {
                                "success": False,
                                "message": "Template name is required"
                            }
                        })
                        continue
                    
                    try:
                        # Load template
                        template = template_manager.load_template(template_name)
                        
                        if template:
                            # Send response
                            await websocket.send_json({
                                "type": "template_loaded",
                                "data": {
                                    "success": True,
                                    "template": template.dict(),
                                    "message": f"Template '{template.name}' loaded successfully"
                                }
                            })
                            
                            # Update state with template data
                            state_data = {
                                "knobs": template.knobs,
                                "prompt": {"text": template.prompt} if template.prompt else None
                            }
                            
                            # Update state
                            state_manager.update_state(state_data)
                            
                            # Broadcast state update to all clients
                            await state_manager.broadcast({
                                "type": "state_update",
                                "data": state_manager.get_current_state()
                            })
                        else:
                            await websocket.send_json({
                                "type": "template_loaded",
                                "data": {
                                    "success": False,
                                    "message": f"Template '{template_name}' not found"
                                }
                            })
                    except Exception as e:
                        logger.error(f"Error loading template: {str(e)}")
                        await websocket.send_json({
                            "type": "template_loaded",
                            "data": {
                                "success": False,
                                "message": f"Error loading template: {str(e)}"
                            }
                        })
                
                elif message.get("type") == "list_templates":
                    # List templates
                    try:
                        # Get templates
                        templates = template_manager.list_templates()
                        
                        # Send response
                        await websocket.send_json({
                            "type": "templates_list",
                            "data": {
                                "success": True,
                                "templates": templates
                            }
                        })
                    except Exception as e:
                        logger.error(f"Error listing templates: {str(e)}")
                        await websocket.send_json({
                            "type": "templates_list",
                            "data": {
                                "success": False,
                                "message": f"Error listing templates: {str(e)}"
                            }
                        })
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Include API routes
app.include_router(api_router, prefix="/api")

# Serve static files if frontend build exists
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend/dist")
if os.path.exists(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
else:
    print(f"Warning: Frontend build directory not found at {frontend_dir}")

# API root endpoint - only accessible if static files are not mounted
@app.get("/api")
async def api_root():
    return {"message": "Synthograsizer API is running"}
