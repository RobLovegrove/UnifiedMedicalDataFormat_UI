import os
import json
import tempfile
from typing import Dict, Any, List, Optional
from datetime import datetime

# Add the project root to Python path to ensure cpp_interface is discoverable
import sys
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

def get_schema_title(schema_path: str, base_dir: str = None) -> str:
    """
    Read a schema JSON file and extract the title field.
    
    Args:
        schema_path: The schema path from the module (e.g., './schemas/image/v1.0.json')
        base_dir: Base directory to resolve relative paths (defaults to project root)
    
    Returns:
        The title from the schema, or a fallback name if schema can't be read
    """
    try:
        # Resolve the schema path
        if base_dir is None:
            base_dir = project_root
        
        # Handle relative paths starting with ./
        if schema_path.startswith('./'):
            schema_path = schema_path[2:]  # Remove ./
        
        # Construct full path
        full_path = os.path.join(base_dir, schema_path)
        
        print(f"🔍 DEBUG: Reading schema from: {full_path}")
        
        # Check if file exists
        if not os.path.exists(full_path):
            print(f"⚠️  Warning: Schema file not found: {full_path}")
            return "Unknown Schema"
        
        # Read and parse the JSON
        with open(full_path, 'r', encoding='utf-8') as f:
            schema_data = json.load(f)
        
        # Extract the title
        title = schema_data.get('title', 'Unknown Schema')
        print(f"✅ Successfully read schema title: {title}")
        return title
        
    except Exception as e:
        print(f"❌ Error reading schema {schema_path}: {e}")
        return "Unknown Schema"

try:
    from cpp_interface.umdf_interface import UMDFReader, read_umdf_file
    print("Successfully imported UMDF interface")
except ImportError as e:
    print(f"Warning: Could not import UMDF interface: {e}")
    UMDFReader = None
    read_umdf_file = None

class UMDFImporter:
    """Importer for UMDF files using the C++ reader."""
    
    def __init__(self):
        """Initialize the UMDF importer."""
        self.reader = UMDFReader() if UMDFReader else None
    
    def can_import(self) -> bool:
        """Check if UMDF import is available."""
        return self.reader is not None
    
    def import_file(self, file_content: bytes, filename: str, password: str = "") -> Dict[str, Any]:
        """Import a UMDF file and convert to internal module format."""
        if not self.can_import():
            raise ImportError("UMDF reader module not available")
        
        temp_file = None
        try:
            # Create temporary file with .umdf extension
            temp_file = tempfile.NamedTemporaryFile(mode='wb', suffix='.umdf', delete=False)
            temp_path = temp_file.name
            
            # Write file content
            temp_file.write(file_content)
            temp_file.close()
            
            print(f"Temporary file created: {temp_path}")
            print(f"File size: {len(file_content)} bytes")
            
            # Basic file validation - check if it's not empty and has some content
            if len(file_content) == 0:
                raise RuntimeError("File is empty")
            
            # Check if file starts with expected UMDF header (if known)
            # This is a basic check - you might need to adjust based on your file format
            if len(file_content) < 4:
                raise RuntimeError("File is too small to be a valid UMDF file")
            
            print(f"File validation passed - proceeding with UMDF reader")
            
            # Read the file using the UMDF reader
            print("Opening UMDF file with reader...")
            print(f"Temporary file path: {temp_path}")
            print(f"Temporary file exists: {os.path.exists(temp_path)}")
            print(f"Temporary file size: {os.path.getsize(temp_path) if os.path.exists(temp_path) else 'N/A'}")
            
            # Add file header inspection for debugging
            if os.path.exists(temp_path):
                try:
                    with open(temp_path, 'rb') as f:
                        header_bytes = f.read(64)  # Read first 64 bytes to inspect header
                        print(f"File header (first 64 bytes): {header_bytes.hex()}")
                        print(f"File header as string: {header_bytes.decode('utf-8', errors='ignore')}")
                except Exception as header_error:
                    print(f"Could not read file header: {header_error}")
            
            try:
                # Open the file using the C++ reader
                print("Opening UMDF file with reader.openFile...")
                
                # Use the password provided by the frontend
                result = self.reader.reader.openFile(temp_path, password)
                print(f"openFile result: {result}")
                print(f"openFile success: {result.success}")
                print(f"openFile message: {result.message}")
                
                if not result.success:
                    print(f"Failed to open UMDF file: {result.message}")
                    raise RuntimeError(f"Failed to open UMDF file: {result.message}")
                    
            except Exception as open_error:
                print(f"Exception during openFile: {open_error}")
                import traceback
                traceback.print_exc()
                raise RuntimeError(f"Exception during file open: {open_error}")
            
            # Get file information
            print("Getting file info...")
            file_info = self.reader.reader.getFileInfo()
            print(f"File info received: {type(file_info)}")
            print(f"File info content: {file_info}")
            
            # Debug: Check if schema_path is in the modules data
            if file_info and 'modules' in file_info:
                print("=== DEBUG: Checking modules for schema_path ===")
                for i, module in enumerate(file_info['modules']):
                    print(f"Module {i}: {module}")
                    if 'schema_path' in module:
                        print(f"  ✓ Module {i} has schema_path: {module['schema_path']}")
                    else:
                        print(f"  ✗ Module {i} missing schema_path")
                        print(f"    Available keys: {list(module.keys())}")
                print("=== END DEBUG ===")
            
            # Don't close the file yet - we need it open for getModuleData calls
            # self.reader.reader.closeFile()
            
            # Check if the file info indicates success
            if not file_info or not file_info.get('success', False):
                error_msg = file_info.get('error', 'Unknown error occurred') if file_info else 'No file info received'
                print(f"File processing failed: {error_msg}")
                raise RuntimeError(f"Failed to process UMDF file: {error_msg}")
            
            # Extract module information from the JSON response
            module_count = file_info.get('module_count', 0)
            modules_data = file_info.get('modules', [])
            module_graph = file_info.get('module_graph', {})
            encounters = module_graph.get('encounters', [])
            
            print(f"Successfully processed file with {module_count} modules and {len(encounters)} encounters")
            
            # Convert to internal format
            modules = []
            
            # Create module entries from the modules array
            for module_data in modules_data:
                print(f"=== DEBUG: Processing module_data ===")
                print(f"  module_data: {module_data}")
                print(f"  Available keys: {list(module_data.keys())}")
                print(f"  schema_path value: {module_data.get('schema_path', 'NOT_FOUND')}")
                
                # Get the schema title for a meaningful module name
                schema_path = module_data.get('schema_path', 'unknown')
                if schema_path != 'unknown':
                    schema_title = get_schema_title(schema_path)
                    module_name = f"{schema_title.title()} Module"
                else:
                    module_name = f"UMDF_Module_{module_data.get('type', 'unknown')}"
                
                print(f"  Schema title: {schema_title if schema_path != 'unknown' else 'N/A'}")
                print(f"  Final module name: {module_name}")
                
                module = {
                    "id": module_data.get('uuid', 'unknown'),
                    "name": module_name,
                    "schema_id": module_data.get('schema_id', 'unknown'),
                    "schema_path": schema_path,  # New field for schema path
                    "type": module_data.get('type', 'unknown'),
                    "schema_url": "unknown",
                    "metadata": {"uuid": module_data.get('uuid', 'unknown')},
                    "data": {},
                    "created_at": datetime.now().isoformat(),
                    "source_file": filename
                }
                print(f"  Created module: {module}")
                modules.append(module)
            
            result = {
                "file_type": "umdf",
                "file_path": filename,
                "modules": modules,
                "file_info": file_info,
                "module_count": module_count,
                "encounters": encounters,
                "module_graph": module_graph
            }
            
            print("=== DEBUG: Final result being returned ===")
            print(f"  modules count: {len(modules)}")
            for i, module in enumerate(modules):
                print(f"  Module {i} schema_path: {module.get('schema_path', 'NOT_FOUND')}")
            print("=== END DEBUG ===")
            
            return result
            
        except Exception as e:
            print(f"Error in import_file: {e}")
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"Failed to import UMDF file: {e}")
            
        finally:
            # Clean up temporary file
            if temp_file and os.path.exists(temp_path):
                try:
                    os.unlink(temp_path)
                    print(f"Temporary file cleaned up: {temp_path}")
                except Exception as cleanup_error:
                    print(f"Warning: Failed to clean up temporary file {temp_path}: {cleanup_error}")
    
    def import_file_from_path(self, file_path: str) -> Dict[str, Any]:
        """Import a UMDF file from a file path."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        with open(file_path, 'rb') as f:
            file_content = f.read()
        
        return self.import_file(file_content, os.path.basename(file_path))
    
    def close_file(self):
        """Close the currently open file when done with it."""
        if hasattr(self, 'reader') and self.reader and hasattr(self.reader, 'reader'):
            try:
                self.reader.reader.closeFile()
                print("UMDF file closed successfully")
            except Exception as e:
                print(f"Warning: Error closing file: {e}")
    
    def __del__(self):
        """Cleanup when the importer is destroyed."""
        self.close_file() 