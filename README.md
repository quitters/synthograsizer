# Synthograsizer V3

A powerful interactive creativity tool for manipulating text prompts using a synthesizer-like interface. This version combines the best of the backend from `Synthograsizer` and the modern frontend from `SynthograsizerV2`.

## Features

- Real-time prompt manipulation with interactive knobs
- Multiple operation modes (Discrete, Continuous, Variable Management)
- Support for regular and negative prompts
- Variable weight management
- State saving and loading
- WebSocket-based real-time updates
- Modern Vue.js frontend with node-based editor
- Dark and light theme support
- Notification system for user feedback

## Quick Start

The easiest way to run Synthograsizer V3 is using the provided run script:

```bash
# Activate your virtual environment first
python run.py
```

This will start the backend server and open a browser window with the application.

## Installation

### Backend
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/synthograsizer.git
   cd synthograsizer
   ```

2. Create a virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the backend server:
   ```bash
   uvicorn app.main:app --reload
   ```

### Frontend
1. Navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. For development:
   ```bash
   npm run dev
   ```

4. For production build:
   ```bash
   npm run build
   ```

## Project Structure

```
synthograsizer/
├── app/                    # Backend application
│   ├── api/                # API routes
│   │   └── routes.py       # API endpoints
│   ├── core/               # Core functionality
│   │   └── state_manager.py # State management
│   ├── models/             # Data models
│   │   ├── knob.py         # Knob models
│   │   ├── variable.py     # Variable models
│   │   └── processing.py   # Text processing models
│   ├── processors.py       # Text processors
│   └── main.py             # Main application entry
├── frontend/               # Frontend application
│   ├── components/         # Vue components
│   ├── modules/            # JavaScript modules
│   │   ├── api.js          # API service
│   │   └── websocket.js    # WebSocket service
│   ├── store/              # Vuex store
│   │   └── modules/        # Store modules
│   ├── assets/             # Assets
│   │   └── styles/         # CSS styles
│   └── main.js             # Frontend entry point
├── run.py                  # Run script
└── requirements.txt        # Backend dependencies
```

## Usage Guide

### Node Editor

The node editor allows you to create and connect different types of nodes:

1. **Variable Nodes**: Create and manipulate variables with different types (number, boolean, color)
2. **Text Nodes**: Input text that can be processed and transformed
3. **Text Transform Nodes**: Apply transformations to text inputs

### Prompt Processing

The prompt processor panel allows you to:

1. Enter your text prompt
2. Process it using the variables and transformations from the node editor
3. Copy the processed prompt to clipboard
4. Send the prompt to external generators

### Settings

The settings panel provides options to:

1. Switch between light and dark themes
2. Manage WebSocket connection
3. Save and load application states

## WebSocket API

The application uses WebSockets for real-time communication. The following message types are supported:

- `initial_state`: Sent when a client connects, contains the current application state
- `state_update`: Sent when the state changes, contains the updated state
- `process_prompt`: Request to process a prompt with the current variables
- `prompt_result`: Result of prompt processing
- `mode_update`: Notification of mode change

## REST API

The application provides a REST API for various operations:

- `GET /api/state/list`: Get a list of saved states
- `POST /api/state/save`: Save the current state
- `POST /api/state/load`: Load a saved state
- `POST /api/state/delete`: Delete a saved state
- `POST /api/knob/update`: Update a knob's value and mode
- `POST /api/prompt/update`: Update the current prompt
- `POST /api/process-prompt`: Process a prompt with specified processors

## Contributing

Contributions are welcome! Please follow the guidelines in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
