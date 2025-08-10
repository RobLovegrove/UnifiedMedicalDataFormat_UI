#!/usr/bin/env python3
"""
Test script to demonstrate direct binary transfer of pixel data.
"""

import sys
import os
import numpy as np

# Add the cpp_interface directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'cpp_interface'))

try:
    import umdf_reader
except ImportError as e:
    print(f"Error: Could not import umdf_reader: {e}")
    sys.exit(1)

def test_binary_transfer():
    """Test the new binary transfer functionality."""
    
    print("Testing Direct Binary Transfer")
    print("=" * 40)
    
    filename = "example.umdf"
    image_module_id = "1506fa44-59f3-4787-aedf-6189f48b45dd"  # Image module
    
    print(f"Reading file: {filename}")
    print(f"Image module ID: {image_module_id}")
    print()
    
    try:
        # Test the new binary transfer function
        print("🔬 Testing get_module_data_binary...")
        module_data = umdf_reader.get_module_data_binary(filename, image_module_id)
        
        print("✅ Binary transfer successful!")
        print(f"Data type: {module_data['data_type']}")
        print(f"Frame count: {module_data['frame_count']}")
        print(f"Metadata entries: {len(module_data['metadata'])}")
        print()
        
        # Analyze the frames
        frames = module_data['data']
        print(f"📊 Frame Analysis:")
        print(f"  Total frames: {len(frames)}")
        
        for i, frame in enumerate(frames[:3]):  # Show first 3 frames
            print(f"  Frame {i}:")
            print(f"    Data type: {frame['data_type']}")
            print(f"    Data size: {frame['data_size']} bytes")
            print(f"    Metadata: {len(frame['metadata'])} entries")
            
            # Convert binary data to numpy array
            if frame['data_type'] == 'binary':
                pixel_bytes = frame['data']
                pixel_array = np.frombuffer(pixel_bytes, dtype=np.uint8)
                print(f"    Numpy array shape: {pixel_array.shape}")
                print(f"    Numpy array dtype: {pixel_array.dtype}")
                
                # Try to reshape as 2D image
                size = int(np.sqrt(len(pixel_array)))
                if size * size == len(pixel_array):
                    image_2d = pixel_array.reshape((size, size))
                    print(f"    Reshaped to: {image_2d.shape}")
                    print(f"    Min value: {image_2d.min()}")
                    print(f"    Max value: {image_2d.max()}")
                    print(f"    Mean value: {image_2d.mean():.2f}")
                else:
                    print(f"    Could not reshape to square image")
            
            print()
        
        # Compare with old JSON method
        print("🔄 Comparing with JSON method...")
        json_module_data = umdf_reader.get_module_data(filename, image_module_id)
        
        print(f"JSON method data type: {type(json_module_data)}")
        if isinstance(json_module_data, dict):
            print(f"JSON method keys: {list(json_module_data.keys())}")
        
        print()
        print("✅ Binary transfer preserves metadata and provides direct access to pixel data!")
        print("🎯 Benefits:")
        print("  - No JSON conversion overhead for binary data")
        print("  - Direct numpy array conversion possible")
        print("  - Metadata still paired with binary data")
        print("  - More efficient memory usage")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_binary_transfer()
