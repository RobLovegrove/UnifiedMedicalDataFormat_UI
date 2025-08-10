#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/functional.h>
#include <string>
#include <vector>
#include <map>

// Include your C++ headers
#include "../../UMDF/src/writer.hpp"
#include "../../UMDF/src/reader.hpp"

namespace py = pybind11;

// Python wrapper for Writer
class PyWriter {
private:
    Writer writer;
    
public:
    PyWriter() = default;
    
    bool writeNewFile(const std::string& filename) {
        return writer.writeNewFile(filename);
    }
    
    void setFileAccessMode(int mode) {
        FileAccessMode cppMode;
        switch (mode) {
            case 0: cppMode = FileAccessMode::FailIfExists; break;
            case 1: cppMode = FileAccessMode::AllowUpdate; break;
            case 2: cppMode = FileAccessMode::Overwrite; break;
            default: cppMode = FileAccessMode::FailIfExists; break;
        }
        writer.setFileAccessMode(cppMode);
    }
    
    int getFileAccessMode() const {
        FileAccessMode mode = writer.getFileAccessMode();
        switch (mode) {
            case FileAccessMode::FailIfExists: return 0;
            case FileAccessMode::AllowUpdate: return 1;
            case FileAccessMode::Overwrite: return 2;
            default: return 0;
        }
    }
};

// Python wrapper for Reader
class PyReader {
private:
    Reader reader;
    
public:
    PyReader() = default;
    
    bool readFile(const std::string& filename) {
        return reader.readFile(filename);
    }
    
    // TODO: Add methods to extract module data
    std::map<std::string, py::object> getModules() {
        // This would need to be implemented to extract module data
        // from the reader and return it as Python objects
        return {};
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
    m.doc() = "Python bindings for UMDF C++ reader/writer";
    
    // FileAccessMode enum
    py::enum_<FileAccessMode>(m, "FileAccessMode")
        .value("FAIL_IF_EXISTS", FileAccessMode::FailIfExists)
        .value("ALLOW_UPDATE", FileAccessMode::AllowUpdate)
        .value("OVERWRITE", FileAccessMode::Overwrite);
    
    // PyWriter class
    py::class_<PyWriter>(m, "Writer")
        .def(py::init<>())
        .def("write_new_file", &PyWriter::writeNewFile)
        .def("set_file_access_mode", &PyWriter::setFileAccessMode)
        .def("get_file_access_mode", &PyWriter::getFileAccessMode);
    
    // PyReader class
    py::class_<PyReader>(m, "Reader")
        .def(py::init<>())
        .def("read_file", &PyReader::readFile)
        .def("get_modules", &PyReader::getModules);
    
    // ModuleData class
    py::class_<ModuleData>(m, "ModuleData")
        .def(py::init<const std::string&, const std::string&>())
        .def_readwrite("id", &ModuleData::id)
        .def_readwrite("schema_id", &ModuleData::schema_id)
        .def_readwrite("data", &ModuleData::data)
        .def_readwrite("metadata", &ModuleData::metadata);
} 