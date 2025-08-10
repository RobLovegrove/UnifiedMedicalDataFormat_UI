from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid

class Module(BaseModel):
    """Represents a module in the medical file format."""
    id: str
    name: str
    schema_id: str  # Reference to JSON schema
    data: Dict[str, Any]  # The actual data
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class MedicalFile(BaseModel):
    """Represents a complete medical file."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = None
    version: str = "1.0.0"
    modules: List[Module] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class ImportRequest(BaseModel):
    """Request model for importing files."""
    file_type: str  # "fhir", "dicom", "image", etc.
    schema_id: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class SchemaDefinition(BaseModel):
    """Represents a JSON schema definition."""
    id: str
    name: str
    description: Optional[str] = None
    schema: Dict[str, Any]
    version: str = "1.0.0"
    created_at: datetime = Field(default_factory=datetime.now) 