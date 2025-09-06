from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Form
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import json
import os
import sys
from typing import List

from .models.medical_file import MedicalFile, Module
from .importers.umdf_importer import UMDFImporter
from .schemas.schema_manager import SchemaManager
from cpp_interface.umdf_interface import UMDFWriter
# Removed old import - now using UMDFReader directly in the importer

# Add DICOM converter to Python path
dicom_converter_path = Path(__file__).parent.parent.parent / "DICOM Reader"
if dicom_converter_path.exists():
    sys.path.append(str(dicom_converter_path))
    try:
        from dicom_converter import DICOMConverter
        DICOM_CONVERTER_AVAILABLE = True
        print(f"=== DEBUG: DICOM Converter loaded from: {dicom_converter_path} ===")
    except ImportError as e:
        DICOM_CONVERTER_AVAILABLE = False
        print(f"=== DEBUG: Failed to load DICOM Converter: {e} ===")
else:
    DICOM_CONVERTER_AVAILABLE = False
    print(f"=== DEBUG: DICOM Converter path not found: {dicom_converter_path} ===")

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
                                    print(f"=== DEBUG: Frame {i} data length: {len(frame_data) if frame_data else 0}")
                                    print(f"=== DEBUG: Frame {i} data first 20 bytes: {frame_data[:20] if frame_data else 'None'}")
                                    print(f"=== DEBUG: Frame {i} data last 20 bytes: {frame_data[-20:] if frame_data else 'None'}")
                                    print(f"=== DEBUG: Frame {i} hex string first 100 chars: {frame_data.hex()[:100] if frame_data else 'None'}")
                                    print(f"=== DEBUG: Frame {i} hex string last 100 chars: {frame_data.hex()[-100:] if frame_data else 'None'}")
                                    
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
        
        # Debug logging for image modules
        if isinstance(data_content, dict) and data_content.get("type") == "image":
            print(f"=== DEBUG: Returning image module data:")
            print(f"  frame_count: {data_content.get('frame_count')}")
            print(f"  frame_data length: {len(data_content.get('frame_data', []))}")
            print(f"  data_content keys: {list(data_content.keys())}")
            print(f"  metadata_content type: {type(metadata_content)}")
            print(f"  metadata_content: {metadata_content}")
            
            # Log detailed frame data information
            frame_data = data_content.get('frame_data', [])
            if frame_data and len(frame_data) > 0:
                first_frame = frame_data[0]
                print(f"=== DEBUG: First frame details:")
                print(f"  frame_index: {first_frame.get('frame_index')}")
                print(f"  data_size: {first_frame.get('data_size')}")
                print(f"  data type: {type(first_frame.get('data'))}")
                print(f"  data length: {len(first_frame.get('data')) if first_frame.get('data') else 0}")
                print(f"  data first 200 chars: {first_frame.get('data')[:200] if first_frame.get('data') else 'None'}")
                print(f"  data last 200 chars: {first_frame.get('data')[-200:] if first_frame.get('data') else 'None'}")
                print(f"  metadata: {first_frame.get('metadata')}")
        
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

@app.get("/api/check-auth")
async def check_auth():
    """Check if user is currently authenticated."""
    try:
        if stored_credentials["username"] and stored_credentials["password"]:
            return {
                "authenticated": True,
                "username": stored_credentials["username"]
            }
        else:
            return {
                "authenticated": False,
                "username": None
            }
    except Exception as e:
        print(f"=== DEBUG: Error checking auth: {e} ===")
        return {
            "authenticated": False,
            "username": None
        }

@app.post("/api/save-file")
async def save_file():
    """Save the current file and close the writer, then reopen with reader."""
    try:
        # Check authentication
        if not stored_credentials["username"] or not stored_credentials["password"]:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        print(f"=== DEBUG: Saving file with writer for user: {stored_credentials['username']}")
        
        # Get the current file path from the writer before closing it
        current_file_path = umdf_writer.current_file if hasattr(umdf_writer, 'current_file') else None
        print(f"=== DEBUG: Current file path before closing: {current_file_path}")
        
        # Close the file using the writer (this saves and finalizes the file)
        try:
            result = umdf_writer.close_file()
            print(f"=== DEBUG: Writer close_file result: {result}")
            
            if result:
                print(f"=== DEBUG: File saved successfully, writer closed")
                
                # Now reopen the file with the reader so modules can be accessed
                if current_file_path:
                    print(f"=== DEBUG: Reopening file with reader: {current_file_path}")
                    password = stored_credentials["password"]
                    
                    # Reopen the file with the reader
                    reopen_result = umdf_importer.import_file_from_path(current_file_path, password)
                    if reopen_result:
                        print(f"=== DEBUG: File reopened successfully with reader")
                    else:
                        print(f"=== DEBUG: Warning: Failed to reopen file with reader")
                
                return {
                    "success": True,
                    "message": "File saved successfully"
                }
            else:
                print(f"=== DEBUG: Failed to save file")
                raise HTTPException(status_code=500, detail="Failed to save file")
                
        except Exception as writer_error:
            print(f"=== DEBUG: Error in writer.close_file: {writer_error} ===")
            raise HTTPException(status_code=500, detail=f"Failed to save file: {writer_error}")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"=== DEBUG: Unexpected error in save_file: {e} ===")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")

@app.post("/api/create-module")
async def create_module(
    encounter_id: str = Form(...),
    schema_path: str = Form(...),
    module_data: str = Form(...)  # JSON string containing metadata and data
):
    """Create a new module and add it to an encounter."""
    try:
        # Check authentication
        if not stored_credentials["username"] or not stored_credentials["password"]:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Parse the module data JSON
        try:
            parsed_data = json.loads(module_data)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid module data JSON: {e}")
        
        # Extract metadata and data sections
        metadata = parsed_data.get("metadata", {})
        data = parsed_data.get("data", {})
        
        print(f"=== DEBUG: Creating module for encounter: {encounter_id} ===")
        print(f"=== DEBUG: Schema path: {schema_path} ===")
        print(f"=== DEBUG: Metadata: {metadata} ===")
        
        # Check if this is an image module that needs frame data processing
        is_image_module = "image" in schema_path.lower()
        print(f"=== DEBUG: Is image module: {is_image_module} ===")
        
        if is_image_module and "frames" in data:
            print(f"=== DEBUG: Processing image module with {len(data['frames'])} frames ===")
            
            # For image modules, we need to create ModuleData objects for each frame
            frame_module_data_list = []
            
            for i, frame in enumerate(data['frames']):
                print(f"=== DEBUG: Processing frame {i+1}/{len(data['frames'])} ===")
                
                # Extract frame metadata and pixel data
                # Show frame structure without pixel data to avoid log overflow
                frame_for_debug = {k: v for k, v in frame.items() if k != 'pixelData'}
                print(f"=== DEBUG: Complete frame {i+1} structure (without pixel data): {json.dumps(frame_for_debug, indent=2)} ===")
                print(f"=== DEBUG: Frame {i+1} keys: {list(frame.keys())} ===")
                
                # FIXED: The DICOM converter returns frames with a 'metadata' wrapper
                # Extract the inner metadata object to get the actual frame fields
                if 'metadata' in frame and isinstance(frame['metadata'], dict):
                    frame_metadata = frame['metadata']
                else:
                    # Fallback: extract all fields except pixelData
                    frame_metadata = {k: v for k, v in frame.items() if k != 'pixelData'}
                pixel_data = frame.get('pixelData', [])

                print(f"=== DEBUG: Frame {i+1} metadata keys: {list(frame_metadata.keys())} ===")
                print(f"=== DEBUG: Frame {i+1} metadata JSON dump: {json.dumps(frame_metadata, indent=2)} ===")
                print(f"=== DEBUG: Frame {i+1} pixel data length: {len(pixel_data) if pixel_data else 0} ===")
                
                # Create a ModuleData object for this frame
                try:
                    # Create frame ModuleData with metadata and pixel data
                    import umdf
                    frame_module_data = umdf.ModuleData()
                    
                    # Add this debugging right before set_metadata:
                    print(f"=== DEBUG: Frame {i+1} metadata BEFORE set_metadata:")
                    print(f"  Keys: {list(frame_metadata.keys())}")
                    print(f"  frameNumber present: {'frameNumber' in frame_metadata}")
                    print(f"  frameNumber value: {frame_metadata.get('frameNumber', 'MISSING')}")
                    print(f"  frameNumber type: {type(frame_metadata.get('frameNumber', 'MISSING'))}")
                    print(f"  Full metadata JSON: {json.dumps(frame_metadata, indent=2, default=str)}")

                    # Then set the metadata
                    frame_module_data.set_metadata(frame_metadata)

                    # And check what was actually set:
                    print(f"=== DEBUG: Frame {i+1} metadata AFTER set_metadata:")
                    try:
                        retrieved_metadata = frame_module_data.get_metadata()
                        print(f"  Retrieved metadata type: {type(retrieved_metadata)}")
                        if hasattr(retrieved_metadata, 'dump'):
                            retrieved_content = retrieved_metadata.dump()
                            print(f"  Retrieved metadata content: {retrieved_content}")
                        else:
                            print(f"  Retrieved metadata: {retrieved_metadata}")
                    except Exception as e:
                        print(f"  Error retrieving metadata: {e}")
                    
                    # Set the pixel data as binary data
                    if pixel_data:
                        # Flatten the 2D pixel array into 1D
                        flattened_pixels = []
                        for row in pixel_data:
                            flattened_pixels.extend(row)
                        
                        # Convert to bytes for binary data
                        import struct
                        pixel_bytes = struct.pack(f'<{len(flattened_pixels)}H', *flattened_pixels)
                        frame_module_data.set_binary_data(pixel_bytes)
                    
                    frame_module_data_list.append(frame_module_data)
                    print(f"=== DEBUG: Successfully created ModuleData for frame {i+1} ===")
                except Exception as frame_error:
                    print(f"=== DEBUG: Error creating ModuleData for frame {i+1}: {frame_error} ===")
                    raise HTTPException(status_code=500, detail=f"Failed to create frame {i+1}: {frame_error}")
            
            # Use the frame ModuleData objects as the data
            data = frame_module_data_list
            print(f"=== DEBUG: Created {len(data)} frame ModuleData objects ===")
        else:
            print(f"=== DEBUG: Not an image module or no frames found, using data as-is ===")
            print(f"=== DEBUG: Data type: {type(data)} ===")
            print(f"=== DEBUG: Data keys: {list(data.keys()) if isinstance(data, dict) else 'Not a dict'} ===")
        
        # Create ModuleData object using the writer
        try:
            # Get the username for the author field
            author = stored_credentials["username"]
            print(f"=== DEBUG: Using author: {author} ===")
            
            # Create the main ModuleData object for the image module
            import umdf
            main_module_data = umdf.ModuleData()
            
            # Set the image metadata
            # The writer expects a single metadata object, not an array
            main_module_data.set_metadata(metadata)
            
            # Set the frame data as nested data
            if isinstance(data, list) and data:
                main_module_data.set_nested_data(data)
                print(f"=== DEBUG: Set {len(data)} frame objects as nested data ===")
            
            # Convert encounter_id string to UUID object
            import umdf
            encounter_uuid = umdf.UUID.fromString(encounter_id)
            print(f"=== DEBUG: Converted encounter_id '{encounter_id}' to UUID: {encounter_uuid}")
            
            # Call the writer's addModuleToEncounter method on the raw C++ writer
            print(f"=== DEBUG: About to call addModuleToEncounter ===")
            print(f"=== DEBUG: encounter_uuid: {encounter_uuid} ===")
            print(f"=== DEBUG: schema_path: {schema_path} ===")
            print(f"=== DEBUG: main_module_data type: {type(main_module_data)} ===")
            print(f"=== DEBUG: main_module_data attributes: {[attr for attr in dir(main_module_data) if not attr.startswith('_')]} ===")
            
            result = umdf_writer.writer.addModuleToEncounter(encounter_uuid, schema_path, main_module_data)
            print(f"=== DEBUG: Module creation result: {result} ===")
            
            # Extract the UUID from the ExpectedUUID result
            print(f"=== DEBUG: Result type: {type(result)} ===")
            print(f"=== DEBUG: Result attributes: {[attr for attr in dir(result) if not attr.startswith('_')]} ===")
            
            # Extract the UUID from the ExpectedUUID result using the correct method
            module_uuid = "unknown"
            if result:
                try:
                    # Check if the ExpectedUUID has a value first
                    if result.has_value():
                        # Use the .value() method to get the actual UUID
                        uuid_obj = result.value()
                        # Convert the UUID object to string using .toString()
                        module_uuid = uuid_obj.toString()
                        print(f"=== DEBUG: Successfully extracted UUID using .value().toString(): {module_uuid} ===")
                    else:
                        print(f"=== DEBUG: ExpectedUUID has no value ===")
                        # Check if there's an error message
                        if hasattr(result, 'error') and callable(getattr(result, 'error')):
                            try:
                                error_msg = result.error()
                                print(f"=== DEBUG: ExpectedUUID error: {error_msg} ===")
                            except Exception as e:
                                print(f"=== DEBUG: Error calling result.error(): {e} ===")
                        module_uuid = "no_value"
                except Exception as e:
                    print(f"=== DEBUG: Error extracting UUID: {e} ===")
                    # Fallback to string representation
                    module_uuid = str(result)
                    print(f"=== DEBUG: Using fallback string representation: {module_uuid} ===")
            
            return {
                "success": True,
                "message": "Module created successfully",
                "module_id": module_uuid
            }
            
        except Exception as writer_error:
            print(f"=== DEBUG: Error in writer.add_module_to_encounter: {writer_error} ===")
            raise HTTPException(status_code=500, detail=f"Failed to create module: {writer_error}")
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"=== DEBUG: Unexpected error in create_module: {e} ===")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")

@app.post("/api/import-dicom")
async def import_dicom(
    folder_name: str = Form(...),
    encounter_id: str = Form(...)
):
    """Import DICOM folder and convert to UMDF format."""
    try:
        # Check authentication
        if not stored_credentials["username"] or not stored_credentials["password"]:
            raise HTTPException(status_code=401, detail="Not authenticated")
        
        # Check if DICOM converter is available
        if not DICOM_CONVERTER_AVAILABLE:
            raise HTTPException(status_code=500, detail="DICOM converter not available")
        
        print(f"=== DEBUG: Starting DICOM import for folder name: {folder_name} ===")
        print(f"=== DEBUG: Encounter ID: {encounter_id} ===")
        
        # Construct the full path by appending folder_name to the base path
        base_path = "/Users/rob/Documents/CS/Dissertation/UMDF_UI/test_images"
        full_folder_path = os.path.join(base_path, folder_name)
        
        print(f"=== DEBUG: Base path: '{base_path}' ===")
        print(f"=== DEBUG: Selected folder name: '{folder_name}' ===")
        print(f"=== DEBUG: Full folder path: '{full_folder_path}' ===")
        
        # Validate the path is within the allowed base directory
        if not os.path.commonpath([full_folder_path]).startswith(os.path.commonpath([base_path])):
            raise HTTPException(status_code=400, detail="Invalid folder path")
        
        # Check if the folder exists
        if not os.path.exists(full_folder_path):
            raise HTTPException(status_code=400, detail=f"Folder '{folder_name}' not found in base directory")
        
        # Initialize DICOM converter
        converter = DICOMConverter()
        
        # Convert the DICOM folder
        print("=== DEBUG: Converting DICOM folder... ===")
        print(f"=== DEBUG: About to call converter.convert_folder with: '{full_folder_path}' ===")
        umdf_data = converter.convert_folder(full_folder_path)
        
        print("=== DEBUG: Raw converter output structure ===")
        print(f"  Top level keys: {list(umdf_data.keys())}")
        if 'series' in umdf_data:
            first_series = umdf_data['series'][0]
            print(f"  First series keys: {list(first_series.keys())}")
            if 'data' in first_series:
                frames = first_series['data']['frames']
                if frames:
                    first_frame = frames[0]
                    print(f"  First frame keys: {list(first_frame.keys())}")
                    
                    # Show frame structure without pixel data to avoid log overflow
                    frame_for_debug = {k: v for k, v in first_frame.items() if k != 'pixelData'}
                    print(f"  First frame structure (without pixel data): {json.dumps(frame_for_debug, indent=2, default=str)}")
                    
                    # Show pixel data info separately
                    if 'pixelData' in first_frame:
                        pixel_data = first_frame['pixelData']
                        print(f"  Pixel data type: {type(pixel_data)}")
                        if isinstance(pixel_data, list):
                            print(f"  Pixel data: {len(pixel_data)} rows, first row has {len(pixel_data[0]) if pixel_data else 0} values")
                            if pixel_data and len(pixel_data) > 0:
                                print(f"  First row first 10 values: {pixel_data[0][:10] if pixel_data[0] else 'N/A'}")
                                print(f"  First row last 10 values: {pixel_data[0][-10:] if pixel_data[0] else 'N/A'}")
                                print(f"  Last row first 10 values: {pixel_data[-1][:10] if pixel_data[-1] else 'N/A'}")
                                print(f"  Last row last 10 values: {pixel_data[-1][-10:] if pixel_data[-1] else 'N/A'}")
                                print(f"  Min value in first row: {min(pixel_data[0]) if pixel_data[0] else 'N/A'}")
                                print(f"  Max value in first row: {max(pixel_data[0]) if pixel_data[0] else 'N/A'}")
                        else:
                            print(f"  Pixel data is not a list: {pixel_data}")
                    else:
                        print(f"  No pixelData found in first frame")
        
        print(f"=== DEBUG: DICOM conversion successful ===")
        print(f"=== DEBUG: Output structure: {list(umdf_data.keys()) if isinstance(umdf_data, dict) else 'Not a dict'} ===")
        
        if isinstance(umdf_data, dict) and 'series' in umdf_data:
            print(f"=== DEBUG: Number of series: {len(umdf_data['series'])} ===")
            if umdf_data['series']:
                first_series = umdf_data['series'][0]
                print(f"=== DEBUG: First series metadata keys: {list(first_series.get('metadata', {}).keys())} ===")
                print(f"=== DEBUG: First series data keys: {list(first_series.get('data', {}).keys())} ===")
        
        # Process the converted data directly and add it to the UMDF writer
        if isinstance(umdf_data, dict) and 'series' in umdf_data and umdf_data['series']:
            first_series = umdf_data['series'][0]
            
            # Extract the metadata and frames
            series_metadata = first_series.get('metadata', {})
            frames = first_series.get('data', {}).get('frames', [])
            
            if frames:
                print(f"=== DEBUG: Processing {len(frames)} frames directly to UMDF writer ===")
                
                # Create frame ModuleData objects
                frame_module_data_list = []
                for i, frame in enumerate(frames):
                    print(f"=== DEBUG: Processing frame {i+1}/{len(frames)} ===")
                    
                    # Extract frame metadata (all fields except pixelData)
                    frame_metadata = {k: v for k, v in frame.items() if k != 'pixelData'}
                    pixel_data = frame.get('pixelData', [])
                    
                    print(f"=== DEBUG: Frame {i+1} metadata: {list(frame_metadata.keys())} ===")
                    
                    try:
                        # Create frame ModuleData
                        import umdf
                        frame_module_data = umdf.ModuleData()
                        
                        # Set the frame metadata
                        frame_module_data.set_metadata(frame_metadata)
                        
                        # Set the pixel data as binary data
                        if pixel_data:
                            print(f"=== DEBUG: Frame {i+1} pixel data processing:")
                            print(f"  Pixel data type: {type(pixel_data)}")
                            print(f"  Pixel data length: {len(pixel_data) if isinstance(pixel_data, list) else 'N/A'}")
                            
                            if isinstance(pixel_data, list) and len(pixel_data) > 0:
                                print(f"  First row length: {len(pixel_data[0]) if pixel_data[0] else 0}")
                                print(f"  First row first 10 values: {pixel_data[0][:10] if pixel_data[0] else 'N/A'}")
                                print(f"  First row last 10 values: {pixel_data[0][-10:] if pixel_data[0] else 'N/A'}")
                                print(f"  Last row first 10 values: {pixel_data[-1][:10] if pixel_data[-1] else 'N/A'}")
                                print(f"  Last row last 10 values: {pixel_data[-1][-10:] if pixel_data[-1] else 'N/A'}")
                            
                            # Flatten the 2D pixel array into 1D
                            flattened_pixels = []
                            for row in pixel_data:
                                flattened_pixels.extend(row)
                            
                            print(f"  Flattened pixels length: {len(flattened_pixels)}")
                            print(f"  Flattened pixels first 20: {flattened_pixels[:20]}")
                            print(f"  Flattened pixels last 20: {flattened_pixels[-20:]}")
                            print(f"  Min pixel value: {min(flattened_pixels) if flattened_pixels else 'N/A'}")
                            print(f"  Max pixel value: {max(flattened_pixels) if flattened_pixels else 'N/A'}")
                            
                            # Convert to bytes for binary data
                            import struct
                            pixel_bytes = struct.pack(f'<{len(flattened_pixels)}H', *flattened_pixels)
                            print(f"  Pixel bytes length: {len(pixel_bytes)}")
                            print(f"  Pixel bytes first 40 chars (hex): {pixel_bytes[:20].hex()}")
                            print(f"  Pixel bytes last 40 chars (hex): {pixel_bytes[-20:].hex()}")
                            
                            frame_module_data.set_binary_data(pixel_bytes)
                            print(f"  Successfully set binary data for frame {i+1}")
                        else:
                            print(f"=== DEBUG: Frame {i+1} has no pixel data")
                        
                        frame_module_data_list.append(frame_module_data)
                        print(f"=== DEBUG: Successfully created ModuleData for frame {i+1} ===")
                    except Exception as frame_error:
                        print(f"=== DEBUG: Error creating ModuleData for frame {i+1}: {frame_error} ===")
                        raise HTTPException(status_code=500, detail=f"Failed to create frame {i+1}: {frame_error}")
                
                # Create the main ModuleData object
                import umdf
                main_module_data = umdf.ModuleData()
                
                # Set the image metadata
                main_module_data.set_metadata(series_metadata)
                
                # Set the frame data as nested data
                # This is how the UMDF reader expects to access image frame data
                if frame_module_data_list:
                    main_module_data.set_nested_data(frame_module_data_list)
                    print(f"=== DEBUG: Set {len(frame_module_data_list)} frame objects as nested data ===")
                
                # Add the module to the encounter
                try:
                    # Convert encounter_id string to UUID object
                    encounter_uuid = umdf.UUID.fromString(encounter_id)
                    print(f"=== DEBUG: Converted encounter_id '{encounter_id}' to UUID: {encounter_uuid} ===")
                    
                    # DEBUG: Analyze the pixel data being written
                    print(f"=== DEBUG: PIXEL DATA ANALYSIS BEFORE WRITING ===")
                    print(f"  Number of frames: {len(frame_module_data_list)}")
                    
                    for i, frame_data in enumerate(frame_module_data_list):
                        print(f"  Frame {i} analysis:")
                        print(f"    Type: {type(frame_data)}")
                        print(f"    Object: {frame_data}")
                        
                        # Try to access the binary data that was set
                        try:
                            # Check if we can access the binary data
                            print(f"    Frame {i} methods: {[m for m in dir(frame_data) if not m.startswith('_')]}")
                            
                            # This is a bit hacky but let's see what we can access
                            if hasattr(frame_data, '_pybind11_conduit_v1_'):
                                print(f"    Frame {i} has pybind11 conduit")
                            
                        except Exception as e:
                            print(f"    Frame {i} error accessing data: {e}")
                    
                    print(f"  Main module data object: {main_module_data}")
                    print(f"  Main module methods: {[m for m in dir(main_module_data) if not m.startswith('_')]}")
                    
                    # Call the writer's addModuleToEncounter method
                    print(f"=== DEBUG: About to call addModuleToEncounter ===")
                    result = umdf_writer.writer.addModuleToEncounter(encounter_uuid, './schemas/image/CT/v1.0.json', main_module_data)
                    print(f"=== DEBUG: Module creation result: {result} ===")
                    
                    # Extract the UUID from the ExpectedUUID result
                    if result and result.has_value():
                        uuid_obj = result.value()
                        module_uuid = uuid_obj.toString()
                        print(f"=== DEBUG: Successfully created module with UUID: {module_uuid} ===")
                        
                        return {
                            "success": True,
                            "message": "DICOM imported and module created successfully",
                            "module_id": module_uuid
                        }
                    else:
                        error_msg = result.error() if result else "Unknown error"
                        print(f"=== DEBUG: Failed to create module: {error_msg} ===")
                        raise HTTPException(status_code=500, detail=f"Failed to create module: {error_msg}")
                        
                except Exception as writer_error:
                    print(f"=== DEBUG: Error in writer.addModuleToEncounter: {writer_error} ===")
                    raise HTTPException(status_code=500, detail=f"Failed to create module: {writer_error}")
            else:
                raise HTTPException(status_code=500, detail="No frames found in converted DICOM data")
        else:
            raise HTTPException(status_code=500, detail="Invalid DICOM conversion output structure")
        
        # Fallback return (shouldn't reach here)
        return {
            "success": True,
            "message": "DICOM conversion successful",
            "data": umdf_data
        }
        
    except Exception as e:
        print(f"=== DEBUG: Error in DICOM import: {e} ===")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"DICOM import failed: {e}")

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