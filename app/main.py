from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Form
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import json
import os
from typing import List

from .models.medical_file import MedicalFile, Module
from .importers.umdf_importer import UMDFImporter
from .schemas.schema_manager import SchemaManager
# Removed old import - now using UMDFReader directly in the importer

app = FastAPI(title="Medical File Format UI", version="1.0.0")

print("=== DEBUG: FastAPI App Created ===")

# Mount static files for React app
app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize managers
schema_manager = SchemaManager()
umdf_importer = UMDFImporter()

# API Routes first
@app.post("/api/upload/umdf")
async def upload_umdf_file(
    file: UploadFile = File(...),
    password: str = Form("")  # Accept password from form data
):
    """Upload and process a UMDF file."""
    print("=== DEBUG: /api/upload/umdf route registered ===")
    print(f"=== DEBUG: Password provided: {'Yes' if password else 'No'}")
    
    try:
        if not file.filename.endswith('.umdf'):
            raise HTTPException(status_code=400, detail="Only .umdf files are supported")
        
        # Read file content
        file_content = await file.read()
        
        # Import the UMDF file with password
        result = umdf_importer.import_file(file_content, file.filename, password)
        
        return {
            "success": True,
            "file_name": file.filename,
            "file_size": len(file_content),
            "modules": result.get('modules', []),
            "module_count": result.get('module_count', 0),
            "encounters": result.get('encounters', []),
            "module_graph": result.get('module_graph', {})
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/module/{module_id}/data")
async def get_module_data(module_id: str):
    """Get data for a specific module using the C++ reader."""
    try:
        print(f"=== DEBUG: Getting data for module: {module_id}")
        
        # Get the module data using the C++ reader
        module_data = umdf_importer.reader.get_module_data(module_id)
        
        if module_data:
            return {
                "success": True,
                "data": module_data
            }
        else:
            return {
                "success": False,
                "error": f"Module {module_id} not found or no data available"
            }
            
    except Exception as e:
        print(f"=== DEBUG: Error getting module data: {e}")
        return {"success": False, "error": str(e)}

# Removed old write/read endpoints - now using UMDFReader directly in the importer

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

@app.get("/test")
async def test_route():
    """Test route to debug route registration."""
    return {"message": "Test route working"}

# Catch-all route for React app (must be last)
@app.get("/{full_path:path}")
async def serve_react_app(request: Request, full_path: str):
    """Serve the React app for all routes."""
    # Skip API routes
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API route not found")
    
    # Serve the React app
    return FileResponse("static/index.html")

print("=== DEBUG: All routes registered ===")
for route in app.routes:
    print(f"Route: {route.path} - Methods: {getattr(route, 'methods', 'N/A')}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 