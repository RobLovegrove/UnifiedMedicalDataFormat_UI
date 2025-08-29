import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showFileInfo, setShowFileInfo] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Check if user has already logged in
  useEffect(() => {
    const storedUsername = sessionStorage.getItem('umdf_username');
    const storedPassword = sessionStorage.getItem('umdf_password');
    
    if (!storedUsername || !storedPassword) {
      setShowLoginModal(true);
    }
  }, []);

  const handleLogin = () => {
    if (username.trim() && password.trim()) {
      // Store credentials in session storage
      sessionStorage.setItem('umdf_username', username.trim());
      sessionStorage.setItem('umdf_password', password);
      setShowLoginModal(false);
    }
  };

  const handleFileSelect = () => {
    // Check if user is logged in
    const storedUsername = sessionStorage.getItem('umdf_username');
    const storedPassword = sessionStorage.getItem('umdf_password');
    
    if (!storedUsername || !storedPassword) {
      setShowLoginModal(true);
      return;
    }
    
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
            <div className="col-12 py-4">
              <div className="d-flex justify-content-between align-items-center">
                <div className="text-center flex-grow-1">
                  <h1 className="header-logo mb-0">
                    <i className="fas fa-heartbeat me-3"></i>
                    Medical File Format
                  </h1>
                </div>
                
                {/* User Info at Far Right */}
                <div className="user-info-container">
                  {sessionStorage.getItem('umdf_username') && (
                    <div className="user-info-card">
                      <div className="d-flex align-items-center gap-2">
                        <small className="text-muted">
                          <i className="fas fa-user me-1"></i>
                          Logged in as: <strong>{sessionStorage.getItem('umdf_username')}</strong>
                        </small>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => {
                            sessionStorage.removeItem('umdf_username');
                            sessionStorage.removeItem('umdf_password');
                            setShowLoginModal(true);
                          }}
                        >
                          <i className="fas fa-sign-out-alt me-1"></i>
                          Change User
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
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

      {/* Login Modal */}
      {showLoginModal && (
        <div className="modal fade show" style={{display: 'block', zIndex: 1050}} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered" style={{zIndex: 1051}}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="fas fa-user-lock me-2"></i>
                  Authentication Required
                </h5>
              </div>
              <div className="modal-body">
                <p className="text-muted mb-3">
                  Please provide your credentials to access UMDF files. These will be used as the file author and password for encrypted files.
                </p>
                <div className="mb-3">
                  <label htmlFor="username" className="form-label">Username</label>
                  <input
                    type="text"
                    className="form-control"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    autoFocus
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="password" className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-control"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleLogin}
                  disabled={!username.trim() || !password.trim()}
                >
                  <i className="fas fa-sign-in-alt me-2"></i>
                  Login
                </button>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" style={{zIndex: 1049}}></div>
        </div>
      )}
    </div>
  );
};

export default HomePage; 