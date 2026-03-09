"""
ComfyUI Custom Node: Synthograsizer Text Receiver
Receives real-time text updates from Synthograsizer without triggering workflow execution
"""

import json
import asyncio
from aiohttp import web
import server
from server import PromptServer

class SynthograsizerTextReceiver:
    """
    A node that receives and displays text from Synthograsizer.
    The text can be updated via WebSocket or REST API without re-executing the workflow.
    """
    
    def __init__(self):
        self.text = ""
        self.node_id = None
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "default_text": ("STRING", {
                    "multiline": True,
                    "default": "Waiting for Synthograsizer input..."
                }),
            },
            "optional": {
                "update_trigger": ("*", {}),  # Any input to force update
            }
        }
    
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "receive_text"
    CATEGORY = "synthograsizer"
    OUTPUT_NODE = False
    
    def receive_text(self, default_text, update_trigger=None):
        """
        Returns the current text, either from real-time updates or the default
        """
        # If we have received text via API, use that. Otherwise, use default
        if hasattr(self, '_received_text') and self._received_text:
            return (self._received_text,)
        return (default_text,)
    
    def update_text(self, text):
        """
        Update the text without triggering workflow execution
        """
        self._received_text = text


# Storage for node instances
text_receiver_nodes = {}


class SynthograsizerAPI:
    """
    API endpoints for updating text in Synthograsizer nodes
    """
    
    @staticmethod
    def update_node_text(node_id, text):
        """Update text for a specific node"""
        if node_id in text_receiver_nodes:
            text_receiver_nodes[node_id].update_text(text)
            return True
        return False


# Add API routes
@PromptServer.instance.routes.post('/synthograsizer/update_text')
async def update_text_handler(request):
    """
    REST endpoint to update text in a Synthograsizer node
    Expected JSON: { "node_id": "x", "text": "..." }
    """
    try:
        data = await request.json()
        node_id = str(data.get('node_id', ''))
        text = data.get('text', '')
        
        if not node_id:
            return web.json_response({
                'success': False,
                'error': 'node_id is required'
            }, status=400)
        
        # Store the text for the node
        if node_id not in text_receiver_nodes:
            text_receiver_nodes[node_id] = SynthograsizerTextReceiver()
        
        text_receiver_nodes[node_id].update_text(text)
        
        # Notify connected clients via WebSocket
        await notify_text_update(node_id, text)
        
        return web.json_response({
            'success': True,
            'node_id': node_id,
            'text_length': len(text)
        })
        
    except Exception as e:
        return web.json_response({
            'success': False,
            'error': str(e)
        }, status=500)


@PromptServer.instance.routes.get('/synthograsizer/nodes')
async def get_nodes_handler(request):
    """
    Get list of active Synthograsizer text receiver nodes
    """
    nodes = []
    for node_id, node in text_receiver_nodes.items():
        nodes.append({
            'node_id': node_id,
            'has_text': hasattr(node, '_received_text') and bool(node._received_text),
            'text_preview': getattr(node, '_received_text', '')[:50] + '...' if getattr(node, '_received_text', '') else ''
        })
    
    return web.json_response({
        'success': True,
        'nodes': nodes
    })


async def notify_text_update(node_id, text):
    """
    Notify all connected WebSocket clients about text update
    """
    message = {
        'type': 'synthograsizer_text_update',
        'data': {
            'node_id': node_id,
            'text': text
        }
    }
    
    # Send to all connected clients
    if hasattr(PromptServer.instance, 'send_sync'):
        await PromptServer.instance.send_sync(message)


# WebSocket message handler
original_send_sync = None

def setup_websocket_handler():
    """
    Set up WebSocket message handling for Synthograsizer
    """
    global original_send_sync
    
    if hasattr(PromptServer.instance, 'send_sync') and not original_send_sync:
        original_send_sync = PromptServer.instance.send_sync
        
        async def wrapped_send_sync(message, client_id=None):
            # Handle incoming WebSocket messages
            if isinstance(message, dict) and message.get('type') == 'synthograsizer_update':
                data = message.get('data', {})
                node_id = data.get('node_id')
                text = data.get('text', '')
                
                if node_id:
                    SynthograsizerAPI.update_node_text(node_id, text)
                    await notify_text_update(node_id, text)
                    return
            
            # Pass through to original handler
            if original_send_sync:
                await original_send_sync(message, client_id)
        
        PromptServer.instance.send_sync = wrapped_send_sync


# Initialize WebSocket handler
setup_websocket_handler()


# Node class mappings
NODE_CLASS_MAPPINGS = {
    "SynthograsizerTextReceiver": SynthograsizerTextReceiver
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SynthograsizerTextReceiver": "Synthograsizer Text Receiver"
}

# Optional: Create a simple text display node that doesn't output anything
class SynthograsizerTextDisplay:
    """
    A node that just displays text from Synthograsizer without outputting it
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {
                    "multiline": True,
                    "default": "Synthograsizer prompt will appear here..."
                }),
            }
        }
    
    RETURN_TYPES = ()
    FUNCTION = "display_text"
    CATEGORY = "synthograsizer"
    OUTPUT_NODE = True
    
    def display_text(self, text):
        # This node just displays text, doesn't output anything
        return {}


NODE_CLASS_MAPPINGS["SynthograsizerTextDisplay"] = SynthograsizerTextDisplay
NODE_DISPLAY_NAME_MAPPINGS["SynthograsizerTextDisplay"] = "Synthograsizer Text Display"
