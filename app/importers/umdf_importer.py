import sys
import os
import json
from typing import Dict, Any, List, Optional
from datetime import datetime

# Add cpp_interface to Python path
cpp_interface_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'cpp_interface')
if cpp_interface_path not in sys.path:
    sys.path.insert(0, cpp_interface_path)

# Import the compiled UMDF module
try:
    import umdf_reader
except ImportError as e:
    print(f"Warning: Could not import umdf_reader module: {e}")
    print(f"Python path: {sys.path}")
    print(f"Looking for module in: {cpp_interface_path}")
    umdf_reader = None


class UMDFImporter:
    """Imports UMDF files using the C++ reader module."""
    
    def __init__(self):
        self.reader = None
        if umdf_reader:
            self.reader = umdf_reader.Reader()
    
    def can_import(self) -> bool:
        """Check if the UMDF module is available."""
        return umdf_reader is not None and self.reader is not None
    
    def import_file(self, file_content: bytes, filename: str) -> Dict[str, Any]:
        """Import a UMDF file and convert to internal module format."""
        if not self.can_import():
            raise ImportError("UMDF reader module not available")
        
        # Write content to temporary file
        temp_path = f"/tmp/{filename}"
        with open(temp_path, 'wb') as f:
            f.write(file_content)
        
        try:
            # Read the file with the reader
            if not self.reader.readFile(temp_path):
                raise RuntimeError(f"Failed to read UMDF file: {filename}")
            
            # Get file info
            file_info = umdf_reader.read_umdf_file(temp_path)
            
            # Get module IDs from the reader
            module_ids = self.reader.getModuleIds()
            
            # Convert to internal format
            modules = []
            
            for module_id in module_ids:
                try:
                    # Use the convenience function to get module data
                    module_data = umdf_reader.get_module_data(temp_path, module_id)
                    
                    # Convert to internal module format
                    module = {
                        "id": module_id,
                        "name": f"UMDF_Module_{module_id}",
                        "schema_id": self._determine_module_type_from_dict(module_data),
                        "type": self._determine_module_type_from_dict(module_data),
                        "schema_url": module_data.get('schema_url', 'unknown'),
                        "metadata": self._extract_metadata_from_dict(module_data),
                        "data": self._extract_data_from_dict(module_data),
                        "created_at": datetime.now().isoformat(),
                        "source_file": filename
                    }
                    
                    modules.append(module)
                    
                except Exception as e:
                    print(f"Warning: Failed to process module {module_id}: {e}")
                    continue
            
            return {
                "file_type": "umdf",
                "file_path": filename,
                "modules": modules,
                "file_info": file_info,
                "module_count": len(modules)
            }
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_path):
                os.remove(temp_path)
    

    
    def _determine_module_type_from_dict(self, module_data: Dict[str, Any]) -> str:
        """Determine the module type based on the data dictionary."""
        if isinstance(module_data, dict):
            # Check metadata for modality
            if 'metadata' in module_data and isinstance(module_data['metadata'], list):
                for meta in module_data['metadata']:
                    if isinstance(meta, dict) and 'modality' in meta:
                        return 'imaging'
            
            # Check data for patient information
            if 'data' in module_data and isinstance(module_data['data'], list):
                if module_data['data'] and isinstance(module_data['data'][0], dict):
                    first_item = module_data['data'][0]
                    if 'patient_id' in first_item or 'name' in first_item:
                        return 'patient'
                    elif 'test_name' in first_item or 'value' in first_item:
                        return 'lab_results'
                    elif 'medication_name' in first_item or 'dosage' in first_item:
                        return 'medication'
        
        return 'unknown'
    
    def _extract_metadata_from_dict(self, module_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract metadata from module data dictionary."""
        metadata = {}
        
        if isinstance(module_data, dict):
            # Extract metadata from the module_data structure
            if 'metadata' in module_data and isinstance(module_data['metadata'], list):
                # Flatten metadata list into single dict
                for meta_item in module_data['metadata']:
                    if isinstance(meta_item, dict):
                        metadata.update(meta_item)
        
        return metadata
    
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