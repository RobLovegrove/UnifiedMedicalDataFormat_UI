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
from cpp_interface.umdf_interface import UMDFWriter
# Removed old import - now using UMDFReader directly in the importer

app = FastAPI(title="Medical File Format UI", version="1.0.0")

print("=== DEBUG: FastAPI App Created ===")

# Mount static files for React app
app.mount("/static", StaticFiles(directory="static"), name="static")

# Initialize managers
schema_manager = SchemaManager()
umdf_importer = UMDFImporter()
umdf_writer = UMDFWriter()

# Store user credentials (simple in-memory storage for prototype)
stored_credentials = {
    "username": None,
    "password": None
}

# API Routes first
@app.post("/api/store-credentials")
async def store_credentials(username: str = Form(...), password: str = Form(...)):
    """Store user credentials for use in subsequent operations."""
    global stored_credentials
    
    # Validate inputs
    if not username or not username.strip():
        return {"success": False, "error": "Username cannot be empty"}
    
    if not password or not password.strip():
        return {"success": False, "error": "Password cannot be empty"}
    
    stored_credentials["username"] = username.strip()
    stored_credentials["password"] = password.strip()
    print(f"=== DEBUG: Stored credentials for user: {username} ===")
    print(f"=== DEBUG: Password length: {len(password)}")
    print(f"=== DEBUG: Password starts with: {password[:3] if len(password) >= 3 else 'N/A'}...")
    print(f"=== DEBUG: Stored credentials state: {stored_credentials}")
    return {"success": True, "message": "Credentials stored successfully"}

@app.post("/api/logout")
async def logout():
    """Clear stored user credentials."""
    global stored_credentials
    stored_credentials["username"] = None
    stored_credentials["password"] = None
    print("=== DEBUG: Cleared stored credentials ===")
    return {"success": True, "message": "Logged out successfully"}

@app.get("/api/debug/credentials")
async def debug_credentials():
    """Debug endpoint to check stored credentials (for development only)."""
    return {
        "username": stored_credentials["username"],
        "password_length": len(stored_credentials["password"]) if stored_credentials["password"] else 0,
        "password_starts_with": stored_credentials["password"][:3] if stored_credentials["password"] and len(stored_credentials["password"]) >= 3 else "N/A",
        "has_password": bool(stored_credentials["password"])
    }

@app.get("/schemas/{schema_path:path}")
async def get_schema_file(schema_path: str):
    """Serve schema files dynamically from the local schemas folder."""
    try:
        import os
        from pathlib import Path
        
        # Construct the full path to the schema file
        schemas_dir = Path(__file__).parent.parent / "schemas"
        schema_file_path = schemas_dir / schema_path
        
        # Security check: ensure the path is within the schemas directory
        try:
            schema_file_path.resolve().relative_to(schemas_dir.resolve())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid schema path")
        
        # Check if file exists
        if not schema_file_path.exists():
            raise HTTPException(status_code=404, detail=f"Schema file not found: {schema_path}")
        
        # Read and return the schema file
        with open(schema_file_path, 'r', encoding='utf-8') as f:
            schema_content = f.read()
        
        print(f"=== DEBUG: Served schema file: {schema_path} ===")
        return {"content": schema_content, "path": schema_path}
        
    except Exception as e:
        print(f"=== DEBUG: Error serving schema {schema_path}: {e} ===")
        raise HTTPException(status_code=500, detail=f"Error reading schema file: {str(e)}")

@app.get("/api/schemas")
async def discover_schemas():
    """Discover available schemas in the local schemas folder."""
    try:
        import os
        from pathlib import Path
        
        schemas_dir = Path(__file__).parent.parent / "schemas"
        schemas = []
        
        # Scan the schemas directory for JSON files
        for schema_file in schemas_dir.rglob("*.json"):
            if schema_file.is_file():
                # Get relative path from schemas directory
                relative_path = schema_file.relative_to(schemas_dir)
                schema_path = f"./schemas/{relative_path}"
                
                # Read schema to get title and description
                try:
                    with open(schema_file, 'r', encoding='utf-8') as f:
                        schema_data = json.loads(f.read())
                    
                    schemas.append({
                        "path": str(schema_path),
                        "title": schema_data.get("title", f"{relative_path.stem} Module"),
                        "description": schema_data.get("description", "No description available"),
                        "type": schema_data.get("module_type", "unknown"),
                        "version": relative_path.parent.name if relative_path.parent.name != "schemas" else "v1.0"
                    })
                except Exception as e:
                    print(f"=== DEBUG: Error reading schema {schema_file}: {e} ===")
                    # Add basic info even if we can't read the full schema
                    schemas.append({
                        "path": str(schema_path),
                        "title": f"{relative_path.stem} Module",
                        "description": "Schema file (could not read details)",
                        "type": "unknown",
                        "version": relative_path.parent.name if relative_path.parent.name != "schemas" else "v1.0"
                    })
        
        print(f"=== DEBUG: Discovered {len(schemas)} schemas ===")
        return {"schemas": schemas}
        
    except Exception as e:
        print(f"=== DEBUG: Error discovering schemas: {e} ===")
        raise HTTPException(status_code=500, detail=f"Error discovering schemas: {str(e)}")

@app.post("/api/upload/umdf")
async def upload_umdf_file(
    file: UploadFile = File(...)
):
    """Upload and process a UMDF file."""
    print("=== DEBUG: /api/upload/umdf route registered ===")
    
    try:
        if not file.filename.endswith('.umdf'):
            raise HTTPException(status_code=400, detail="Only .umdf files are supported")
        
        # Check if we have stored credentials
        if not stored_credentials["password"]:
            return {"success": False, "error": "No credentials stored. Please log in first."}
        
        print(f"=== DEBUG: Using stored credentials for user: {stored_credentials['username']}")
        print(f"=== DEBUG: Password length: {len(stored_credentials['password'])}")
        print(f"=== DEBUG: Password starts with: {stored_credentials['password'][:3]}...")
        
        # Read file content
        file_content = await file.read()
        print(f"=== DEBUG: File content size: {len(file_content)} bytes")
        
        # Import the UMDF file with stored password
        print(f"=== DEBUG: Calling umdf_importer.import_file with password length: {len(stored_credentials['password'])}")
        result = umdf_importer.import_file(file_content, file.filename, stored_credentials["password"])
        
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

@app.post("/api/close")
async def close_file():
    """Close the currently open UMDF file."""
    try:
        print("=== DEBUG: Closing UMDF file ===")
        
        # Check if we have a UMDF importer with an open file
        if hasattr(umdf_importer, 'reader') and umdf_importer.reader:
            try:
                # Close the file using the C++ reader
                result = umdf_importer.reader.reader.closeFile()
                if result.success:
                    print("=== DEBUG: File closed successfully ===")
                    

                    
                    return {"success": True, "message": "File closed successfully"}
                else:
                    print(f"=== DEBUG: Failed to close file: {result.message} ===")
                    return {"success": False, "message": f"Failed to close file: {result.message}"}
            except Exception as close_error:
                print(f"=== DEBUG: Error during file close: {close_error} ===")
                return {"success": False, "message": f"Error closing file: {close_error}"}
        else:
            print("=== DEBUG: No UMDF reader available ===")
            return {"success": True, "message": "No file was open"}
            
    except Exception as e:
        print(f"=== DEBUG: Unexpected error in close_file: {e} ===")
        return {"success": False, "message": f"Unexpected error: {e}"}

@app.post("/api/edit")
async def edit_file(file_path: str = Form(...)):
    """Switch from reader mode to writer mode for the current file."""
    try:
        print(f"=== DEBUG: Switching to edit mode for file: {file_path} ===")
        
        # Check if we have stored credentials
        if not stored_credentials["password"]:
            return {"success": False, "message": "No credentials stored. Please log in first."}
        
        # For a local prototype, we'll use the file path constructed from the filename
        # and the known UMDF projects directory
        
        # Keep the reader open for reading module data while in edit mode
        # We'll open the writer alongside the reader
        print("=== DEBUG: Keeping reader open for module data access ===")
        
        # Now open the file with the writer using the file path from frontend
        try:
            username = stored_credentials["username"] or "current_user"
            
            print(f"=== DEBUG: Opening file with writer: {file_path}, user: {username} ===")
            print(f"=== DEBUG: Writer object before open: {umdf_writer}")
            print(f"=== DEBUG: Writer current_file before open: {getattr(umdf_writer, 'current_file', 'NOT_SET')}")
            
            result = umdf_writer.open_file(file_path, username, stored_credentials["password"])
            
            print(f"=== DEBUG: open_file result: {result}")
            print(f"=== DEBUG: Writer current_file after open: {getattr(umdf_writer, 'current_file', 'NOT_SET')}")
            
            if result:
                print("=== DEBUG: File opened successfully with writer ===")
                return {"success": True, "message": "File opened in edit mode"}
            else:
                print("=== DEBUG: Failed to open file with writer ===")
                return {"success": False, "message": "Failed to open file with writer"}
                
        except Exception as writer_error:
            print(f"=== DEBUG: Error opening file with writer: {writer_error} ===")
            return {"success": False, "message": f"Error opening file with writer: {writer_error}"}
            
    except Exception as e:
        print(f"=== DEBUG: Unexpected error in edit_file: {e} ===")
        return {"success": False, "message": f"Unexpected error: {e}"}

@app.post("/api/cancel-edit")
async def cancel_edit(password: str = Form("")):
    """Cancel edit mode and close the writer, then reopen with reader."""
    try:
        print("=== DEBUG: Canceling edit mode ===")
        
        # Get the current file path from the writer before closing it
        current_file = getattr(umdf_writer, 'current_file', None)
        print(f"=== DEBUG: Current file in writer: {current_file}")
        
        # Call the writer's cancel and close method
        try:
            result = umdf_writer.cancel_and_close()
            if result:
                print("=== DEBUG: Successfully canceled edit mode and closed writer ===")
                
                # Now reopen the file with the reader
                if current_file:
                    print(f"=== DEBUG: Reopening file with reader: {current_file}")
                    try:
                        # Use the password from the frontend
                        print(f"=== DEBUG: Using password for reopening: {'Yes' if password else 'No'}")
                        
                        # Import the file again to reopen with reader
                        result = umdf_importer.import_file_from_path(current_file, password)
                        if result:
                            print("=== DEBUG: Successfully reopened file with reader ===")
                            return {"success": True, "message": "Edit mode canceled and file reopened for viewing"}
                        else:
                            print("=== DEBUG: Failed to reopen file with reader ===")
                            return {"success": True, "message": "Edit mode canceled, but failed to reopen file for viewing"}
                    except Exception as reopen_error:
                        print(f"=== DEBUG: Error reopening file with reader: {reopen_error} ===")
                        return {"success": True, "message": "Edit mode canceled, but failed to reopen file for viewing"}
                else:
                    print("=== DEBUG: No current file to reopen ===")
                    return {"success": True, "message": "Edit mode canceled successfully"}
            else:
                print("=== DEBUG: Failed to cancel edit mode ===")
                return {"success": False, "message": "Failed to cancel edit mode"}
                
        except Exception as cancel_error:
            print(f"=== DEBUG: Error canceling edit mode: {cancel_error} ===")
            return {"success": False, "message": f"Error canceling edit mode: {cancel_error}"}
            
    except Exception as e:
        print(f"=== DEBUG: Unexpected error in cancel_edit: {e} ===")
        return {"success": False, "message": f"Unexpected error: {e}"}

@app.post("/api/add-encounter")
async def add_encounter():
    """Add a new encounter using the writer."""
    try:
        print("=== DEBUG: Adding new encounter ===")
        
        # Debug: Check writer state
        print(f"=== DEBUG: Writer object: {umdf_writer}")
        print(f"=== DEBUG: Writer has current_file attribute: {hasattr(umdf_writer, 'current_file')}")
        print(f"=== DEBUG: Writer current_file value: {getattr(umdf_writer, 'current_file', 'NOT_SET')}")
        print(f"=== DEBUG: Writer object attributes: {dir(umdf_writer)}")
        
        # Check if we're in edit mode (writer is open)
        if not hasattr(umdf_writer, 'current_file') or not umdf_writer.current_file:
            print("=== DEBUG: Writer not in edit mode - current_file is not set")
            return {"success": False, "message": "Not in edit mode. Please enter edit mode first."}
        
        print("=== DEBUG: Writer is in edit mode, proceeding with encounter creation")
        
        # Call the writer's createNewEncounter method
        try:
            encounter_id = umdf_writer.create_new_encounter()
            
            if encounter_id:
                print(f"=== DEBUG: Successfully created new encounter: {encounter_id} ===")
                return {
                    "success": True, 
                    "message": "New encounter created successfully",
                    "encounter_id": encounter_id
                }
            else:
                print("=== DEBUG: Failed to create new encounter ===")
                return {"success": False, "message": "Failed to create new encounter"}
                
        except Exception as encounter_error:
            print(f"=== DEBUG: Error creating encounter: {encounter_error} ===")
            return {"success": False, "message": f"Error creating encounter: {encounter_error}"}
            
    except Exception as e:
        print(f"=== DEBUG: Unexpected error in add_encounter: {e} ===")
        return {"success": False, "message": f"Unexpected error: {e}"}

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
async def get_module_data(module_id: str, password: str = ""):
    """Get data for a specific module."""
    try:
        print(f"=== DEBUG: Getting data for module {module_id}")
        
        # Check if we're in edit mode (writer is open) or view mode (reader is open)
        if hasattr(umdf_writer, 'current_file') and umdf_writer.current_file:
            # We're in edit mode - use the writer's internal reader
            print(f"=== DEBUG: In edit mode, using writer's internal reader for module: {module_id}")
            try:
                # The writer should have its own internal reader for accessing module data
                # We need to check what methods are available on the writer
                print(f"=== DEBUG: Writer object: {umdf_writer}")
                print(f"=== DEBUG: Writer methods: {dir(umdf_writer.writer)}")
                
                # Try to get module data through the writer
                if hasattr(umdf_writer.writer, 'getModuleData'):
                    module_data = umdf_writer.writer.getModuleData(module_id)
                    print(f"=== DEBUG: Got module data through writer: {type(module_data)}")
                else:
                    # Fallback: try to reopen the file with the reader temporarily
                    print(f"=== DEBUG: Writer doesn't have getModuleData, reopening with reader temporarily")
                    # Store current writer state
                    current_writer_file = umdf_writer.current_file
                    
                    # Temporarily reopen with reader using the password parameter
                    print(f"=== DEBUG: Temporarily reopening file with password for module data access")
                    temp_result = umdf_importer.import_file_from_path(current_writer_file, password)
                    if temp_result:
                        module_data = umdf_importer.reader.reader.getModuleData(module_id)
                        print(f"=== DEBUG: Got module data through temporary reader: {type(module_data)}")
                    else:
                        raise Exception("Failed to temporarily reopen file with reader")
                        
            except Exception as writer_error:
                print(f"=== DEBUG: Error getting module data through writer: {writer_error}")
                # Fallback to the original reader approach
                if hasattr(umdf_importer, 'reader') and umdf_importer.reader:
                    module_data = umdf_importer.reader.reader.getModuleData(module_id)
                    print(f"=== DEBUG: Fallback to reader: {type(module_data)}")
                else:
                    raise writer_error
        else:
            # We're in view mode - use the regular reader
            print(f"=== DEBUG: In view mode, using regular reader for module: {module_id}")
            if not hasattr(umdf_importer, 'reader') or not umdf_importer.reader:
                raise Exception("No reader available")
            
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
            error_msg = module_data.error() if hasattr(module_data, 'error') else "Unknown error"
            return {
                "success": False,
                "error": "decryption_failed",
                "message": error_msg,
                "metadata": {"error": error_msg},
                "data": {"error": error_msg}
            }
        
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
            "success": False,
            "error": "unexpected_error",
            "message": f"Unexpected error: {e}",
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
    # This endpoint is not currently implemented - return empty list
    # TODO: Implement schema support if needed
    return {"schemas": []}

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