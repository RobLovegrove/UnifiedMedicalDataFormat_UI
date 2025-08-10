from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import json
import os
from typing import List

from .models.medical_file import MedicalFile, Module
from .importers.umdf_importer import UMDFImporter
from .schemas.schema_manager import SchemaManager
from cpp_interface.umdf_interface import umdf_interface

app = FastAPI(title="Medical File Format UI", version="1.0.0")

print("=== DEBUG: FastAPI App Created ===")

# Mount static files for React app
app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize managers
schema_manager = SchemaManager()
umdf_importer = UMDFImporter()

# API Routes first
@app.post("/api/upload/umdf")
async def upload_umdf_file(file: UploadFile = File(...)):
    """Upload and process a UMDF file."""
    print("=== DEBUG: /api/upload/umdf route registered ===")
    try:
        if not file.filename.endswith('.umdf'):
            raise HTTPException(status_code=400, detail="Only .umdf files are supported")
        
        # Read file content
        file_content = await file.read()
        
        # Import the UMDF file
        result = umdf_importer.import_file(file_content, file.filename)
        
        return {
            "success": True,
            "file_name": file.filename,
            "file_size": len(file_content),
            "modules": result.get('modules', []),
            "module_count": len(result.get('modules', []))
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

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