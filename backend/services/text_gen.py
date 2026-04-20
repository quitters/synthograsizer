import os
import json
import base64
import io
import time
import requests
import uuid
from datetime import datetime
import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any, Union
from backend import config
from backend.utils.retry import retry_on_transient
import google.generativeai as genai
from google import genai as genai_client
from google.genai import types
from PIL import Image
from PIL.PngImagePlugin import PngInfo

def chat(self, message: str, history: List[Dict[str, str]] = None, model_name: str = config.MODEL_TEXT_CHAT):
    """Send a message to the chat model."""
    if not self.api_key:
        raise ValueError("API Key not configured")
    
    try:
        model = genai.GenerativeModel(model_name)
        
        # Convert simple history format to Gemini format
        chat_history = []
        if history:
            for msg in history:
                role = "user" if msg["role"] == "user" else "model"
                chat_history.append({"role": role, "parts": [msg["content"]]})
        
        chat = model.start_chat(history=chat_history)
        response = chat.send_message(message)
        return response.text
    except Exception as e:
        raise Exception(f"Chat failed: {str(e)}")

def generate_text(self, prompt: str, model_name: str = config.MODEL_FAST):
    """Generate text using Gemini model."""
    if not self.genai_client:
        raise ValueError("API Key not configured")

    try:
        response = self.genai_client.models.generate_content(
            model=model_name,
            contents=prompt
        )
        return response.text
    except Exception as e:
        raise Exception(f"Text generation failed: {str(e)}")

def generate_text_stream(self, prompt: str, model_name: str = config.MODEL_FAST):
    """Stream text chunks from Gemini. Yields string chunks."""
    if not self.genai_client:
        raise ValueError("API Key not configured")

    for chunk in self.genai_client.models.generate_content_stream(
        model=model_name,
        contents=prompt
    ):
        if chunk.text:
            yield chunk.text

