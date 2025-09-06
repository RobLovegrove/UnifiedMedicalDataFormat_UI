#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/functional.h>
#include <pybind11/chrono.h>
#include <string>
#include <vector>
#include <map>
#include <expected>

// Include your C++ headers
#include "../../UMDF/src/writer.hpp"
#include "../../UMDF/src/reader.hpp"
#include "../../UMDF/src/Utility/uuid.hpp"
#include "../../UMDF/src/DataModule/ModuleData.hpp"
#include "../../UMDF/src/AuditTrail/auditTrail.hpp"

namespace py = pybind11;

// Python wrapper for Writer
class PyWriter {
private:
    Writer writer;
    
public:
    PyWriter() = default;
    
    Result createNewFile(const std::string& filename, const std::string& author, const std::string& password = "") {
        std::string filename_copy = filename;
        return writer.createNewFile(filename_copy, author, password);
    }
    
    Result openFile(const std::string& filename, const std::string& author, const std::string& password = "") {
        std::string filename_copy = filename;
        return writer.openFile(filename_copy, author, password);
    }
    
    Result updateModule(const std::string& moduleId, const ModuleData& module) {
        return writer.updateModule(moduleId, module);
    }
    
    std::expected<UUID, std::string> createNewEncounter() {
        return writer.createNewEncounter();
    }
    
    std::expected<UUID, std::string> addModuleToEncounter(const UUID& encounterId, const std::string& schemaPath, const ModuleData& module) {
        return writer.addModuleToEncounter(encounterId, schemaPath, module);
    }
    
    std::expected<UUID, std::string> addVariantModule(const UUID& parentModuleId, const std::string& schemaPath, const ModuleData& module) {
        return writer.addVariantModule(parentModuleId, schemaPath, module);
    }
    
    std::expected<UUID, std::string> addAnnotation(const UUID& parentModuleId, const std::string& schemaPath, const ModuleData& module) {
        return writer.addAnnotation(parentModuleId, schemaPath, module);
    }
    
    Result closeFile() {
        return writer.closeFile();
    }
};

// Python wrapper for Reader - matching UMDF project API
class PyReader {
private:
    Reader reader;
    
public:
    PyReader() = default;
    
    // Match the UMDF project API methods
    Result openFile(const std::string& filename, std::string password = "") {
        return reader.openFile(filename, password);
    }
    
    nlohmann::json getFileInfo() {
        return reader.getFileInfo();
    }
    
    std::expected<ModuleData, std::string> getModuleData(const std::string& moduleId) {
        return reader.getModuleData(moduleId);
    }
    
    std::expected<std::vector<ModuleTrail>, std::string> getAuditTrail(const UUID& moduleId) {
        return reader.getAuditTrail(moduleId);
    }
    
    std::expected<ModuleData, std::string> getAuditData(const ModuleTrail& module) {
        return reader.getAuditData(module);
    }
    
    Result closeFile() {
        return reader.closeFile();
    }
    
    // Additional convenience method for getting all modules
    std::map<std::string, py::object> getAllModules() {
        std::map<std::string, py::object> modules;
        try {
            auto fileInfo = reader.getFileInfo();
            // This would need to be implemented based on your specific needs
            // For now, return empty map
            return modules;
        } catch (const std::exception& e) {
            return modules;
        }
    }
};

// Module data structure for Python
struct ModuleData {
    std::string id;
    std::string schema_id;
    std::map<std::string, py::object> data;
    std::map<std::string, py::object> metadata;
    
    ModuleData(const std::string& id, const std::string& schema_id)
        : id(id), schema_id(schema_id) {}
};

PYBIND11_MODULE(umdf_cpp, m) {
    m.doc() = "Python bindings for UMDF C++ reader/writer - matching current API";
    
    // PyWriter class - updated to match current Writer API
    py::class_<PyWriter>(m, "Writer")
        .def(py::init<>())
        .def("create_new_file", &PyWriter::createNewFile)
        .def("openFile", &PyWriter::openFile)
        .def("update_module", &PyWriter::updateModule)
        .def("create_new_encounter", &PyWriter::createNewEncounter)
        .def("add_module_to_encounter", &PyWriter::addModuleToEncounter)
        .def("add_variant_module", &PyWriter::addVariantModule)
        .def("add_annotation", &PyWriter::addAnnotation)
        .def("closeFile", &PyWriter::closeFile);
    
    // PyReader class - matching UMDF project API
    py::class_<PyReader>(m, "Reader")
        .def(py::init<>())
        .def("openFile", &PyReader::openFile, "Open a UMDF file")
        .def("getFileInfo", &PyReader::getFileInfo, "Get file information")
        .def("getModuleData", &PyReader::getModuleData, "Get data for a specific module")
        .def("getAuditTrail", &PyReader::getAuditTrail, "Get audit trail for a module")
        .def("getAuditData", &PyReader::getAuditData, "Get audit data for a module")
        .def("closeFile", &PyReader::closeFile, "Close the currently open file")
        .def("getAllModules", &PyReader::getAllModules, "Get all modules from the file");
    
    // ModuleData class
    py::class_<ModuleData>(m, "ModuleData")
        .def(py::init<const std::string&, const std::string&>())
        .def_readwrite("id", &ModuleData::id)
        .def_readwrite("schema_id", &ModuleData::schema_id)
        .def_readwrite("data", &ModuleData::data)
        .def_readwrite("metadata", &ModuleData::metadata);
} 