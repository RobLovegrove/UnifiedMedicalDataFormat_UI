# Medical File Format UI

A schema-driven medical file format with a Python-based UI for viewing and importing medical data, integrated with a C++ reader/writer for the UMDF (Unified Medical Data Format).

## 🎯 Features

- **Schema-driven UI**: Dynamically generates UI based on JSON schemas
- **Multi-format import**: Support for FHIR JSON, DICOM, and image files
- **Cross-language compatibility**: Python UI working with C++ reader/writer
- **Extensible format**: Polymorphic design for various medical data types
- **Real UMDF integration**: Uses your C++ binary format for actual file storage

## 🏗️ Architecture

```
UMDF_UI/                          # Python UI Application
├── app/                          # FastAPI web application
│   ├── main.py                   # Main application with C++ integration
│   ├── models/                   # Pydantic data models
│   ├── schemas/                  # JSON schema management
│   ├── importers/                # File import handlers (FHIR, DICOM, images)
│   └── templates/                # HTML templates
├── cpp_interface/                # C++ Integration Layer
│   ├── umdf_interface.py         # Python-C++ bridge
│   ├── umdf_python_interface.cpp # C interface for Python
│   ├── CMakeLists.txt           # Build configuration
│   └── build.sh                 # Build script
└── ../UMDF/                     # Your C++ UMDF Implementation
    ├── src/                     # C++ source files
    ├── schemas/                 # JSON schema definitions
    └── umdf_tool               # CLI tool
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pip3 install -r requirements.txt
```

### 2. Build C++ Library (Optional)

To use the real C++ UMDF implementation:

```bash
cd cpp_interface
./build.sh
```

This will compile your C++ code as a shared library for Python integration.

### 3. Start the Web UI

```bash
C
```

Or directly with uvicorn:

```bash
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 4. Access the Application

- **Main UI**: http://127.0.0.1:8000
- **API Docs**: http://127.0.0.1:8000/docs
- **Import Page**: http://127.0.0.1:8000/import

## 📁 File Format Integration

### Your C++ UMDF Format

Your C++ implementation provides:
- **Binary format** with header, modules, and cross-reference table
- **Schema-driven** modules (patient, image data)
- **Polymorphic design** with different module types
- **UUID-based** module identification

### Python-C++ Bridge

The integration layer provides:
- **Mock implementation** for testing (works without C++ compilation)
- **Real C++ integration** when library is compiled
- **Schema synchronization** between Python UI and C++ schemas
- **File format validation** and error handling

## 🔧 Usage Examples

### Import FHIR Data

1. Go to http://127.0.0.1:8000/import
2. Upload a FHIR JSON file
3. The system will:
   - Parse the FHIR data
   - Map to appropriate schema (patient, lab results, etc.)
   - Validate against schema
   - Prepare for UMDF storage

### Write to UMDF Format

```python
from cpp_interface.umdf_interface import umdf_interface

# Write modules to UMDF file
success = umdf_interface.write_file(
    data={"modules": [module_data]},
    output_path="patient_data.umdf",
    access_mode="overwrite"
)
```

### Read from UMDF Format

```python
# Read UMDF file
data = umdf_interface.read_file("patient_data.umdf")
if data:
    print("File read successfully:", data)
```

## 🧪 Testing

### Test Import Functionality

```bash
python3 test_import.py
```

### Test C++ Integration

```bash
python3 test_integration.py
```

## 📊 Supported Formats

| Format | Description | Schema Mapping |
|--------|-------------|----------------|
| **FHIR JSON** | Patient data, observations, medications | Auto-detects resource type |
| **DICOM** | Medical imaging files | Maps to imaging schema |
| **Images** | JPEG, PNG medical images | Maps to imaging schema |

## 🔄 Schema System

### Default Schemas

- **Patient**: Demographics, contact info, metadata
- **Imaging**: Medical images with modality, dimensions, metadata
- **Lab Results**: Test results with values, units, reference ranges
- **Medication**: Prescriptions with dosage, frequency, instructions

### Schema Structure

```json
{
  "id": "patient",
  "name": "Patient Information",
  "schema": {
    "type": "object",
    "properties": {
      "id": {"type": "string"},
      "name": {"type": "string"},
      "gender": {"type": "string", "enum": ["male", "female", "other"]}
    }
  }
}
```

## 🛠️ Development

### Adding New Schemas

1. Create JSON schema in `app/schemas/definitions/`
2. Update schema manager with new schema
3. UI will automatically support the new data type

### Extending C++ Integration

1. Add new functions to `umdf_python_interface.cpp`
2. Update function signatures in `umdf_interface.py`
3. Rebuild with `./build.sh`

### API Endpoints

- `GET /api/schemas` - Get available schemas
- `GET /api/schema/{id}` - Get specific schema
- `POST /import/file` - Import file (FHIR, DICOM, image)
- `POST /write/umdf` - Write to UMDF format
- `GET /read/umdf/{path}` - Read UMDF file

## 🔍 Troubleshooting

### C++ Library Not Found

If you see "Warning: UMDF library not found", the system will use the mock implementation. To use the real C++ implementation:

1. Ensure you have CMake installed
2. Run `cd cpp_interface && ./build.sh`
3. Restart the Python application

### Import Errors

- Check file format is supported (FHIR JSON, DICOM, JPEG, PNG)
- Verify JSON syntax for FHIR files
- Ensure DICOM files are valid

### Schema Validation

- All imported data is validated against schemas
- Invalid data will be rejected with error messages
- Check schema requirements in the UI

## 🎯 Next Steps

1. **Compile C++ Library**: Run `./build.sh` in `cpp_interface/`
2. **Test Real Integration**: Import files and verify UMDF output
3. **Extend Schemas**: Add new medical data types
4. **Enhance UI**: Add more visualization features
5. **Production Deployment**: Configure for production use

## 📝 License

This project integrates with your UMDF C++ implementation. The Python UI is designed to work with your binary format while providing a modern web interface for medical data management. 