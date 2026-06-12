from typing import List, Dict
from backend import config
from backend.helpers import SafetyBlockedError


def chat(self, message: str, history: List[Dict[str, str]] = None, model_name: str = config.MODEL_TEXT_CHAT):
    """Send a message to the chat model (routes through the active backend tier).

    Key/availability checks live in the providers: Google raises
    "API Key not configured" when unset; the local provider raises a
    ConnectionError naming the unreachable endpoint.
    """
    try:
        return self.llm_chat(message, history, model_name)
    except SafetyBlockedError:
        raise  # keep the type — routers emit a structured 422 for these
    except Exception as e:
        raise Exception(f"Chat failed: {str(e)}")


def generate_text(self, prompt: str, model_name: str = config.MODEL_FAST):
    """Generate text via the active backend tier (Google or local model)."""
    try:
        return self.llm_text([prompt], model_name)
    except SafetyBlockedError:
        raise  # keep the type — routers emit a structured 422 for these
    except Exception as e:
        raise Exception(f"Text generation failed: {str(e)}")


def generate_text_stream(self, prompt: str, model_name: str = config.MODEL_FAST):
    """Stream text chunks via the active backend tier. Yields string chunks."""
    yield from self.llm_text_stream([prompt], model_name)
