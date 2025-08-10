#!/usr/bin/env python3
"""
Test script for Python-C++ UMDF integration
"""

import json
import asyncio
from pathlib import Path
from app.importers.file_importer import FileImporter
from cpp_interface.umdf_interface import umdf_interface

async def test_import_and_write():
    """Test importing a file and writing to UMDF format."""
    print("Testing import and UMDF write...")
    
    # Sample FHIR Patient data
    fhir_data = {
        "resourceType": "Patient",
        "id": "example",
        "name": [
            {
                "use": "official",
                "given": ["John"],
                "family": "Doe"
            }
        ],
        "gender": "male",
        "birthDate": "1990-01-01",
        "telecom": [
            {
                "system": "phone",
                "value": "555-123-4567"
            },
            {
                "system": "email",
                "value": "john.doe@example.com"
            }
        ]
    }
    
    fhir_bytes = json.dumps(fhir_data).encode('utf-8')
    
    # Import FHIR data
    importer = FileImporter()
    result = await importer.import_file(
        content=fhir_bytes,
        filename="test_patient.json",
        file_type="fhir"
    )
    
    print("✓ FHIR import successful")
    print(f"  Schema: {result['schema_id']}")
    print(f"  Module: {result['module']['name']}")
    
    # Write to UMDF format
    modules = [result['module']]
    output_path = "test_output.umdf"
    
    success = umdf_interface.write_file(
        data={"modules": modules},
        output_path=output_path,
        access_mode="overwrite"
    )
    
    if success:
        print("✓ UMDF write successful")
        print(f"  Output: {output_path}")
    else:
        print("✗ UMDF write failed")
    
    # Test reading the UMDF file
    read_data = umdf_interface.read_file(output_path)
    if read_data:
        print("✓ UMDF read successful")
        print(f"  Data: {read_data}")
    else:
        print("✗ UMDF read failed")
    
    print()

async def test_cpp_schemas():
    """Test C++ schema integration."""
    print("Testing C++ schema integration...")
    
    schemas = umdf_interface.get_supported_schemas()
    print(f"✓ C++ schemas: {schemas}")
    
    # Test schema validation
    test_data = {
        "patient_id": "123",
        "name": "John Doe",
        "gender": "male",
        "birth_date": "1990-01-01"
    }
    
    is_valid = umdf_interface.validate_schema("patient", test_data)
    print(f"✓ Schema validation: {'PASS' if is_valid else 'FAIL'}")
    print()

async def test_umdf_interface():
    """Test the UMDF interface directly."""
    print("Testing UMDF interface...")
    
    # Test writing
    test_data = {
        "modules": [
            {
                "id": "test-module-1",
                "name": "Test Patient",
                "schema_id": "patient",
                "data": {
                    "patient_id": "123",
                    "name": "John Doe",
                    "gender": "male"
                },
                "metadata": {
                    "source": "test",
                    "created_at": "2024-01-01"
                }
            }
        ],
        "metadata": {
            "created_by": "test",
            "version": "1.0.0"
        }
    }
    
    success = umdf_interface.write_file(
        data=test_data,
        output_path="test_interface.umdf",
        access_mode="overwrite"
    )
    
    if success:
        print("✓ Interface write successful")
        
        # Test reading
        read_data = umdf_interface.read_file("test_interface.umdf")
        if read_data:
            print("✓ Interface read successful")
            print(f"  Read data: {json.dumps(read_data, indent=2)}")
        else:
            print("✗ Interface read failed")
    else:
        print("✗ Interface write failed")
    
    print()

async def main():
    """Run all integration tests."""
    print("Medical File Format UI - C++ Integration Tests")
    print("=" * 50)
    
    await test_import_and_write()
    await test_cpp_schemas()
    await test_umdf_interface()
    
    print("All integration tests completed!")

if __name__ == "__main__":
    asyncio.run(main()) 