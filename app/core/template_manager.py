import os
import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime
from ..models.template import Template

logger = logging.getLogger(__name__)

class TemplateManager:
    """
    Manager for handling template operations including saving, loading, and listing templates
    """
    def __init__(self, templates_dir: str = None):
        """
        Initialize the template manager with a directory for storing templates
        """
        if templates_dir is None:
            # Default to a 'templates' directory in the project root
            self.templates_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 
                "templates"
            )
        else:
            self.templates_dir = templates_dir
            
        # Create templates directory if it doesn't exist
        if not os.path.exists(self.templates_dir):
            os.makedirs(self.templates_dir)
            logger.info(f"Created templates directory at {self.templates_dir}")
    
    def save_template(self, template: Template) -> bool:
        """
        Save a template to the templates directory
        Returns True if successful, False otherwise
        """
        try:
            # Generate filename from template name
            safe_name = self._safe_filename(template.name)
            filename = f"{safe_name}.json"
            filepath = os.path.join(self.templates_dir, filename)
            
            # Add timestamps
            now = datetime.now().isoformat()
            if not template.created_at:
                template.created_at = now
            template.updated_at = now
            
            # Convert template to dictionary
            template_dict = template.dict()
            
            # Write to file
            with open(filepath, 'w') as f:
                json.dump(template_dict, indent=2, fp=f)
                
            logger.info(f"Saved template '{template.name}' to {filepath}")
            return True
        except Exception as e:
            logger.error(f"Error saving template: {str(e)}")
            return False
    
    def load_template(self, name: str) -> Optional[Template]:
        """
        Load a template by name
        Returns the template if found, None otherwise
        """
        try:
            safe_name = self._safe_filename(name)
            filename = f"{safe_name}.json"
            filepath = os.path.join(self.templates_dir, filename)
            
            if not os.path.exists(filepath):
                logger.warning(f"Template file not found: {filepath}")
                return None
                
            with open(filepath, 'r') as f:
                data = json.load(f)
                template = Template(**data)
                
            logger.info(f"Loaded template '{template.name}' from {filepath}")
            return template
        except Exception as e:
            logger.error(f"Error loading template: {str(e)}")
            return None
    
    def delete_template(self, name: str) -> bool:
        """
        Delete a template by name
        Returns True if successful, False otherwise
        """
        try:
            safe_name = self._safe_filename(name)
            filename = f"{safe_name}.json"
            filepath = os.path.join(self.templates_dir, filename)
            
            if not os.path.exists(filepath):
                logger.warning(f"Template file not found: {filepath}")
                return False
                
            os.remove(filepath)
            logger.info(f"Deleted template file: {filepath}")
            return True
        except Exception as e:
            logger.error(f"Error deleting template: {str(e)}")
            return False
    
    def list_templates(self) -> List[Dict[str, Any]]:
        """
        List all available templates with basic metadata
        Returns a list of template metadata
        """
        templates = []
        
        try:
            for filename in os.listdir(self.templates_dir):
                if filename.endswith('.json'):
                    filepath = os.path.join(self.templates_dir, filename)
                    try:
                        with open(filepath, 'r') as f:
                            data = json.load(f)
                            # Include only basic metadata
                            templates.append({
                                'name': data.get('name', 'Unnamed Template'),
                                'description': data.get('description', ''),
                                'created_at': data.get('created_at', ''),
                                'updated_at': data.get('updated_at', '')
                            })
                    except Exception as e:
                        logger.error(f"Error reading template file {filepath}: {str(e)}")
        except Exception as e:
            logger.error(f"Error listing templates: {str(e)}")
        
        return templates
    
    def _safe_filename(self, name: str) -> str:
        """
        Convert a template name to a safe filename
        """
        # Replace spaces with underscores and remove special characters
        safe_name = ''.join(c if c.isalnum() or c == '_' else '_' for c in name.replace(' ', '_'))
        return safe_name.lower()
