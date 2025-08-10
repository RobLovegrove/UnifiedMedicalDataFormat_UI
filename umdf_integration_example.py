#!/usr/bin/env python3
"""
Example of how to integrate the pybind11 UMDF reader into a Python UI
"""

import sys
import os
import json
import numpy as np
from typing import Dict, List, Any

# Add the cpp_interface directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'cpp_interface'))

try:
    import umdf_reader
    print("✓ Successfully imported umdf_reader module")
except ImportError as e:
    print(f"✗ Failed to import umdf_reader: {e}")
    sys.exit(1)

class UMDFReader:
    """Wrapper class for the UMDF reader functionality"""
    
    def __init__(self):
        self.reader = umdf_reader.Reader()
        self.current_file = None
    
    def load_file(self, filepath: str) -> Dict[str, Any]:
        """Load a UMDF file and return file information"""
        try:
            success = self.reader.readFile(filepath)
            if not success:
                raise RuntimeError(f"Failed to read UMDF file: {filepath}")
            
            self.current_file = filepath
            return umdf_reader.read_umdf_file(filepath)
        except Exception as e:
            print(f"Error loading file {filepath}: {e}")
            return {}
    
    def get_module_data(self, module_id: str) -> Dict[str, Any]:
        """Get data for a specific module"""
        if not self.current_file:
            raise RuntimeError("No file loaded. Call load_file() first.")
        
        try:
            return umdf_reader.get_module_data(self.current_file, module_id)
        except Exception as e:
            print(f"Error getting module data for {module_id}: {e}")
            return {}
    
    def get_module_ids(self) -> List[str]:
        """Get all module IDs in the current file"""
        if not self.current_file:
            return []
        
        try:
            return self.reader.getModuleIds()
        except Exception as e:
            print(f"Error getting module IDs: {e}")
            return []
    
    def get_image_data(self, module_id: str) -> Dict[str, Any]:
        """Get image data and convert to numpy arrays for display"""
        module_data = self.get_module_data(module_id)
        
        if not module_data or 'data' not in module_data:
            return {}
        
        # Convert frame data to numpy arrays
        frames = []
        for frame in module_data['data']:
            # Convert pixel data to numpy array
            pixel_data = np.array(frame['data'], dtype=np.uint8)
            
            # Reshape based on dimensions (assuming 2D for now)
            metadata = module_data['metadata'][0]  # Image metadata
            width = metadata.get('width', 16)
            height = metadata.get('height', 16)
            
            # Reshape to 2D image
            if len(pixel_data) == width * height:
                image_2d = pixel_data.reshape((height, width))
            else:
                # Keep as 1D if dimensions don't match
                image_2d = pixel_data
            
            frame_data = {
                'pixel_data': image_2d,
                'metadata': frame['metadata']
            }
            frames.append(frame_data)
        
        return {
            'frames': frames,
            'image_metadata': module_data['metadata'],
            'module_id': module_data['module_id'],
            'schema_url': module_data['schema_url']
        }

def example_usage():
    """Example of how to use the UMDF reader in a UI"""
    
    # Create reader instance
    reader = UMDFReader()
    
    # Load a UMDF file
    print("Loading UMDF file...")
    file_info = reader.load_file('example.umdf')
    print(f"File loaded: {file_info}")
    
    # Get all module IDs
    module_ids = reader.get_module_ids()
    print(f"Module IDs: {module_ids}")
    
    # Get image data
    if module_ids:
        # Find image module (you might want to check module types)
        image_module_id = module_ids[1]  # Assuming second module is image
        print(f"Getting image data for module: {image_module_id}")
        
        image_data = reader.get_image_data(image_module_id)
        if image_data:
            print(f"Image data loaded:")
            print(f"  Number of frames: {len(image_data['frames'])}")
            print(f"  Image dimensions: {image_data['frames'][0]['pixel_data'].shape}")
            print(f"  Module ID: {image_data['module_id']}")
            
            # Example: Display first frame
            first_frame = image_data['frames'][0]
            print(f"  First frame metadata: {first_frame['metadata']}")
            print(f"  First frame shape: {first_frame['pixel_data'].shape}")
            
            # You could now pass this data to your UI components
            # For example, in a web UI:
            # - image_data['frames'][i]['pixel_data'] for the image data
            # - image_data['frames'][i]['metadata'] for frame metadata
            # - image_data['image_metadata'] for overall image metadata

if __name__ == "__main__":
    print("UMDF Reader Integration Example")
    print("=" * 40)
    example_usage()
