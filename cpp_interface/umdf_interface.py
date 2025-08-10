"""
Python interface to the C++ UMDF reader/writer
"""

import os
import sys
import json
from typing import Dict, Any, List, Optional
from ctypes import cdll, c_char_p, c_void_p, c_int, c_size_t, c_double, POINTER, Structure, c_uint32, c_uint64, c_bool
import numpy as np

# Add the current directory to Python path for imports
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

try:
    import umdf_reader
    print("Successfully imported umdf_reader module")
except ImportError as e:
    print(f"Warning: Could not import umdf_reader module: {e}")
    umdf_reader = None

class UMDFInterface:
    """Python wrapper for the C++ UMDF reader/writer library."""
    
    def __init__(self):
        """Initialize the UMDF interface."""
        self._lib = None
        self._reader = None
        
        if umdf_reader:
            try:
                # Create a Reader instance
                self._reader = umdf_reader.Reader()
                print("Successfully created C++ Reader instance")
            except Exception as e:
                print(f"Warning: Could not create C++ Reader instance: {e}")
                self._reader = None
    
    def can_read(self) -> bool:
        """Check if the C++ reader is available."""
        return self._reader is not None
    
    def get_supported_schemas(self) -> List[str]:
        """Get list of supported schemas."""
        if not self.can_read():
            return []
        
        try:
            # This would need to be implemented in C++ if you want to expose schema info
            return ["umdf", "dicom", "fhir"]  # Placeholder
        except Exception as e:
            print(f"Error getting schemas: {e}")
            return []
    
    def read_file(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Read data from a UMDF file using the C++ reader.
        
        Args:
            file_path: Path to UMDF file
            
        Returns:
            Dictionary containing file data or None if failed
        """
        if not self.can_read():
            print("C++ reader not available")
            return None
        
        try:
            print(f"Reading UMDF file: {file_path}")
            
            # Use the new convenience function that returns all modules at once
            print("Calling read_umdf_file_all_modules...")
            all_modules = umdf_reader.read_umdf_file_all_modules(file_path)
            print(f"read_umdf_file_all_modules returned: {type(all_modules)}")
            
            if not all_modules or not all_modules.get('success', False):
                print("Failed to read UMDF file or no success flag")
                return {
                    "modules": [],
                    "file_info": {},
                    "module_count": 0,
                    "successful_modules": 0,
                    "failed_modules": 0,
                    "file_path": file_path
                }
            
            # Extract modules from the result
            raw_modules = all_modules.get('modules', [])
            print(f"Found {len(raw_modules)} modules")
            
            if not raw_modules:
                print("No modules found, returning empty result")
                return {
                    "modules": [],
                    "file_info": {},
                    "module_count": 0,
                    "successful_modules": 0,
                    "failed_modules": 0,
                    "file_path": file_path
                }
            
            # Process each module
            modules = []
            successful_modules = 0
            failed_modules = 0
            
            for raw_module in raw_modules:
                try:
                    module_id = raw_module.get('module_id', 'unknown')
                    print(f"Processing module: {module_id}")
                    
                    # Convert the raw module data to our expected format
                    module = {
                        "id": module_id,
                        "name": f"Module_{module_id[:8]}",
                        "schema_id": raw_module.get('schema_url', 'unknown').split('/')[-1].replace('.json', ''),
                        "type": "unknown",  # We'll determine this from the data
                        "schema_url": raw_module.get('schema_url', ''),
                        "metadata": raw_module.get('metadata', {}),
                        "data": raw_module.get('data', {}),
                        "version": "1.0",
                        "created": "",
                        "dimensions": [],
                        "pixel_data": None
                    }
                    
                    # Try to determine module type from schema URL or data
                    schema_url = raw_module.get('schema_url', '')
                    if 'image' in schema_url.lower() or 'image' in str(raw_module.get('data', {})):
                        module['type'] = 'image'
                    elif 'patient' in schema_url.lower() or 'patient' in str(raw_module.get('data', {})):
                        module['type'] = 'patient'
                    else:
                        module['type'] = 'data'
                    
                    # Handle pixel data if present (for image modules)
                    if module['type'] == 'image' and 'data' in raw_module:
                        # The data might contain pixel information
                        # For now, we'll store the raw data and handle conversion later
                        module['pixel_data'] = raw_module.get('data')
                        
                        # Try to extract dimensions from metadata if available
                        metadata = raw_module.get('metadata', {})
                        if 'dimensions' in metadata:
                            module['dimensions'] = metadata['dimensions']
                    
                    modules.append(module)
                    successful_modules += 1
                    print(f"Successfully processed module {module_id}")
                    
                except Exception as e:
                    print(f"Error processing module {raw_module.get('module_id', 'unknown')}: {e}")
                    failed_modules += 1
                    # Add a basic module entry for failed modules
                    modules.append({
                        "id": raw_module.get('module_id', 'unknown'),
                        "name": f"Module_{raw_module.get('module_id', 'unknown')[:8]}",
                        "schema_id": "unknown",
                        "type": "unknown",
                        "schema_url": "",
                        "metadata": {},
                        "data": {},
                        "version": "1.0",
                        "created": "",
                        "dimensions": [],
                        "pixel_data": None,
                        "error": str(e)
                    })
            
            print(f"Successfully processed {successful_modules} modules, {failed_modules} failed")
            
            return {
                "modules": modules,
                "file_info": {},
                "module_count": len(modules),
                "successful_modules": successful_modules,
                "failed_modules": failed_modules,
                "file_path": file_path
            }
            
        except Exception as e:
            print(f"Error reading UMDF file: {e}")
            print(f"Exception type: {type(e)}")
            import traceback
            traceback.print_exc()
            return None
    
    def write_file(self, file_path: str, data: Dict[str, Any]) -> bool:
        """
        Write data to a UMDF file using the C++ writer.
        
        Args:
            file_path: Path to output file
            data: Data to write
            
        Returns:
            True if successful, False otherwise
        """
        if not self._lib:
            return False
        
        try:
            # Convert data to JSON string
            json_data = json.dumps(data)
            json_bytes = json_data.encode('utf-8')
            
            # Call C++ write function
            result = self._lib.write_umdf_file(
                file_path.encode('utf-8'),
                json_bytes,
                len(json_bytes)
            )
            
            return bool(result)
        except Exception as e:
            print(f"Error writing UMDF file: {e}")
            return False

# Create a global instance
umdf_interface = UMDFInterface() 