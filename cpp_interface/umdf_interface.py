#!/usr/bin/env python3
"""
UMDF Interface - Python wrapper for the UMDF C++ library
Provides a clean, Pythonic interface to the UMDF functionality
"""

import sys
import os
import json
from typing import Dict, List, Any, Optional, Union

# Import the main UMDF module
try:
    import umdf
    print("✓ Successfully imported umdf module")
except ImportError as e:
    print(f"✗ Failed to import umdf: {e}")
    print("Make sure to run: pip install -e ../UMDF/python_package --force-reinstall")
    sys.exit(1)

class UMDFReader:
    """High-level wrapper for reading UMDF files"""
    
    def __init__(self):
        self.reader = umdf.Reader()
        self.current_file = None
    
    def read_file(self, filepath: str, password: str = "") -> bool:
        """Open and read a UMDF file"""
        try:
            result = self.reader.openFile(filepath, password)
            if result.success:
                self.current_file = filepath
                return True
            else:
                print(f"Failed to open file: {result.message}")
                return False
        except Exception as e:
            print(f"Error opening file {filepath}: {e}")
            return False
    
    def get_file_info(self) -> Dict[str, Any]:
        """Get information about the currently open file"""
        if not self.current_file:
            raise RuntimeError("No file loaded. Call read_file() first.")
        
        try:
            file_info = self.reader.getFileInfo()
            # Convert nlohmann::json to Python dict
            return json.loads(file_info.dump()) if hasattr(file_info, 'dump') else file_info
        except Exception as e:
            print(f"Error getting file info: {e}")
            return {}
    
    def get_module_data(self, module_id: str) -> Optional[Dict[str, Any]]:
        """Get data for a specific module"""
        if not self.current_file:
            raise RuntimeError("No file loaded. Call read_file() first.")
        
        try:
            result = self.reader.getModuleData(module_id)
            if result.has_value():
                module_data = result.value()
                # Convert ModuleData to Python dict
                return {
                    'id': str(module_data.id) if hasattr(module_data, 'id') else module_id,
                    'metadata': json.loads(module_data.metadata.dump()) if hasattr(module_data.metadata, 'dump') else {},
                    'data': self._extract_module_data(module_data)
                }
            else:
                print(f"Module {module_id} not found: {result.error()}")
                return None
        except Exception as e:
            print(f"Error getting module data for {module_id}: {e}")
            return None
    
    def get_audit_trail(self, module_id: str) -> List[Dict[str, Any]]:
        """Get audit trail for a module"""
        if not self.current_file:
            raise RuntimeError("No file loaded. Call read_file() first.")
        
        try:
            # Convert string module_id to UUID if needed
            uuid_obj = umdf.UUID.fromString(module_id) if isinstance(module_id, str) else module_id
            result = self.reader.getAuditTrail(uuid_obj)
            
            if result.has_value():
                trails = result.value()
                audit_data = []
                for trail in trails:
                    trail_info = {
                        'module_id': str(trail.moduleId) if hasattr(trail, 'moduleId') else '',
                        'timestamp': str(trail.timestamp) if hasattr(trail, 'timestamp') else '',
                        'action': str(trail.action) if hasattr(trail, 'action') else ''
                    }
                    audit_data.append(trail_info)
                return audit_data
            else:
                print(f"Audit trail not found: {result.error()}")
                return []
        except Exception as e:
            print(f"Error getting audit trail for {module_id}: {e}")
            return []
    
    def close_file(self) -> bool:
        """Close the currently open file"""
        try:
            result = self.reader.closeFile()
            if result.success:
                self.current_file = None
                return True
            else:
                print(f"Failed to close file: {result.message}")
                return False
        except Exception as e:
            print(f"Error closing file: {e}")
            return False
    
    def _extract_module_data(self, module_data) -> Any:
        """Extract data from ModuleData object based on its type"""
        try:
            # This is a simplified extraction - you might need to expand this
            # based on your specific ModuleData structure
            if hasattr(module_data, 'data'):
                # Handle different data types (tabular, image, nested, etc.)
                return "Data extracted"  # Placeholder
            return None
        except Exception as e:
            print(f"Error extracting module data: {e}")
            return None

class UMDFWriter:
    """High-level wrapper for writing UMDF files"""
    
    def __init__(self):
        self.writer = umdf.Writer()
        self.current_file = None
    
    def open_file(self, filename: str, author: str, password: str = "") -> bool:
        """Open an existing UMDF file for editing"""
        try:
            result = self.writer.openFile(filename, author, password)
            
            if result.success:
                self.current_file = filename
                return True
            else:
                print(f"Failed to open file: {result.message}")
                return False
        except Exception as e:
            print(f"Error opening file {filename}: {e}")
            return False
    
    def create_new_file(self, filename: str, author: str, password: str = "") -> bool:
        """Create a new UMDF file"""
        try:
            result = self.writer.createNewFile(filename, author, password)
            if result.success:
                self.current_file = filename
                return True
            else:
                print(f"Failed to create file: {result.message}")
                return False
        except Exception as e:
            print(f"Error creating file {filename}: {e}")
            return False
    
    def create_new_encounter(self) -> Optional[str]:
        """Create a new encounter and return its ID"""
        if not self.current_file:
            raise RuntimeError("No file open. Call create_new_file() first.")
        
        try:
            result = self.writer.createNewEncounter()
            if result.has_value():
                encounter_id = result.value()
                return str(encounter_id)
            else:
                print(f"Failed to create encounter: {result.error()}")
                return None
        except Exception as e:
            print(f"Error creating encounter: {e}")
            return None
    
    def add_variant_module(self, parent_module_id: str, schema_path: str, metadata: dict, data: list, author: str = None) -> Optional[str]:
        """Add a variant module to a parent module"""
        if not self.current_file:
            raise RuntimeError("No file open. Call create_new_file() first.")
        
        try:
            # Convert string parent_module_id to UUID if needed
            try:
                if isinstance(parent_module_id, str):
                    uuid_obj = umdf.UUID.fromString(parent_module_id)
                else:
                    uuid_obj = parent_module_id
            except Exception as uuid_error:
                print(f"Error creating UUID from string '{parent_module_id}': {uuid_error}")
                return None
            
            # Create a ModuleData object
            try:
                module_data = umdf.ModuleData()
                
                # Set the metadata and data
                if hasattr(module_data, 'set_metadata'):
                    module_data.set_metadata(metadata)
                elif hasattr(module_data, 'setMetadata'):
                    module_data.setMetadata(metadata)
                
                if hasattr(module_data, 'set_tabular_data'):
                    module_data.set_tabular_data(data)
                elif hasattr(module_data, 'setTabularData'):
                    module_data.setTabularData(data)
                
                # Set author if available
                if author and hasattr(module_data, 'set_author'):
                    module_data.set_author(author)
                elif author and hasattr(module_data, 'setAuthor'):
                    module_data.setAuthor(author)
                    
            except Exception as create_error:
                print(f"Error creating ModuleData object: {create_error}")
                return None
            
            result = self.writer.addVariantModule(uuid_obj, schema_path, module_data)
            
            if result.has_value():
                module_id = result.value()
                return str(module_id)
            else:
                print(f"Failed to add variant module: {result.error()}")
                return None
        except Exception as e:
            print(f"Error adding variant module: {e}")
            return None

    def add_module_to_encounter(self, encounter_id: str, schema_path: str, metadata: dict, data: list, author: str = None) -> Optional[str]:
        """Add a module to an encounter"""
        if not self.current_file:
            raise RuntimeError("No file open. Call create_new_file() first.")
        
        try:
            # Convert string encounter_id to UUID if needed
            try:
                if isinstance(encounter_id, str):
                    # Use the fromString static method
                    uuid_obj = umdf.UUID.fromString(encounter_id)
                    print(f"=== DEBUG: Successfully created UUID from string using fromString: {encounter_id}")
                else:
                    uuid_obj = encounter_id
                    print(f"=== DEBUG: Using existing UUID object: {encounter_id}")
            except Exception as uuid_error:
                print(f"=== DEBUG: Error creating UUID from string '{encounter_id}': {uuid_error}")
                print(f"=== DEBUG: UUID fromString error type: {type(uuid_error)}")
                # Try to pass the string directly to the C++ method
                print(f"=== DEBUG: Attempting to pass string directly to addModuleToEncounter")
                uuid_obj = encounter_id
            
            # Try to create a ModuleData object from the raw data
            try:
                # Create a new ModuleData object
                print(f"=== DEBUG: Attempting to create ModuleData object")
                module_data = umdf.ModuleData()
                print(f"=== DEBUG: Successfully created ModuleData object: {module_data}")
                
                # Set the metadata and data
                if hasattr(module_data, 'set_metadata'):
                    module_data.set_metadata(metadata)
                elif hasattr(module_data, 'setMetadata'):
                    module_data.setMetadata(metadata)
                
                if hasattr(module_data, 'set_tabular_data'):
                    module_data.set_tabular_data(data)
                elif hasattr(module_data, 'setTabularData'):
                    module_data.setTabularData(data)
                
                # Set author if available
                if author and hasattr(module_data, 'set_author'):
                    module_data.set_author(author)
                elif author and hasattr(module_data, 'setAuthor'):
                    module_data.setAuthor(author)
                    
            except Exception as create_error:
                print(f"=== DEBUG: Error creating ModuleData object: {create_error} ===")
                print(f"=== DEBUG: ModuleData attributes: {dir(umdf.ModuleData) if hasattr(umdf, 'ModuleData') else 'No ModuleData'}")
                # If we can't create a ModuleData object, try to pass the raw data
                # This might work if the C++ method accepts different parameter types
                module_data = {
                    'metadata': metadata,
                    'data': data,
                    'author': author
                }
            
            print(f"=== DEBUG: Calling addModuleToEncounter with:")
            print(f"=== DEBUG:   uuid_obj: {uuid_obj} (type: {type(uuid_obj)})")
            print(f"=== DEBUG:   schema_path: {schema_path}")
            print(f"=== DEBUG:   module_data: {module_data} (type: {type(module_data)})")
            result = self.writer.addModuleToEncounter(uuid_obj, schema_path, module_data)
            
            if result.has_value():
                module_id = result.value()
                return str(module_id)
            else:
                print(f"Failed to add module: {result.error()}")
                return None
        except Exception as e:
            print(f"Error adding module to encounter: {e}")
            return None
    
    def cancel_then_close(self) -> bool:
        """Cancel the current operation and close the file without saving changes"""
        try:
            # Debug: check what methods are available on the writer
            print(f"=== DEBUG: Available methods on writer: {dir(self.writer)}")
            print(f"=== DEBUG: Writer type: {type(self.writer)}")
            
            # Try different possible method names
            if hasattr(self.writer, 'cancelThenClose'):
                result = self.writer.cancelThenClose()
            elif hasattr(self.writer, 'cancelTheClose'):
                result = self.writer.cancelTheClose()
            elif hasattr(self.writer, 'cancelAndClose'):
                result = self.writer.cancelAndClose()
            elif hasattr(self.writer, 'cancel'):
                result = self.writer.cancel()
            else:
                print("=== DEBUG: No cancel method found on writer")
                # Just close the file without canceling
                return self.close_file()
            
            if result.success:
                self.current_file = None
                return True
            else:
                print(f"Failed to cancel and close file: {result.message}")
                return False
        except Exception as e:
            print(f"Error canceling and closing file: {e}")
            return False
    
    def cancel_and_close(self) -> bool:
        """Alias for cancel_then_close() to match backend expectations"""
        return self.cancel_then_close()

    def close_file(self) -> bool:
        """Close and finalize the current file"""
        try:
            result = self.writer.closeFile()
            if result.success:
                self.current_file = None
                return True
            else:
                print(f"Failed to close file: {result.message}")
                return False
        except Exception as e:
            print(f"Error closing file: {e}")
            return False
    


# Convenience functions for backward compatibility
def read_umdf_file(filepath: str, password: str = "") -> Dict[str, Any]:
    """Read a UMDF file and return its information"""
    reader = UMDFReader()
    if reader.read_file(filepath, password):
        file_info = reader.get_file_info()
        reader.close_file()
        return file_info
    return {}

def get_module_data(filepath: str, module_id: str, password: str = "") -> Optional[Dict[str, Any]]:
    """Get data for a specific module from a UMDF file"""
    reader = UMDFReader()
    if reader.read_file(filepath, password):
        module_data = reader.get_module_data(module_id)
        reader.close_file()
        return module_data
    return None

# Export the main classes
__all__ = [
    'UMDFReader', 'UMDFWriter', 'read_umdf_file', 'get_module_data',
    'Reader', 'Writer', 'ModuleData', 'UUID', 'Result'
]

# Also export the raw C++ classes for advanced usage
Reader = umdf.Reader
Writer = umdf.Writer
ModuleData = umdf.ModuleData
UUID = umdf.UUID
Result = umdf.Result 
