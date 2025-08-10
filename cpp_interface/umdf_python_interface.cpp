#include <string>
#include <iostream>
#include <fstream>
#include <nlohmann/json.hpp>

// Include your C++ headers
#include "../../UMDF/src/writer.hpp"
#include "../../UMDF/src/reader.hpp"

using json = nlohmann::json;

extern "C" {

// Write UMDF file from JSON data
bool write_umdf_file(const char* json_data, const char* output_path) {
    try {
        // Parse JSON data
        std::string json_str(json_data);
        json data = json::parse(json_str);
        
        // Create writer
        Writer writer;
        writer.setFileAccessMode(FileAccessMode::Overwrite);
        
        // Write the file
        std::string path(output_path);
        bool success = writer.writeNewFile(path);
        
        return success;
        
    } catch (const std::exception& e) {
        std::cerr << "Error writing UMDF file: " << e.what() << std::endl;
        return false;
    }
}

// Read UMDF file and return JSON data
bool read_umdf_file(const char* file_path) {
    try {
        // Create reader
        Reader reader;
        
        // Read the file
        std::string path(file_path);
        bool success = reader.readFile(path);
        
        return success;
        
    } catch (const std::exception& e) {
        std::cerr << "Error reading UMDF file: " << e.what() << std::endl;
        return false;
    }
}

// Get supported schemas
const char* get_supported_schemas() {
    // Return a JSON array of supported schema IDs
    static std::string schemas = R"(["patient", "imaging", "lab_results", "medication"])";
    return schemas.c_str();
}

// Validate data against schema
bool validate_schema(const char* schema_id, const char* json_data) {
    try {
        // Parse JSON data
        std::string json_str(json_data);
        json data = json::parse(json_str);
        
        // For now, just check if the data is valid JSON
        // TODO: Implement actual schema validation
        return true;
        
    } catch (const std::exception& e) {
        std::cerr << "Error validating schema: " << e.what() << std::endl;
        return false;
    }
}

} // extern "C" 