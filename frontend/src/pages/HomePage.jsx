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

  // Check if File System Access API is available
  const isFileSystemAccessSupported = 'showOpenFilePicker' in window;

  // Get file with path using File System Access API if available
  const getFileWithPath = async () => {
    if (!isFileSystemAccessSupported) {
      return null; // Fall back to regular file input
    }

    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'UMDF Files',
            accept: {
              'application/octet-stream': ['.umdf'],
              'application/x-umdf': ['.umdf']
            }
          }
        ],
        multiple: false
      });

      const file = await fileHandle.getFile();
      
      // Debug: see what methods are available on fileHandle
      console.log('🔍 FileHandle methods:', Object.getOwnPropertyNames(fileHandle));
      console.log('🔍 FileHandle prototype methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(fileHandle)));
      
      // Explore all possible ways to get the file path
      console.log('🔍 FileHandle object:', fileHandle);
      console.log('🔍 FileHandle properties:', Object.getOwnPropertyNames(fileHandle));
      console.log('🔍 FileHandle descriptor:', Object.getOwnPropertyDescriptor(fileHandle, 'path'));
      console.log('🔍 FileHandle prototype chain:', Object.getPrototypeOf(fileHandle));
      
      // Since File System Access API can't give us the full path, construct it
      // For local prototype: assume files are in the UMDF projects directory
      let filePath;
      try {
        // Get the current working directory or use a known path
        // For now, let's use a hardcoded path to your UMDF projects directory
        const umdfProjectsDir = '/Users/rob/Documents/CS/Dissertation/UMDF'; // Adjust this path as needed
        
        // Construct the full file path
        filePath = `${umdfProjectsDir}/${file.name}`;
        console.log('🔍 Constructed file path:', filePath);
        console.log('🔍 Using UMDF projects directory:', umdfProjectsDir);
        
      } catch (pathError) {
        console.log('Could not construct file path, using filename:', pathError);
        filePath = file.name;
      }
      
      console.log('📁 File selected with path:', filePath);
      
      return { file, filePath };
    } catch (error) {
      console.log('File System Access API not available or user cancelled:', error);
      return null;
    }
  };

  // Check if user has already logged in
  useEffect(() => {
    const storedUsername = sessionStorage.getItem('umdf_username');
    const storedPassword = sessionStorage.getItem('umdf_password');
    
    if (!storedUsername || !storedPassword) {
      setShowLoginModal(true);
    }
  }, []);

  // Check authentication status with backend
  useEffect(() => {
    const checkAuthWithBackend = async () => {
      try {
        const response = await fetch('/api/check-auth');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (!result.authenticated) {
          console.log('🔒 Backend authentication lost - showing login modal');
          // Clear session storage since backend has no credentials
          sessionStorage.removeItem('umdf_username');
          sessionStorage.removeItem('umdf_password');
          setShowLoginModal(true);
        } else {
          console.log('✅ Backend authentication confirmed');
          // If backend has credentials but frontend doesn't, sync them
          const storedUsername = sessionStorage.getItem('umdf_username');
          const storedPassword = sessionStorage.getItem('umdf_password');
          
          if (!storedUsername || !storedPassword) {
            console.log('🔄 Syncing frontend credentials with backend');
            // We can't get the actual password from backend for security, so just show login modal
            setShowLoginModal(true);
          }
        }
      } catch (error) {
        console.error('❌ Error checking backend authentication:', error);
        // If we can't reach the backend, assume authentication is lost
        console.log('🔒 Cannot reach backend - showing login modal');
        sessionStorage.removeItem('umdf_username');
        sessionStorage.removeItem('umdf_password');
        setShowLoginModal(true);
      }
    };

    // Check auth immediately
    checkAuthWithBackend();
    
    // Check auth every 30 seconds
    const authInterval = setInterval(checkAuthWithBackend, 30000);
    
    return () => clearInterval(authInterval);
  }, []);

  const handleLogin = async () => {
    if (username.trim() && password.trim()) {
      try {
        // Store credentials in backend
        const formData = new FormData();
        formData.append('username', username.trim());
        formData.append('password', password);
        
        const response = await fetch('/api/store-credentials', {
          method: 'POST',
          body: formData
        });
        
        if (response.ok) {
          // Store credentials in session storage for frontend use
          sessionStorage.setItem('umdf_username', username.trim());
          sessionStorage.setItem('umdf_password', password);
          setShowLoginModal(false);
          console.log('✅ Credentials stored successfully in backend');
        } else {
          console.error('❌ Failed to store credentials in backend');
          // Still store in session storage as fallback
          sessionStorage.setItem('umdf_username', username.trim());
          sessionStorage.setItem('umdf_password', password);
          setShowLoginModal(false);
        }
      } catch (error) {
        console.error('❌ Error storing credentials:', error);
        // Fallback to session storage only
        sessionStorage.setItem('umdf_username', username.trim());
        sessionStorage.setItem('umdf_password', password);
        setShowLoginModal(false);
      }
    }
  };

  const handleLogout = async () => {
    try {
      // Clear credentials from backend
      const response = await fetch('/api/logout', {
        method: 'POST'
      });
      
      if (response.ok) {
        console.log('✅ Successfully logged out from backend');
      } else {
        console.warn('⚠️ Failed to logout from backend, but continuing with frontend logout');
      }
    } catch (error) {
      console.warn('⚠️ Error during backend logout:', error);
    }
    
    // Clear credentials from session storage
    sessionStorage.removeItem('umdf_username');
    sessionStorage.removeItem('umdf_password');
    setShowLoginModal(true);
  };

  const handleFileSelect = async () => {
    // Check if user is logged in
    const storedUsername = sessionStorage.getItem('umdf_username');
    const storedPassword = sessionStorage.getItem('umdf_password');
    
    if (!storedUsername || !storedPassword) {
      setShowLoginModal(true);
      return;
    }
    
    // Try to use File System Access API first
    if (isFileSystemAccessSupported) {
      console.log('🔍 File System Access API is supported, attempting to use it...');
      try {
        const result = await getFileWithPath();
        if (result) {
          console.log('✅ File System Access API succeeded:', result);
          const { file, filePath } = result;
          handleFileWithPath(file, filePath);
          return;
        } else {
          console.log('❌ File System Access API returned no result');
        }
      } catch (error) {
        console.error('❌ File System Access API failed:', error);
      }
    } else {
      console.log('❌ File System Access API not supported');
    }
    
    console.log('🔄 Falling back to regular file input...');
    // Fall back to regular file input
    fileInputRef.current.click();
  };

  const handleFileWithPath = (file, filePath) => {
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
      
      // Store the file path for editing
      sessionStorage.setItem('umdf_file_path', filePath);
      console.log('📁 Stored file path for editing:', filePath);
      
      // Store file metadata only (not the file data itself)
      sessionStorage.setItem('umdf_file_ready', 'true');
      sessionStorage.setItem('umdf_file_name', file.name);
      sessionStorage.setItem('umdf_file_size', file.size.toString());
      sessionStorage.setItem('umdf_file_last_modified', file.lastModified.toString());
      // Navigate to viewer - the file will be passed directly
      navigate('/umdf-viewer', { state: { file: file } });
    } else {
      // For non-UMDF files, show file info on this page
      setShowFileInfo(true);
    }
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
        
        // Store the filename as fallback for editing (regular file input can't get full path)
        sessionStorage.setItem('umdf_file_path', file.name);
        console.log('📁 Stored filename as fallback for editing:', file.name);
        
        // Store file metadata only (not the file data itself)
        sessionStorage.setItem('umdf_file_ready', 'true');
        sessionStorage.setItem('umdf_file_name', file.name);
        sessionStorage.setItem('umdf_file_size', file.size.toString());
        sessionStorage.setItem('umdf_file_last_modified', file.lastModified.toString());
        // Navigate to viewer - the file will be passed directly
        navigate('/umdf-viewer', { state: { file: file } });
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
                          onClick={handleLogout}
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