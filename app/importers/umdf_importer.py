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
    from cpp_interface.umdf_interface import umdf_interface
    print("Successfully imported UMDF interface")
except ImportError as e:
    print(f"Warning: Could not import UMDF interface: {e}")
    umdf_interface = None

class UMDFImporter:
    """Importer for UMDF files using the C++ reader."""
    
    def __init__(self):
        """Initialize the UMDF importer."""
        self.interface = umdf_interface
    
    def can_import(self) -> bool:
        """Check if UMDF import is available."""
        return self.interface and self.interface.can_read()
    
    def import_file(self, file_content: bytes, filename: str) -> Dict[str, Any]:
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
            
            # Read the file using the interface
            print("Calling interface.read_file...")
            file_data = self.interface.read_file(temp_path)
            print(f"Interface read_file returned: {type(file_data)}")
            
            if not file_data:
                print("Interface returned None or empty data")
                raise RuntimeError(f"Failed to read UMDF file: {filename}")
            
            print(f"File data received: {type(file_data)}")
            if isinstance(file_data, dict):
                print(f"Keys in file_data: {list(file_data.keys())}")
            
            # Convert to internal format
            modules = []
            
            # Extract modules from the file data
            if 'modules' in file_data:
                for module_data in file_data['modules']:
                    try:
                        module = {
                            "id": module_data.get('id', 'unknown'),
                            "name": module_data.get('name', f"UMDF_Module_{module_data.get('id', 'unknown')}"),
                            "schema_id": module_data.get('schema_id', 'unknown'),
                            "type": module_data.get('type', 'unknown'),
                            "schema_url": module_data.get('schema_url', 'unknown'),
                            "metadata": module_data.get('metadata', {}),
                            "data": module_data.get('data', {}),
                            "created_at": datetime.now().isoformat(),
                            "source_file": filename
                        }
                        modules.append(module)
                    except Exception as e:
                        print(f"Warning: Failed to process module: {e}")
                        continue
                
                print(f"Successfully processed {len(modules)} modules")
            else:
                print(f"No modules found in file_data. Available keys: {list(file_data.keys()) if isinstance(file_data, dict) else 'Not a dict'}")
            
            return {
                "file_type": "umdf",
                "file_path": filename,
                "modules": modules,
                "file_info": file_data,
                "module_count": len(modules)
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
    

    
    def _extract_data_from_dict(self, module_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract the main data from module data dictionary."""
        data = {}
        
        if isinstance(module_data, dict):
            # Extract data from the module_data structure
            if 'data' in module_data:
                raw_data = module_data['data']
                
                # First, try to find pixel data in the nested structure
                pixel_data = self._find_pixel_data_in_nested_structure(raw_data)
                
                if pixel_data:
                    # Found pixel data - convert to image
                    try:
                        import numpy as np
                        from PIL import Image
                        import base64
                        import io
                        
                        # Convert to numpy array
                        pixel_array = np.array(pixel_data, dtype=np.uint8)
                        
                        # Try to determine dimensions from metadata
                        rows = 512  # Default
                        cols = 512  # Default
                        
                        if 'metadata' in module_data:
                            metadata = module_data['metadata']
                            if isinstance(metadata, list):
                                for meta in metadata:
                                    if isinstance(meta, dict):
                                        if 'rows' in meta:
                                            rows = meta['rows']
                                        if 'columns' in meta:
                                            cols = meta['columns']
                            elif isinstance(metadata, dict):
                                if 'rows' in metadata:
                                    rows = metadata['rows']
                                if 'columns' in metadata:
                                    cols = metadata['columns']
                        
                        # Reshape if possible
                        if len(pixel_array) == rows * cols:
                            pixel_array = pixel_array.reshape((rows, cols))
                        elif len(pixel_array) == rows * cols * 3:  # RGB
                            pixel_array = pixel_array.reshape((rows, cols, 3))
                        
                        # Convert to PIL Image
                        if len(pixel_array.shape) == 2:  # Grayscale
                            img = Image.fromarray(pixel_array, mode='L')
                        else:  # RGB
                            img = Image.fromarray(pixel_array, mode='RGB')
                        
                        # Convert to PNG Base64
                        buffer = io.BytesIO()
                        img.save(buffer, format='PNG')
                        img_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                        
                        data = {
                            "imageData": img_base64,
                            "pixelData": pixel_data,  # Keep original for reference
                            "dimensions": f"{rows}x{cols}",
                            "format": "png"
                        }
                        
                    except Exception as e:
                        print(f"Warning: Failed to convert pixel data to image: {e}")
                        data = {"pixelData": pixel_data}
                else:
                    # No pixel data found, return the original structure
                    if isinstance(raw_data, list):
                        data = {"items": raw_data}
                    elif isinstance(raw_data, dict):
                        data = raw_data
                    else:
                        data = {"value": raw_data}
        
        return data
    
    def _find_pixel_data_in_nested_structure(self, data: Any) -> Optional[List[int]]:
        """Recursively search for pixel data in nested structures."""
        if isinstance(data, list):
            # Check if this list looks like pixel data
            if len(data) > 1000 and all(isinstance(x, (int, float)) for x in data[:10]):
                return data
            # Search deeper in nested lists
            for item in data:
                result = self._find_pixel_data_in_nested_structure(item)
                if result:
                    return result
        elif isinstance(data, dict):
            # Search in dictionary values
            for value in data.values():
                result = self._find_pixel_data_in_nested_structure(value)
                if result:
                    return result
        return None 