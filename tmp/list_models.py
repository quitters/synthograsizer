
import os
import json
from pathlib import Path
from google import genai

def list_models():
    # Try to find API key
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    
    if not api_key:
        config_path = Path("ai_studio_config.json")
        if config_path.exists():
            with open(config_path, 'r') as f:
                saved = json.load(f)
                api_key = saved.get("api_key")
    
    if not api_key:
        print("Error: API Key not found in environment or ai_studio_config.json")
        return

    try:
        client = genai.Client(api_key=api_key)
        print("Available models:")
        for model in client.models.list():
            if "veo" in model.name.lower():
                print(f"  - {model.name}")
    except Exception as e:
        print(f"Error listing models: {e}")

if __name__ == "__main__":
    list_models()
