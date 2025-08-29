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
            
            # Close the file
            self.reader.reader.closeFile()
            
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
                module = {
                    "id": module_data.get('uuid', 'unknown'),
                    "name": f"UMDF_Module_{module_data.get('type', 'unknown')}",
                    "schema_id": "unknown",
                    "type": module_data.get('type', 'unknown'),
                    "schema_url": "unknown",
                    "metadata": {"uuid": module_data.get('uuid', 'unknown')},
                    "data": {},
                    "created_at": datetime.now().isoformat(),
                    "source_file": filename
                }
                modules.append(module)
            
            return {
                "file_type": "umdf",
                "file_path": filename,
                "modules": modules,
                "file_info": file_info,
                "module_count": module_count,
                "encounters": encounters,
                "module_graph": module_graph
            }
            
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