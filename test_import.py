#!/usr/bin/env python3
"""
Test script for the medical file format import functionality
"""

import json
import asyncio
from app.importers.file_importer import FileImporter

async def test_fhir_import():
    """Test FHIR JSON import."""
    print("Testing FHIR import...")
    
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
    
    importer = FileImporter()
    result = await importer.import_file(
        content=fhir_bytes,
        filename="test_patient.json",
        file_type="fhir"
    )
    
    print("✓ FHIR import successful")
    print(f"  Schema: {result['schema_id']}")
    print(f"  Module: {result['module']['name']}")
    print(f"  Data: {result['module']['data']}")
    print()

async def test_schema_validation():
    """Test schema validation."""
    print("Testing schema validation...")
    
    from app.schemas.schema_manager import SchemaManager
    
    schema_manager = SchemaManager()
    
    # Test patient data
    patient_data = {
        "id": "123",
        "name": "John Doe",
        "dateOfBirth": "1990-01-01",
        "gender": "male",
        "contact": {
            "phone": "555-123-4567",
            "email": "john@example.com"
        }
    }
    
    is_valid = schema_manager.validate_data("patient", patient_data)
    print(f"✓ Patient data validation: {'PASS' if is_valid else 'FAIL'}")
    
    # Test invalid data
    invalid_data = {
        "id": "123",
        # Missing required 'name' field
        "gender": "invalid_gender"  # Not in enum
    }
    
    is_valid = schema_manager.validate_data("patient", invalid_data)
    print(f"✓ Invalid data validation: {'FAIL' if not is_valid else 'PASS'}")
    print()

async def main():
    """Run all tests."""
    print("Medical File Format UI - Import Tests")
    print("=" * 40)
    
    await test_fhir_import()
    await test_schema_validation()
    
    print("All tests completed!")

if __name__ == "__main__":
    asyncio.run(main()) 