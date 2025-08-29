#!/usr/bin/env python3
"""
Example of how to integrate the updated UMDF Python bindings into a Python UI
"""

import sys
import os
import json
import numpy as np
from typing import Dict, List, Any

# Add the cpp_interface directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'cpp_interface'))

try:
    from umdf_interface import UMDFReader, UMDFWriter, read_umdf_file, get_module_data
    print("✓ Successfully imported umdf_interface module")
except ImportError as e:
    print(f"✗ Failed to import umdf_interface: {e}")
    sys.exit(1)

class UMDFIntegration:
    """Integration class for using UMDF in a UI application"""
    
    def __init__(self):
        self.reader = UMDFReader()
        self.writer = UMDFWriter()
        self.current_file = None
    
    def load_file(self, filepath: str, password: str = "") -> Dict[str, Any]:
        """Load a UMDF file and return file information"""
        try:
            success = self.reader.read_file(filepath, password)
            if not success:
                raise RuntimeError(f"Failed to read UMDF file: {filepath}")
            
            self.current_file = filepath
            return self.reader.get_file_info()
        except Exception as e:
            print(f"Error loading file {filepath}: {e}")
            return {}
    
    def get_module_data(self, module_id: str) -> Dict[str, Any]:
        """Get data for a specific module"""
        if not self.current_file:
            raise RuntimeError("No file loaded. Call load_file() first.")
        
        try:
            module_data = self.reader.get_module_data(module_id)
            if module_data:
                return module_data
            else:
                return {}
        except Exception as e:
            print(f"Error getting module data for {module_id}: {e}")
            return {}
    
    def get_audit_trail(self, module_id: str) -> List[Dict[str, Any]]:
        """Get audit trail for a module"""
        if not self.current_file:
            return []
        
        try:
            return self.reader.get_audit_trail(module_id)
        except Exception as e:
            print(f"Error getting audit trail for {module_id}: {e}")
            return []
    
    def create_new_file(self, filename: str, author: str, password: str = "") -> bool:
        """Create a new UMDF file"""
        try:
            success = self.writer.create_new_file(filename, author, password)
            if success:
                self.current_file = filename
                return True
            return False
        except Exception as e:
            print(f"Error creating file {filename}: {e}")
            return False
    
    def add_encounter_to_file(self, filename: str, author: str, password: str = "") -> Dict[str, Any]:
        """Create a new file with an encounter and return the IDs"""
        try:
            if self.create_new_file(filename, author, password):
                encounter_id = self.writer.create_new_encounter()
                if encounter_id:
                    return {
                        "success": True,
                        "filename": filename,
                        "encounter_id": encounter_id
                    }
                else:
                    return {"success": False, "error": "Failed to create encounter"}
            else:
                return {"success": False, "error": "Failed to create file"}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def close_current_file(self) -> bool:
        """Close the currently open file"""
        try:
            if self.current_file:
                # Close both reader and writer if they have files open
                reader_closed = self.reader.close_file()
                writer_closed = self.writer.close_file()
                self.current_file = None
                return reader_closed and writer_closed
            return True
        except Exception as e:
            print(f"Error closing file: {e}")
            return False
    
    def get_image_data(self, module_id: str) -> Dict[str, Any]:
        """Get image data and convert to numpy arrays for display"""
        module_data = self.get_module_data(module_id)
        
        if not module_data or 'data' not in module_data:
            return {}
        
        # This is a placeholder - you'll need to implement based on your ModuleData structure
        # The actual implementation depends on how your ModuleData is structured
        
        return {
            'module_id': module_id,
            'metadata': module_data.get('metadata', {}),
            'data_type': 'image',  # Placeholder
            'note': 'Image data extraction needs to be implemented based on ModuleData structure'
        }

def example_usage():
    """Example of how to use the UMDF integration in a UI"""
    
    # Create integration instance
    umdf = UMDFIntegration()
    
    # Load a UMDF file
    print("Loading UMDF file...")
    file_info = umdf.load_file('example.umdf')
    print(f"File loaded: {json.dumps(file_info, indent=2)}")
    
    # Close the file
    umdf.close_current_file()
    
    # Create a new file with encounter
    print("\nCreating new UMDF file...")
    test_filename = f"test_integration_{int(time.time())}.umdf"
    result = umdf.add_encounter_to_file(test_filename, "test_user", "test_password")
    print(f"New file result: {json.dumps(result, indent=2)}")
    
    if result['success']:
        # Close the file
        umdf.close_current_file()
        
        # Clean up test file
        if os.path.exists(test_filename):
            os.remove(test_filename)
            print(f"Test file {test_filename} cleaned up")
    
    print("\n✓ Integration example completed!")

if __name__ == "__main__":
    import time
    
    print("UMDF Integration Example")
    print("=" * 40)
    example_usage()
