import os
import google.generativeai as genai
from backend.config import get_api_key

def list_models():
    api_key = get_api_key()
    if not api_key:
        print("Error: No API key found.")
        return
    
    genai.configure(api_key=api_key)
    
    print("Available models:")
    try:
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                print(f"  - {m.name}")
    except Exception as e:
        print(f"Error listing models: {e}")

if __name__ == "__main__":
    list_models()
