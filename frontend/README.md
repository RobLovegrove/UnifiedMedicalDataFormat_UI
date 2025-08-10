# UMDF UI - React Frontend

This is the React frontend for the UMDF UI application. It provides a modern, responsive interface for viewing and managing UMDF (Unified Medical Data Format) files.

## Features

- **File Upload**: Drag and drop or select UMDF files for processing
- **Module Viewer**: Display all modules within a UMDF file
- **Image Support**: Special handling for imaging modules with metadata display
- **Responsive Design**: Modern UI that works on desktop and mobile
- **Real-time Processing**: Instant file processing and display

## Development

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build
   ```

### Development Workflow

1. **FastAPI Backend**: Must be running on port 8000
2. **React Dev Server**: Runs on port 3000 with proxy to backend
3. **File Upload**: Files are sent to `/api/upload/umdf` endpoint
4. **Data Flow**: File data is stored in sessionStorage and passed to viewer

## Project Structure

```
frontend/
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/         # Page components
│   │   ├── HomePage.jsx
│   │   └── UMDFViewer.jsx
│   ├── App.jsx        # Main app component
│   ├── main.jsx       # React entry point
│   └── index.css      # Global styles
├── public/             # Static assets
├── package.json        # Dependencies and scripts
└── vite.config.js      # Vite configuration
```

## API Integration

The frontend communicates with the FastAPI backend through:

- `POST /api/upload/umdf` - File upload and processing
- `GET /api/cpp/schemas` - Get available schemas
- `GET /api/modules/{file_id}` - Get modules for a file

## Styling

- Uses CSS modules for component-specific styles
- Responsive design with CSS Grid and Flexbox
- Consistent color scheme and typography
- Modern card-based layout

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+ 