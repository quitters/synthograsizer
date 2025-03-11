from typing import Dict, List, Optional
from app.models.knob import Knob, Prompt, VariableGroup
import json
import os

class StateManager:
    def __init__(self):
        self.knobs: Dict[int, Knob] = {}
        self.prompt: Optional[Prompt] = None
        self.variable_groups: Dict[str, VariableGroup] = {}
        self.current_mode: str = 'A'
        self.clients = {}  # Store connected clients

    def add_client(self, client_id: str, websocket):
        """Add a client to the connected clients list"""
        self.clients[client_id] = websocket

    def remove_client(self, client_id: str):
        """Remove a client from the connected clients list"""
        if client_id in self.clients:
            del self.clients[client_id]

    async def broadcast(self, message):
        """Broadcast a message to all connected clients"""
        disconnected_clients = []
        
        for client_id, websocket in self.clients.items():
            try:
                await websocket.send_json(message)
            except Exception:
                disconnected_clients.append(client_id)
        
        # Remove disconnected clients
        for client_id in disconnected_clients:
            self.remove_client(client_id)

    def update_knob(self, knob_id: int, value: float, mode: str) -> Knob:
        if knob_id in self.knobs and not self.knobs[knob_id].locked:
            self.knobs[knob_id].value = value
            self.knobs[knob_id].mode = mode
            return self.knobs[knob_id]
        raise ValueError(f"Knob {knob_id} not found or locked")

    def update_state(self, state_data: dict):
        """Update the state with new data"""
        if "knobs" in state_data:
            for knob_id, knob_data in state_data["knobs"].items():
                try:
                    knob_id_int = int(knob_id)
                    if knob_id_int not in self.knobs:
                        self.knobs[knob_id_int] = Knob(
                            value=knob_data.get("value", 50),
                            mode=knob_data.get("mode", "A"),
                            label=knob_data.get("label", f"Knob {knob_id_int}")
                        )
                    else:
                        if "value" in knob_data:
                            self.knobs[knob_id_int].value = knob_data["value"]
                        if "mode" in knob_data:
                            self.knobs[knob_id_int].mode = knob_data["mode"]
                        if "label" in knob_data:
                            self.knobs[knob_id_int].label = knob_data["label"]
                except ValueError:
                    pass  # Skip invalid knob IDs

    def update_prompt(self, prompt: Prompt) -> Prompt:
        self.prompt = prompt
        return self.prompt

    def save_state(self, filename: str):
        state = {
            "knobs": {k: v.dict() for k, v in self.knobs.items()},
            "prompt": self.prompt.dict() if self.prompt else None,
            "variable_groups": {k: v.dict() for k, v in self.variable_groups.items()},
            "current_mode": self.current_mode
        }
        
        with open(filename, 'w') as f:
            json.dump(state, f, indent=2)

    def load_state(self, filename: str):
        if not os.path.exists(filename):
            raise FileNotFoundError(f"State file {filename} not found")
            
        with open(filename, 'r') as f:
            state = json.load(f)
            
        self.knobs = {int(k): Knob(**v) for k, v in state["knobs"].items()}
        self.prompt = Prompt(**state["prompt"]) if state["prompt"] else None
        self.variable_groups = {k: VariableGroup(**v) for k, v in state["variable_groups"].items()}
        self.current_mode = state["current_mode"]

    def switch_mode(self, new_mode: str):
        if new_mode not in ['A', 'B', 'C', 'D']:
            raise ValueError("Invalid mode")
        self.current_mode = new_mode

    def get_current_state(self):
        return {
            "knobs": {k: v.dict() for k, v in self.knobs.items()},
            "prompt": self.prompt.dict() if self.prompt else None,
            "current_mode": self.current_mode
        }
