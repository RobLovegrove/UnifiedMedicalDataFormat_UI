from fastapi import FastAPI, Request, UploadFile, File, Form
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
import json
import os
from typing import List, Optional

from .models.medical_file import MedicalFile, Module
from .importers.file_importer import FileImporter
from .schemas.schema_manager import SchemaManager
from cpp_interface.umdf_interface import umdf_interface

app = FastAPI(title="Medical File Format UI", version="1.0.0")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="app/templates")

# Initialize managers
schema_manager = SchemaManager()
file_importer = FileImporter()

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Main page for the medical file format UI."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/view/{file_id}")
async def view_file(request: Request, file_id: str):
    """View a medical file by ID."""
    # TODO: Load file using C++ reader
    # For now, return a placeholder
    return templates.TemplateResponse("view.html", {
        "request": request,
        "file_id": file_id,
        "modules": []
    })

@app.get("/import")
async def import_page(request: Request):
    """Import page for adding new files."""
    return templates.TemplateResponse("import.html", {"request": request})

@app.post("/import/file")
async def import_file(
    file: UploadFile = File(...),
    file_type: str = Form(...),
    schema_id: Optional[str] = Form(None)
):
    """Import a file (FHIR, DICOM, image, etc.) into the medical format."""
    try:
        # Read file content
        content = await file.read()
        
        # Import based on file type
        result = await file_importer.import_file(
            content=content,
            filename=file.filename,
            file_type=file_type,
            schema_id=schema_id
        )
        
        return {"success": True, "message": f"File imported successfully", "data": result}
    
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.post("/import/dicom-folder")
async def import_dicom_folder(
    folder_path: str = Form(...),
    schema_id: Optional[str] = Form(None)
):
    """Import a folder of DICOM files as a 3D volume."""
    try:
        # Import DICOM folder
        result = await file_importer.import_dicom_folder(
            folder_path=folder_path,
            schema_id=schema_id
        )
        
        return {"success": True, "message": f"DICOM folder imported successfully", "data": result}
    
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.post("/write/umdf")
async def write_umdf_file(
    modules: List[dict],
    output_path: str,
    access_mode: str = "fail_if_exists"
):
    """Write modules to a UMDF file using the C++ writer."""
    try:
        # Prepare data for C++ writer
        data = {
            "modules": modules,
            "metadata": {
                "created_by": "Medical File Format UI",
                "version": "1.0.0"
            }
        }
        
        # Write using C++ interface
        success = umdf_interface.write_file(data, output_path, access_mode)
        
        if success:
            return {"success": True, "message": f"UMDF file written to {output_path}"}
        else:
            return {"success": False, "message": "Failed to write UMDF file"}
            
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.get("/read/umdf/{file_path:path}")
async def read_umdf_file(file_path: str):
    """Read a UMDF file using the C++ reader."""
    try:
        # Read using C++ interface
        data = umdf_interface.read_file(file_path)
        
        if data:
            return {"success": True, "data": data}
        else:
            return {"success": False, "message": "Failed to read UMDF file"}
            
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.get("/api/schemas")
async def get_schemas():
    """Get available JSON schemas."""
    schemas = schema_manager.get_available_schemas()
    return {"schemas": schemas}

@app.get("/api/schema/{schema_id}")
async def get_schema(schema_id: str):
    """Get a specific JSON schema."""
    schema = schema_manager.get_schema(schema_id)
    if schema:
        return {"schema": schema}
    else:
        return {"error": "Schema not found"}

@app.get("/api/modules/{file_id}")
async def get_file_modules(file_id: str):
    """Get modules from a medical file."""
    # TODO: Use C++ reader to get modules
    # For now, return empty list
    return {"modules": []}

@app.get("/api/cpp/schemas")
async def get_cpp_schemas():
    """Get schemas supported by the C++ implementation."""
    schemas = umdf_interface.get_supported_schemas()
    return {"schemas": schemas}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 