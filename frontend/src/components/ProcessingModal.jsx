import React from 'react';
import './ProcessingModal.css';

const ProcessingModal = ({ isVisible, fileName, fileSize, fileType = 'UMDF' }) => {
  if (!isVisible) return null;

  // Helper function to format file size
  const formatFileSize = (size) => {
    if (!size) return 'Unknown';
    const bytes = parseInt(size);
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="processing-modal-overlay">
      <div className="processing-modal">
        <div className="processing-modal-content">
          <div className="text-center">
            <div className="spinner-border text-primary mb-4" role="status" style={{width: '3rem', height: '3rem'}}>
              <span className="visually-hidden">Loading...</span>
            </div>
            <h4 className="text-primary mb-3">Processing File</h4>
            
            {/* File Details Box */}
            <div className="file-details-box mb-3">
              <div className="row text-start">
                <div className="col-12">
                  <div className="d-flex align-items-center mb-2">
                    <i className="fas fa-file me-2 text-primary"></i>
                    <strong className="text-dark">{fileName || 'Unknown file'}</strong>
                  </div>
                  <div className="row">
                    <div className="col-6">
                      <small className="text-muted d-block">
                        Size: {formatFileSize(fileSize)}
                      </small>
                    </div>
                    <div className="col-6">
                      <small className="text-muted d-block">
                        Type: {fileType}
                      </small>
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

export default ProcessingModal; 