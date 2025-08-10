import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showFileInfo, setShowFileInfo] = useState(false);

  const handleFileSelect = () => {
    // Trigger the hidden file input
    fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      
      if (file.name.toLowerCase().endsWith('.umdf')) {
        // For UMDF files, redirect to viewer with file data
        const fileData = {
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified
        };
        
        // Store file info in sessionStorage for the viewer
        sessionStorage.setItem('umdf_file_name', file.name);
        sessionStorage.setItem('umdf_file_size', file.size.toString());
        sessionStorage.setItem('umdf_file_last_modified', file.lastModified.toString());
        
        // Store the actual file object for processing
        // Convert file to base64 for storage (sessionStorage can't store File objects directly)
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = reader.result;
          sessionStorage.setItem('umdf_file_data', base64Data);
          sessionStorage.setItem('umdf_file_ready', 'true');
          // Navigate to viewer after file is loaded
          navigate('/umdf-viewer');
        };
        reader.readAsDataURL(file);
      } else {
        // For non-UMDF files, show file info on this page
        setShowFileInfo(true);
      }
    }
  };

  const clearFileSelection = () => {
    setSelectedFile(null);
    setShowFileInfo(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="home-page">
      <div className="header-section">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12 text-center py-4">
              <h1 className="header-logo mb-0">
                <i className="fas fa-heartbeat me-3"></i>
                Medical File Format
              </h1>
            </div>
          </div>
        </div>
      </div>
      
      <div className="main-content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <div className="d-flex align-items-center justify-content-center" style={{minHeight: '70vh'}}>
                <div className="card" style={{minWidth: '500px'}}>
                  <div className="card-body text-center p-5">
                    <div className="py-5">
                      <div className="d-flex justify-content-center mb-4">
                        <button 
                          className="btn btn-primary btn-lg px-5 py-3" 
                          onClick={handleFileSelect}
                        >
                          <i className="fas fa-upload me-2"></i>Import File
                        </button>
                      </div>
                      
                      {/* Hidden file input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                        accept=".umdf,.dcm,.dicom,.jpg,.jpeg,.png,.tiff,.bmp,.fhir,.json"
                      />
                      
                      {/* File Information Display */}
                      {showFileInfo && selectedFile && (
                        <div className="file-info mt-4">
                          <div className="card border-primary">
                            <div className="card-header bg-primary text-white">
                              <h6 className="mb-0">
                                <i className="fas fa-file me-2"></i>
                                File Information
                              </h6>
                            </div>
                            <div className="card-body">
                              <div className="row text-start">
                                <div className="col-md-6">
                                  <p className="mb-2">
                                    <strong>Name:</strong> {selectedFile.name}
                                  </p>
                                  <p className="mb-2">
                                    <strong>Size:</strong> {formatFileSize(selectedFile.size)}
                                  </p>
                                </div>
                                <div className="col-md-6">
                                  <p className="mb-2">
                                    <strong>Type:</strong> {selectedFile.type || 'Unknown'}
                                  </p>
                                  <p className="mb-2">
                                    <strong>Modified:</strong> {formatDate(selectedFile.lastModified)}
                                  </p>
                                </div>
                              </div>
                              <div className="text-center mt-3">
                                <button 
                                  className="btn btn-outline-secondary btn-sm me-2"
                                  onClick={clearFileSelection}
                                >
                                  <i className="fas fa-times me-1"></i>Clear
                                </button>
                                <span className="text-muted">
                                  <i className="fas fa-info-circle me-1"></i>
                                  This file type is not yet supported for processing
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="mt-3">
                        <h6 className="text-muted">Supported Formats</h6>
                        <div className="row justify-content-center">
                          <div className="col-auto">
                            <span className="badge bg-primary me-2">UMDF</span>
                            <span className="badge bg-info me-2">DICOM</span>
                            <span className="badge bg-success me-2">FHIR</span>
                            <span className="badge bg-warning me-2">Images</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage; 