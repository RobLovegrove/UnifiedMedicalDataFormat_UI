import json
from typing import Dict, Any, Optional
from pathlib import Path


class SchemaManager:
    """Manages JSON schema definitions for the medical file format."""
    
    def __init__(self):
        self.schemas = self._load_default_schemas()
    
    def _load_default_schemas(self) -> Dict[str, Dict[str, Any]]:
        """Load default schema definitions."""
        return {
            "patient": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "string"},
                    "name": {"type": "string"},
                    "date_of_birth": {"type": "string", "format": "date"},
                    "sex": {"type": "string", "enum": ["M", "F", "O"]},
                    "age": {"type": "integer"},
                    "height": {"type": "number"},
                    "weight": {"type": "number"}
                },
                "required": ["patient_id", "name"]
            },
            "imaging": {
                "type": "object",
                "properties": {
                    "modality": {"type": "string"},
                    "study_date": {"type": "string", "format": "date"},
                    "series_description": {"type": "string"},
                    "image_data": {"type": "string", "description": "Base64 encoded image"},
                    "window_center": {"type": "number"},
                    "window_width": {"type": "number"},
                    "rescale_intercept": {"type": "number"},
                    "rescale_slope": {"type": "number"},
                    "pixel_spacing": {"type": "array", "items": {"type": "number"}},
                    "slice_thickness": {"type": "number"},
                    "rows": {"type": "integer"},
                    "columns": {"type": "integer"},
                    "bits_allocated": {"type": "integer"},
                    "photometric_interpretation": {"type": "string"},
                    "transfer_syntax": {"type": "string"},
                    "dicom_tags": {"type": "object", "description": "All DICOM tags as key-value pairs"}
                },
                "required": ["modality"]
            },
            "lab_results": {
                "type": "object",
                "properties": {
                    "test_name": {"type": "string"},
                    "test_date": {"type": "string", "format": "date"},
                    "value": {"type": "number"},
                    "unit": {"type": "string"},
                    "reference_range": {"type": "string"},
                    "status": {"type": "string", "enum": ["normal", "high", "low", "critical"]}
                },
                "required": ["test_name", "value", "unit"]
            },
            "medication": {
                "type": "object",
                "properties": {
                    "medication_name": {"type": "string"},
                    "dosage": {"type": "string"},
                    "frequency": {"type": "string"},
                    "start_date": {"type": "string", "format": "date"},
                    "end_date": {"type": "string", "format": "date"},
                    "prescribing_physician": {"type": "string"}
                },
                "required": ["medication_name", "dosage"]
            }
        }
    
    def get_schema(self, schema_name: str) -> Optional[Dict[str, Any]]:
        """Get a schema by name."""
        return self.schemas.get(schema_name)
    
    def get_all_schemas(self) -> Dict[str, Dict[str, Any]]:
        """Get all available schemas."""
        return self.schemas.copy()
    
    def add_schema(self, name: str, schema: Dict[str, Any]) -> None:
        """Add a new schema."""
        self.schemas[name] = schema
    
    def validate_data(self, schema_name: str, data: Dict[str, Any]) -> bool:
        """Basic validation of data against schema."""
        schema = self.get_schema(schema_name)
        if not schema:
            return False
        
        # Basic validation - in a real implementation, you'd use a proper JSON schema validator
        required_fields = schema.get("required", [])
        for field in required_fields:
            if field not in data:
                return False
        
        return True 