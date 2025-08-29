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

@app.get("/api/module/{module_id}/data")
async def get_module_data(module_id: str):
    """Get data for a specific module."""
    try:
        print(f"=== DEBUG: Getting data for module {module_id}")
        
        # Call the C++ reader directly since we know the file is open
        # Bypass the Python wrapper's state checking
        module_data = umdf_importer.reader.reader.getModuleData(module_id)
        print(f"=== DEBUG: Module data type: {type(module_data)}")
        print(f"=== DEBUG: Module data: {module_data}")
        
        # Check if we have ExpectedModuleData wrapper
        if hasattr(module_data, 'has_value') and module_data.has_value():
            print(f"=== DEBUG: ExpectedModuleData has value, extracting...")
            actual_module_data = module_data.value()
            print(f"=== DEBUG: Actual module data type: {type(actual_module_data)}")
            print(f"=== DEBUG: Actual module data attributes: {dir(actual_module_data)}")
            
            # Extract data
            try:
                print(f"=== DEBUG: Calling get_data() method...")
                actual_data = actual_module_data.get_data()
                print(f"=== DEBUG: Data type: {type(actual_data)}")
                print(f"=== DEBUG: Data: {actual_data}")
                
                # Handle different data types
                if hasattr(actual_data, 'dump'):
                    # This has a dump method (likely C++ object)
                    data_content = actual_data.dump()
                elif isinstance(actual_data, list):
                    # Check if this is a list of ModuleData objects (image frames)
                    if actual_data and hasattr(actual_data[0], 'get_data'):
                        print(f"=== DEBUG: Detected image module with {len(actual_data)} frames")
                        # This is an image module with multiple frames
                        # Extract actual pixel data from each frame
                        frames_data = []
                        for i, frame in enumerate(actual_data):
                            try:
                                # Each frame is a ModuleData object, extract its data
                                frame_data = frame.get_data()
                                frame_metadata = frame.get_metadata()
                                
                                # Store frame information
                                frame_info = {
                                    "frame_index": i,
                                    "data": frame_data.hex() if frame_data else None,  # Convert bytes to hex string
                                    "data_size": len(frame_data) if frame_data else 0,
                                    "metadata": frame_metadata if frame_metadata else None
                                }
                                frames_data.append(frame_info)
                                
                                if i < 3:  # Log first few frames for debugging
                                    print(f"=== DEBUG: Frame {i} data type: {type(frame_data)}")
                                    print(f"=== DEBUG: Frame {i} metadata type: {type(frame_metadata)}")
                                    
                            except Exception as frame_error:
                                print(f"=== DEBUG: Error extracting frame {i}: {frame_error}")
                                frames_data.append({
                                    "frame_index": i,
                                    "error": str(frame_error)
                                })
                        
                        data_content = {
                            "type": "image",
                            "frame_count": len(actual_data),
                            "frames": len(actual_data),
                            "message": f"Image module with {len(actual_data)} frames loaded successfully",
                            "frame_data": frames_data
                        }
                        
                        # For image modules, also extract the rich metadata structure
                        if hasattr(actual_module_data, 'get_metadata'):
                            try:
                                image_metadata = actual_module_data.get_metadata()
                                if hasattr(image_metadata, 'dump'):
                                    image_metadata_content = image_metadata.dump()
                                elif isinstance(image_metadata, list) and len(image_metadata) > 0:
                                    image_metadata_content = image_metadata[0]  # Get the first metadata item
                                else:
                                    image_metadata_content = image_metadata
                                
                                # Add image-specific metadata to data_content
                                data_content["image_metadata"] = image_metadata_content
                                print(f"=== DEBUG: Added image metadata to data_content")
                            except Exception as meta_error:
                                print(f"=== DEBUG: Error extracting image metadata: {meta_error}")
                                data_content["image_metadata"] = None
                    else:
                        # This is a list (likely tabular data)
                        data_content = {
                            "type": "tabular",
                            "record_count": len(actual_data),
                            "data": actual_data,  # Keep as Python objects
                            "sample_data": actual_data[0] if actual_data else None
                        }
                else:
                    # Generic data - handle lists and other types
                    try:
                        if isinstance(actual_data, list):
                            # Check if this is a list of ModuleData objects (image frames)
                            if actual_data and hasattr(actual_data[0], 'get_data'):
                                print(f"=== DEBUG: Detected image module with {len(actual_data)} frames")
                                # This is an image module with multiple frames
                                data_content = {
                                    "type": "image",
                                    "frame_count": len(actual_data),
                                    "frames": len(actual_data),
                                    "message": f"Image module with {len(actual_data)} frames loaded successfully"
                                }
                            else:
                                # This is a list (likely tabular data)
                                data_content = {
                                    "type": "tabular",
                                    "record_count": len(actual_data),
                                    "data": actual_data,  # Keep as Python objects
                                    "sample_data": actual_data[0] if actual_data else None
                                }
                        else:
                            # Other types
                            data_content = {
                                "type": "unknown",
                                "raw_data": str(actual_data)
                            }
                    except Exception as parse_error:
                        print(f"=== DEBUG: Error in data type detection: {parse_error}")
                        data_content = {
                            "type": "error",
                            "raw_data": str(actual_data),
                            "parse_error": str(parse_error)
                        }
            except Exception as data_error:
                print(f"=== DEBUG: Error extracting data: {data_error}")
                data_content = {"error": f"Data extraction failed: {data_error}"}
            
            # Extract metadata
            try:
                print(f"=== DEBUG: Calling get_metadata() method...")
                metadata = actual_module_data.get_metadata()
                print(f"=== DEBUG: Metadata type: {type(metadata)}")
                print(f"=== DEBUG: Metadata: {metadata}")
                
                # Handle metadata properly based on its type
                try:
                    if hasattr(metadata, 'dump'):
                        metadata_content = metadata.dump()
                    elif isinstance(metadata, list):
                        metadata_content = {
                            "items": len(metadata),
                            "type": "list",
                            "content": metadata  # Include actual metadata
                        }
                    else:
                        # For image modules, metadata might be a single object with rich info
                        if hasattr(metadata, '__dict__'):
                            # Convert to dict if possible
                            try:
                                metadata_content = metadata.__dict__
                            except:
                                metadata_content = str(metadata)
                        else:
                            metadata_content = str(metadata)
                except Exception as meta_error:
                    print(f"=== DEBUG: Error extracting metadata: {meta_error}")
                    metadata_content = {"error": f"Metadata extraction failed: {meta_error}"}
            except Exception as meta_error:
                print(f"=== DEBUG: Error extracting metadata: {meta_error}")
                metadata_content = {"error": f"Metadata extraction failed: {meta_error}"}
        else:
            print(f"=== DEBUG: ExpectedModuleData has no value")
            data_content = {"error": "No module data available"}
            metadata_content = {"error": "No metadata available"}
        
        return {
            "success": True,
            "metadata": metadata_content,  # Just the actual metadata
            "data": data_content           # Just the actual data
        }
        
    except Exception as e:
        print(f"=== DEBUG: Error in get_module_data: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": True,
            "metadata": {"error": "Metadata extraction failed in fallback"},
            "data": {"type": "error", "message": f"Data extraction failed: {e}"}
        }

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