# Traklet Bug Reporter - Chrome Extension

A Chrome extension that makes it easy for end-users to submit detailed bug reports with screenshots, console logs, and diagnostic information.

## Features

- **One-Click Screenshot Capture**: Instantly capture the visible tab
- **Console Log Collection**: Automatically captures console.log, warn, error, info, and debug messages
- **JavaScript Error Tracking**: Catches uncaught errors and unhandled promise rejections
- **Network Error Detection**: Tracks failed network requests via Performance API
- **User Action Tracking**: Records recent click interactions for context
- **Performance Metrics**: Collects page load times, First Contentful Paint, and memory usage
- **Environment Info**: Browser, viewport, screen size, URL, timezone, and more
- **DOM State Snapshot**: Active element, open dialogs, forms, and document state
- **Keyboard Shortcut**: Quick capture with `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac)
- **Local Storage**: Reports saved locally until submitted
- **Traklet Integration**: Submit directly to your Traklet-powered issue tracker

## Installation

### From Source (Development)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the `extensions/chrome-reporter` directory
6. The Traklet icon should appear in your toolbar

### From Chrome Web Store

*Coming soon*

## Usage

### Quick Capture

1. Click the Traklet icon in your toolbar (or press `Ctrl+Shift+B`)
2. A screenshot is automatically captured
3. Add a description of the issue
4. Select severity and category
5. Choose what diagnostic info to include
6. Click **Submit Report**

### Configuration

1. Click the gear icon in the extension popup
2. Enter your Traklet endpoint URL (where your Traklet widget is hosted)
3. Optionally add an API token for authenticated submissions
4. Set a default project ID
5. Click **Save**

### Context Menu

Right-click on any page and select **Report Bug with Traklet** to quickly capture a report. If you have text selected, it will be included in the description.

## Collected Data

The extension collects the following information (all optional):

### Environment
- URL, origin, pathname
- Browser user agent
- Viewport and screen dimensions
- Device pixel ratio
- Language and timezone
- Online/offline status

### Performance
- Page load time
- DOM content loaded time
- First Contentful Paint
- JS heap memory usage
- Resource count

### Console Logs (last 100)
- Log level (log, warn, error, info, debug)
- Message content
- Timestamp
- Source URL

### JavaScript Errors (last 50)
- Error message
- Filename and line/column number
- Stack trace
- Timestamp

### Network Errors (last 20)
- Request URL
- Initiator type
- Duration
- Timestamp

### User Actions (last 20)
- Action type (click)
- Target element info (tag, id, class)
- Timestamp

### DOM Snapshot
- Form elements (without values)
- Open dialogs/modals
- Active element
- Document ready state

## Privacy

- **No automatic data transmission**: Data only leaves your browser when you explicitly submit a report
- **Form values excluded**: Form field values are never captured
- **Text truncation**: Long messages are truncated to prevent excessive data collection
- **Local storage**: Reports are stored locally in Chrome storage until submitted or deleted
- **User control**: Toggle which data types to include in each report

## API Integration

The extension can submit reports to any Traklet-compatible endpoint. The report format:

```json
{
  "id": "bug-1234567890-abc123",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "screenshot": "data:image/png;base64,...",
  "userDescription": "The button doesn't work",
  "severity": "medium",
  "category": "bug",
  "diagnostics": {
    "environment": { ... },
    "performance": { ... },
    "consoleLogs": [ ... ],
    "jsErrors": [ ... ],
    "networkErrors": [ ... ],
    "userActions": [ ... ],
    "domSnapshot": { ... }
  }
}
```

## Development

### File Structure

```
chrome-reporter/
├── manifest.json          # Extension manifest (Manifest V3)
├── background/
│   └── service-worker.js  # Background service worker
├── content/
│   └── collector.js       # Content script for data collection
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.css          # Popup styles
│   └── popup.js           # Popup logic
└── assets/
    ├── icon-16.svg
    ├── icon-48.svg
    └── icon-128.svg
```

### Building

No build step required - the extension runs directly from source.

### Testing

1. Load the extension in Chrome (see Installation)
2. Navigate to any webpage
3. Click the extension icon
4. Verify screenshot capture works
5. Check that diagnostic info is populated
6. Test submit functionality

## Permissions

The extension requires these permissions:

- `activeTab`: Capture screenshots of the current tab
- `scripting`: Inject content scripts for data collection
- `storage`: Save reports and configuration locally
- `tabs`: Access tab information for screenshot capture
- `<all_urls>`: Run content script on all pages

## License

MIT License - see the main Traklet repository for details.
