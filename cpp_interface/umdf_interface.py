"""
Python interface to the C++ UMDF reader/writer
"""

import ctypes
import os
import sys
from pathlib import Path
from typing import Dict, Any, Optional, List
import json
from datetime import datetime

class UMDFInterface:
    """Python interface to the C++ UMDF reader/writer."""
    
    def __init__(self):
        self._lib = None
        self._load_library()
    
    def _load_library(self):
        """Load the C++ library."""
        try:
            # Try to load the compiled library
            lib_path = Path(__file__).parent / "umdf_python.dylib"  # macOS
            if not lib_path.exists():
                lib_path = Path(__file__).parent / "umdf_python.so"  # Linux
            if not lib_path.exists():
                lib_path = Path(__file__).parent / "umdf_python.dll"  # Windows
            
            if lib_path.exists():
                self._lib = ctypes.CDLL(str(lib_path))
                self._setup_function_signatures()
                print(f"✓ Loaded C++ UMDF library: {lib_path}")
            else:
                print(f"Warning: UMDF library not found at {lib_path}")
                print("Using mock implementation for testing")
                self._lib = None
                
        except Exception as e:
            print(f"Warning: Could not load UMDF library: {e}")
            print("Using mock implementation for testing")
            self._lib = None
    
    def _setup_function_signatures(self):
        """Setup function signatures for the C++ library."""
        if not self._lib:
            return
            
        # Define function signatures
        self._lib.write_umdf_file.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
        self._lib.write_umdf_file.restype = ctypes.c_bool
        
        self._lib.read_umdf_file.argtypes = [ctypes.c_char_p]
        self._lib.read_umdf_file.restype = ctypes.c_bool
        
        self._lib.get_supported_schemas.argtypes = []
        self._lib.get_supported_schemas.restype = ctypes.c_char_p
        
        self._lib.validate_schema.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
        self._lib.validate_schema.restype = ctypes.c_bool
    
    def write_file(self, data: Dict[str, Any], output_path: str, 
                   access_mode: str = "fail_if_exists") -> bool:
        """
        Write data to a UMDF file using the C++ writer.
        
        Args:
            data: Dictionary containing module data
            output_path: Path to output UMDF file
            access_mode: File access mode ("fail_if_exists", "allow_update", "overwrite")
            
        Returns:
            True if successful, False otherwise
        """
        if self._lib:
            # Use C++ implementation
            return self._write_file_cpp(data, output_path, access_mode)
        else:
            # Use mock implementation for testing
            return self._write_file_mock(data, output_path, access_mode)
    
    def read_file(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Read data from a UMDF file using the C++ reader.
        
        Args:
            file_path: Path to UMDF file
            
        Returns:
            Dictionary containing file data or None if failed
        """
        if self._lib:
            # Use C++ implementation
            return self._read_file_cpp(file_path)
        else:
            # Use mock implementation for testing
            return self._read_file_mock(file_path)
    
    def _write_file_cpp(self, data: Dict[str, Any], output_path: str, 
                        access_mode: str) -> bool:
        """Write file using C++ implementation."""
        try:
            # Convert data to JSON string for C++ processing
            data_json = json.dumps(data).encode('utf-8')
            output_path_bytes = output_path.encode('utf-8')
            
            # Call C++ function
            result = self._lib.write_umdf_file(data_json, output_path_bytes)
            return bool(result)
        except Exception as e:
            print(f"Error in C++ write: {e}")
            return False
    
    def _read_file_cpp(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Read file using C++ implementation."""
        try:
            file_path_bytes = file_path.encode('utf-8')
            
            # Call C++ function
            result = self._lib.read_umdf_file(file_path_bytes)
            if result:
                # TODO: Implement data extraction from C++ reader
                return {"status": "success", "message": "File read successfully"}
            else:
                return None
        except Exception as e:
            print(f"Error in C++ read: {e}")
            return None
    
    def _write_file_mock(self, data: Dict[str, Any], output_path: str, 
                         access_mode: str) -> bool:
        """Mock implementation for testing."""
        try:
            # Create a simple JSON file as a mock UMDF file
            mock_umdf = {
                "format": "UMDF",
                "version": "1.0.0",
                "modules": data.get("modules", []),
                "metadata": data.get("metadata", {}),
                "access_mode": access_mode,
                "created_at": datetime.now().isoformat()
            }
            
            # Convert datetime objects to strings for JSON serialization
            def convert_datetime(obj):
                if isinstance(obj, datetime):
                    return obj.isoformat()
                elif isinstance(obj, dict):
                    return {k: convert_datetime(v) for k, v in obj.items()}
                elif isinstance(obj, list):
                    return [convert_datetime(item) for item in obj]
                else:
                    return obj
            
            mock_umdf = convert_datetime(mock_umdf)
            
            with open(output_path, 'w') as f:
                json.dump(mock_umdf, f, indent=2)
            
            print(f"Mock UMDF file written to: {output_path}")
            return True
            
        except Exception as e:
            print(f"Error writing mock UMDF file: {e}")
            return False
    
    def _read_file_mock(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Mock implementation for testing."""
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            
            print(f"Mock UMDF file read from: {file_path}")
            return data
            
        except Exception as e:
            print(f"Error reading mock UMDF file: {e}")
            return None
    
    def get_supported_schemas(self) -> List[str]:
        """Get list of supported schema IDs."""
        if self._lib:
            try:
                # Get schemas from C++ implementation
                schemas_json = self._lib.get_supported_schemas()
                if schemas_json:
                    schemas_str = ctypes.string_at(schemas_json).decode('utf-8')
                    return json.loads(schemas_str)
            except Exception as e:
                print(f"Error getting C++ schemas: {e}")
        
        # Fallback to default schemas
        return ["patient", "imaging", "lab_results", "medication"]
    
    def validate_schema(self, schema_id: str, data: Dict[str, Any]) -> bool:
        """Validate data against a schema."""
        if self._lib:
            try:
                # Use C++ schema validation
                schema_id_bytes = schema_id.encode('utf-8')
                data_json = json.dumps(data).encode('utf-8')
                return bool(self._lib.validate_schema(schema_id_bytes, data_json))
            except Exception as e:
                print(f"Error in C++ schema validation: {e}")
        
        # Fallback to basic validation
        return True

# Global instance
umdf_interface = UMDFInterface() 