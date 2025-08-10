#!/usr/bin/env python3
"""
Test script to verify UMDF integration with the UI.
"""

import asyncio
import sys
import os

# Add the app directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from importers.file_importer import FileImporter

async def test_umdf_import():
    """Test importing a UMDF file through the UI's file importer."""
    
    print("Testing UMDF Integration with UI")
    print("=" * 40)
    
    # Create file importer
    importer = FileImporter()
    
    # Check if we have the example UMDF file
    example_path = "../UMDF/example.umdf"
    if not os.path.exists(example_path):
        print(f"❌ Example UMDF file not found at {example_path}")
        return
    
    # Read the example UMDF file
    with open(example_path, 'rb') as f:
        content = f.read()
    
    print(f"Loaded UMDF file: {len(content)} bytes")
    
    try:
        # Import the UMDF file
        result = await importer.import_file(
            content=content,
            filename="example.umdf",
            file_type="umdf"
        )
        
        print("✅ UMDF import successful!")
        print(f"File type: {result['file_type']}")
        print(f"File path: {result['file_path']}")
        print(f"Number of modules: {len(result['modules'])}")
        
        # Print module details
        for i, module in enumerate(result['modules']):
            print(f"\nModule {i+1}:")
            print(f"  Name: {module.get('name', 'Unknown')}")
            print(f"  Schema ID: {module.get('schema_id', 'Unknown')}")
            print(f"  Metadata entries: {len(module.get('metadata', {}))}")
            
            # Show some metadata
            metadata = module.get('metadata', {})
            for key, value in list(metadata.items())[:5]:  # Show first 5
                print(f"    {key}: {value}")
        
        print("\n✅ All tests passed!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_umdf_import())
