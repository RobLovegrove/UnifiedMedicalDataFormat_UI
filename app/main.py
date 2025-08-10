from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
import json
import os
from typing import List, Optional

from .models.medical_file import MedicalFile, Module
from .importers.umdf_importer import UMDFImporter
from .schemas.schema_manager import SchemaManager
from cpp_interface.umdf_interface import umdf_interface

app = FastAPI(title="Medical File Format UI", version="1.0.0")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
templates = Jinja2Templates(directory="/Users/rob/Documents/CS/Dissertation/UMDF_UI/app/templates")

# Initialize managers
schema_manager = SchemaManager()
umdf_importer = UMDFImporter()

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

@app.get("/umdf-viewer")
async def umdf_viewer(request: Request):
    """UMDF viewer page."""
    # Get file path from query parameters
    file_path = request.query_params.get('file', '')
    file_name = request.query_params.get('name', '')
    file_size = request.query_params.get('size', '')
    
    file_info = {
        "file_path": file_path,
        "file_name": file_name,
        "file_size": file_size,
        "file_type": "UMDF",
        "module_count": 0,
        "modules": []
    }
    
    # If we have a file path, try to read it with the C++ module
    if file_path:
        try:
            # Import the UMDF file using the C++ module
            result = umdf_importer.import_file_from_path(file_path)
            if result and 'modules' in result:
                file_info['modules'] = result['modules']
                file_info['module_count'] = len(result['modules'])
                file_info['file_data'] = result
        except Exception as e:
            file_info['error'] = str(e)
            print(f"Error reading UMDF file: {e}")
    
    return templates.TemplateResponse("umdf_viewer.html", {
        "request": request,
        "file_info": file_info
    })

@app.post("/umdf-viewer")
async def umdf_viewer_upload(request: Request, file: UploadFile = File(...)):
    """Handle UMDF file upload directly in the viewer."""
    try:
        # Read file content
        file_content = await file.read()
        
        # Import the UMDF file
        result = umdf_importer.import_file(file_content, file.filename)
        
        # Return the result as JSON
        return result
        
    except Exception as e:
        return {"error": str(e)}

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